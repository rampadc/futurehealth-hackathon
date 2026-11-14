#!/usr/bin/env python3
"""One-time owner-run, repeatable setup for the private Cloud Run deployment."""

import argparse
import hashlib
import json
import os
import re
import subprocess
import sys
import urllib.error
import urllib.request
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "cloud"))
import deploy  # noqa: E402

PROJECT = deploy.PROJECT
REGION = deploy.REGION
BUCKET = f"{PROJECT}-heat-safe-terraform"
MODULE = Path(__file__).resolve().parents[1] / "cloud"
REQUIRED_PERMISSIONS = frozenset({
    "resourcemanager.projects.getIamPolicy", "resourcemanager.projects.setIamPolicy",
    "serviceusage.services.enable", "storage.buckets.create",
    "artifactregistry.repositories.create", "artifactregistry.repositories.setIamPolicy",
    "cloudsql.instances.create", "cloudsql.users.update", "cloudsql.databases.create",
    "secretmanager.secrets.create", "secretmanager.secrets.setIamPolicy",
    "iam.serviceAccounts.create", "iam.serviceAccounts.setIamPolicy",
    "iam.roles.create", "iam.roles.update",
    "iam.workloadIdentityPools.create", "iam.workloadIdentityPoolProviders.create",
    "bigquery.datasets.setIamPolicy", "run.services.create", "run.services.setIamPolicy",
})


def command(*args, cwd=None, env=None, input_bytes=None, missing_ok=False):
    result = subprocess.run(args, cwd=cwd, env=env, input=input_bytes,
                            stdout=subprocess.PIPE, stderr=subprocess.PIPE)
    if result.returncode:
        error = result.stderr.decode(errors="replace")
        if missing_ok and re.search(r"NOT_FOUND|not found|does not exist|could not find", error, re.I):
            return None
        raise RuntimeError(f"{args[0]} {args[1] if len(args) > 1 else ''} failed (exit {result.returncode})")
    return result.stdout.decode().strip()


def tested_permissions(token):
    url = f"https://cloudresourcemanager.googleapis.com/v1/projects/{PROJECT}:testIamPermissions"
    request = urllib.request.Request(url, method="POST",
                                     data=json.dumps({"permissions": sorted(REQUIRED_PERMISSIONS)}).encode(),
                                     headers={"Authorization": f"Bearer {token}", "Content-Type": "application/json"})
    try:
        with urllib.request.urlopen(request, timeout=30) as response:
            return set(json.load(response).get("permissions", []))
    except urllib.error.HTTPError as error:
        raise RuntimeError(f"IAM permission check failed (HTTP {error.code})") from None


def preflight():
    active = command("gcloud", "auth", "list", "--filter=status:ACTIVE", "--format=value(account)")
    if not active or "\n" in active:
        raise RuntimeError("select one active gcloud account before bootstrap")
    if os.environ.get("GOOGLE_APPLICATION_CREDENTIALS"):
        raise RuntimeError("unset GOOGLE_APPLICATION_CREDENTIALS; use ADC for the same active gcloud account")
    configured = command("gcloud", "config", "get-value", "project")
    if configured != PROJECT:
        raise RuntimeError(f"gcloud configured project must be {PROJECT}")
    cli = tested_permissions(command("gcloud", "auth", "print-access-token"))
    missing_cli = sorted(REQUIRED_PERMISSIONS - cli)
    print(f"GCP bootstrap account: {active}; project: {PROJECT}")
    print("Missing CLI permissions: " + (", ".join(missing_cli) or "none"))
    adc = tested_permissions(command("gcloud", "auth", "application-default", "print-access-token"))
    missing_adc = sorted(REQUIRED_PERMISSIONS - adc)
    print("Missing ADC/Terraform permissions: " + (", ".join(missing_adc) or "none"))
    if missing_cli or missing_adc:
        raise RuntimeError("bootstrap IAM preflight failed before any mutation")


def ensure_secret(name, value):
    if not deploy.secret_exists(name):
        deploy.gcloud("secrets", "create", name, "--replication-policy", "user-managed",
                      "--locations", REGION, "--quiet")
    enabled = deploy.gcloud("secrets", "versions", "list", name,
                            "--filter=state:ENABLED", "--format=value(name)")
    if not enabled:
        deploy.gcloud("secrets", "versions", "add", name, "--data-file=-", "--quiet",
                      input_bytes=value.encode())
        return value
    return deploy.secret(name)


def set_postgres_password(password):
    token = command("gcloud", "auth", "print-access-token")
    url = f"https://sqladmin.googleapis.com/sql/v1beta4/projects/{PROJECT}/instances/{deploy.INSTANCE}/users?name=postgres"
    request = urllib.request.Request(url, method="PUT",
                                     data=json.dumps({"name": "postgres", "password": password}).encode(),
                                     headers={"Authorization": f"Bearer {token}", "Content-Type": "application/json"})
    try:
        with urllib.request.urlopen(request, timeout=30) as response:
            operation = json.load(response)
    except urllib.error.HTTPError as error:
        raise RuntimeError(f"Cloud SQL admin password setup failed (HTTP {error.code})") from None
    if operation.get("name"):
        deploy.gcloud("sql", "operations", "wait", operation["name"])


def sql_as(port, username, password, database, query):
    env = os.environ.copy()
    env.update(PGHOST="127.0.0.1", PGPORT=str(port), PGUSER=username,
               PGPASSWORD=password, PGDATABASE=database)
    return command("psql", "--no-psqlrc", "-X", "-A", "-t", "-v", "ON_ERROR_STOP=1",
                   env=env, input_bytes=query.encode())


def setup_database(admin_password, main_password, provisioner_password):
    if any(not re.fullmatch(r"[A-Za-z0-9_-]{32,128}", value)
           for value in (admin_password, main_password, provisioner_password)):
        raise RuntimeError("database credential has an invalid format")
    with deploy.sql_proxy() as port:
        for username, password, attributes in (
            ("heat_main", main_password, "LOGIN"),
            ("heat_preview_provisioner", provisioner_password, "LOGIN CREATEDB CREATEROLE"),
        ):
            if sql_as(port, "postgres", admin_password, "postgres",
                      f"SELECT 1 FROM pg_roles WHERE rolname = '{username}';") != "1":
                sql_as(port, "postgres", admin_password, "postgres",
                       f"CREATE ROLE {username} {attributes} PASSWORD '{password}';")
            else:
                sql_as(port, "postgres", admin_password, "postgres",
                       f"ALTER ROLE {username} {attributes} PASSWORD '{password}';")
        sql_as(port, "postgres", admin_password, "postgres",
               "REVOKE ALL ON DATABASE heat_safe_main FROM PUBLIC; "
               "GRANT CONNECT, CREATE, TEMP ON DATABASE heat_safe_main TO heat_main;")
        sql_as(port, "heat_main", main_password, "heat_safe_main",
               "CREATE SCHEMA IF NOT EXISTS app; CREATE SCHEMA IF NOT EXISTS adk;")
        sql_as(port, "postgres", admin_password, "postgres",
               "REVOKE CREATE ON DATABASE heat_safe_main FROM heat_main;")
        # The provisioner has no CONNECT grant on the main database.
        if sql_as(port, "postgres", admin_password, "postgres",
                  "SELECT has_database_privilege('heat_preview_provisioner', 'heat_safe_main', 'CONNECT');") != "f":
            raise RuntimeError("preview provisioner can connect to main database")


def github_vars(repository, outputs):
    values = {
        "GCP_PROJECT_ID": PROJECT,
        "GCP_REGION": REGION,
        "GCP_WIF_PROVIDER": outputs["wif_provider"]["value"],
        "GCP_MAIN_DEPLOY_SA": outputs["main_deployer"]["value"],
        "GCP_PREVIEW_DEPLOY_SA": outputs["preview_deployer"]["value"],
    }
    for name, value in values.items():
        command("gh", "variable", "set", name, "--repo", repository, "--body", value)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--check", action="store_true", help="check bootstrap permissions without changing cloud resources")
    args = parser.parse_args()
    preflight()
    if args.check:
        return
    repository = os.environ.get("GITHUB_REPOSITORY", "")
    if not re.fullmatch(r"[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+", repository):
        raise RuntimeError("set GITHUB_REPOSITORY=owner/repo")
    apis = ["artifactregistry.googleapis.com", "aiplatform.googleapis.com",
            "bigquery.googleapis.com", "iam.googleapis.com", "iamcredentials.googleapis.com",
            "run.googleapis.com", "secretmanager.googleapis.com", "sqladmin.googleapis.com",
            "sts.googleapis.com"]
    policy = json.loads(deploy.gcloud("projects", "get-iam-policy", PROJECT, "--format=json"))
    for binding in policy.get("bindings", []):
        if {"allUsers", "allAuthenticatedUsers"}.intersection(binding.get("members", [])):
            raise RuntimeError("project-level public IAM binding prevents proving private image visibility")
    deploy.gcloud("services", "enable", *apis, "--quiet")
    if command("gcloud", "storage", "buckets", "describe", f"gs://{BUCKET}",
               "--project", PROJECT, missing_ok=True) is None:
        command("gcloud", "storage", "buckets", "create", f"gs://{BUCKET}",
                "--project", PROJECT, "--location", REGION,
                "--uniform-bucket-level-access", "--public-access-prevention")
    command("gcloud", "storage", "buckets", "update", f"gs://{BUCKET}",
            "--project", PROJECT, "--versioning", "--public-access-prevention")
    bucket = json.loads(command("gcloud", "storage", "buckets", "describe", f"gs://{BUCKET}",
                                "--project", PROJECT, "--format=json"))
    iam = bucket.get("iamConfiguration", {})
    if (iam.get("publicAccessPrevention") != "enforced" or
            not iam.get("uniformBucketLevelAccess", {}).get("enabled") or
            not bucket.get("versioning", {}).get("enabled")):
        raise RuntimeError("Terraform state bucket is not private, uniform-access, and versioned")
    command("terraform", "init", "-input=false", f"-backend-config=bucket={BUCKET}",
            "-backend-config=prefix=heat-safe/cloud", cwd=MODULE)
    command("terraform", "apply", "-input=false", "-auto-approve",
            f"-var=github_repository={repository}", f"-var=project={PROJECT}",
            f"-var=region={REGION}", cwd=MODULE)
    outputs = json.loads(command("terraform", "output", "-json", cwd=MODULE))

    admin_password = ensure_secret("heat-safe-sql-admin-password", deploy.secrets.token_urlsafe(48))
    main_password = ensure_secret("heat-safe-main-db-password", deploy.secrets.token_urlsafe(48))
    provisioner_password = ensure_secret("heat-safe-sql-provisioner-password", deploy.secrets.token_urlsafe(48))
    if any(not re.fullmatch(r"[A-Za-z0-9_-]{32,128}", value)
           for value in (admin_password, main_password, provisioner_password)):
        raise RuntimeError("stored database credential has an invalid format")
    gate = ensure_secret("heat-safe-main-gate-code", deploy.secrets.token_urlsafe(24))
    presenter = ensure_secret("heat-safe-main-presenter-code", deploy.secrets.token_urlsafe(24))
    for name, code in (("heat-safe-main-gate-sha256", gate),
                       ("heat-safe-main-presenter-sha256", presenter)):
        expected = hashlib.sha256(code.encode()).hexdigest()
        if ensure_secret(name, expected) != expected:
            raise RuntimeError(f"stored digest does not match {name}")
    set_postgres_password(admin_password)
    setup_database(admin_password, main_password, provisioner_password)

    if deploy.gcloud("run", "services", "describe", deploy.MAIN_SERVICE,
                     "--region", REGION, missing_ok=True) is None:
        # Private placeholder gives the narrowly scoped main deployer an existing target.
        deploy.gcloud("run", "deploy", deploy.MAIN_SERVICE,
                      "--image", "us-docker.pkg.dev/cloudrun/container/hello",
                      "--region", REGION, "--service-account", deploy.MAIN_RUNTIME,
                      "--no-allow-unauthenticated", "--quiet")
    github_vars(repository, outputs)
    print("Cloud Run bootstrap complete; main placeholder is private until first app deployment")


if __name__ == "__main__":
    try:
        main()
    except (RuntimeError, ValueError, KeyError, json.JSONDecodeError) as error:
        sys.exit(str(error))
