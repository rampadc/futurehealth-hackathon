#!/usr/bin/env python3
"""One-time owner-run, repeatable setup for the private Cloud Run deployment."""

import argparse
import hashlib
import json
import os
import re
import subprocess
import sys
import tempfile
import urllib.error
import urllib.request
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "cloud"))
import deploy  # noqa: E402
from ci.verify import OWNER_ID, REPO_ID  # noqa: E402

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
    "bigquery.datasets.setIamPolicy", "run.services.create", "run.services.setIamPolicy",
})
KEY_PERMISSIONS = frozenset({"iam.serviceAccountKeys.create", "iam.serviceAccountKeys.delete"})
ENVIRONMENTS = (("heat-safe-main", "GCP_MAIN_DEPLOY_KEY", "main_deployer"),
                ("heat-safe-preview", "GCP_PREVIEW_DEPLOY_KEY", "preview_deployer"))


def command(*args, cwd=None, env=None, input_bytes=None, missing_ok=False):
    result = subprocess.run(args, cwd=cwd, env=env, input=input_bytes,
                            stdout=subprocess.PIPE, stderr=subprocess.PIPE)
    if result.returncode:
        error = result.stderr.decode(errors="replace")
        if missing_ok and re.search(r"NOT_FOUND|not found|does not exist|could not find", error, re.I):
            return None
        raise RuntimeError(f"{args[0]} {args[1] if len(args) > 1 else ''} failed (exit {result.returncode})")
    return result.stdout.decode().strip()


def tested_permissions(token, required):
    url = f"https://cloudresourcemanager.googleapis.com/v1/projects/{PROJECT}:testIamPermissions"
    request = urllib.request.Request(url, method="POST",
                                     data=json.dumps({"permissions": sorted(required)}).encode(),
                                     headers={"Authorization": f"Bearer {token}", "Content-Type": "application/json"})
    try:
        with urllib.request.urlopen(request, timeout=30) as response:
            return set(json.load(response).get("permissions", []))
    except urllib.error.HTTPError as error:
        raise RuntimeError(f"IAM permission check failed (HTTP {error.code})") from None


def preflight(create_keys=False):
    required = REQUIRED_PERMISSIONS | (KEY_PERMISSIONS if create_keys else frozenset())
    active = command("gcloud", "auth", "list", "--filter=status:ACTIVE", "--format=value(account)")
    if not active or "\n" in active:
        raise RuntimeError("select one active gcloud account before bootstrap")
    if os.environ.get("GOOGLE_APPLICATION_CREDENTIALS"):
        raise RuntimeError("unset GOOGLE_APPLICATION_CREDENTIALS; use ADC for the same active gcloud account")
    configured = command("gcloud", "config", "get-value", "project")
    if configured != PROJECT:
        raise RuntimeError(f"gcloud configured project must be {PROJECT}")
    cli = tested_permissions(command("gcloud", "auth", "print-access-token"), required)
    missing_cli = sorted(required - cli)
    print(f"GCP bootstrap account: {active}; project: {PROJECT}")
    print("Missing CLI permissions: " + (", ".join(missing_cli) or "none"))
    adc = tested_permissions(command("gcloud", "auth", "application-default", "print-access-token"), required)
    missing_adc = sorted(required - adc)
    print("Missing ADC/Terraform permissions: " + (", ".join(missing_adc) or "none"))
    if missing_cli or missing_adc:
        raise RuntimeError("bootstrap IAM preflight failed before any mutation")


def verify_state_bucket(bucket):
    # gcloud storage emits snake_case; the API's camelCase shape is accepted too.
    iam = bucket.get("iamConfiguration", {})
    pap = bucket.get("public_access_prevention", iam.get("publicAccessPrevention"))
    uniform = bucket.get("uniform_bucket_level_access", iam.get("uniformBucketLevelAccess", {}).get("enabled"))
    versioned = bucket.get("versioning_enabled", bucket.get("versioning", {}).get("enabled"))
    if pap != "enforced" or uniform is not True or versioned is not True:
        raise RuntimeError("Terraform state bucket is not private, uniform-access, and versioned")


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
        "GCP_MAIN_DEPLOY_SA": outputs["main_deployer"]["value"],
        "GCP_PREVIEW_DEPLOY_SA": outputs["preview_deployer"]["value"],
    }
    for name, value in values.items():
        command("gh", "variable", "set", name, "--repo", repository, "--body", value)


def github_api(repository, path, method="GET", payload=None):
    args = ("gh", "api", "--method", method,
            f"repos/{repository}" + (f"/{path}" if path else ""))
    if payload is not None:
        args += ("--input", "-")
    response = command(*args, input_bytes=json.dumps(payload).encode() if payload is not None else None)
    return json.loads(response) if response else {}


def environment_secrets(repository, environment):
    data = github_api(repository, f"environments/{environment}/secrets?per_page=100")
    secrets = data.get("secrets", [])
    if data.get("total_count") != len(secrets):
        raise RuntimeError(f"cannot verify all {environment} secrets")
    return {item["name"] for item in secrets}


def ensure_environment(repository, environment):
    path = f"environments/{environment}"
    github_api(repository, path, "PUT", {
        "deployment_branch_policy": {"protected_branches": False, "custom_branch_policies": True},
    })
    policy_path = f"{path}/deployment-branch-policies"
    data = github_api(repository, f"{policy_path}?per_page=100")
    policies = data.get("branch_policies", [])
    if data.get("total_count") != len(policies):
        raise RuntimeError(f"cannot verify all {environment} branch policies")
    if not any(item.get("name") == "main" and item.get("type") == "branch" for item in policies):
        github_api(repository, policy_path, "POST", {"name": "main", "type": "branch"})
        policies = github_api(repository, f"{policy_path}?per_page=100").get("branch_policies", [])
    for item in policies:
        if item.get("name") != "main" or item.get("type") != "branch":
            github_api(repository, f"{policy_path}/{item['id']}", "DELETE")
    environment_data = github_api(repository, path)
    branch_data = github_api(repository, f"{policy_path}?per_page=100")
    branches = branch_data.get("branch_policies", [])
    branch_policy = environment_data.get("deployment_branch_policy") or {}
    rules = environment_data.get("protection_rules", [])
    if (branch_policy.get("protected_branches") is not False or
            branch_policy.get("custom_branch_policies") is not True or
            branch_data.get("total_count") != 1 or len(branches) != 1 or
            branches[0].get("name") != "main" or branches[0].get("type") != "branch" or
            any(rule.get("type") in ("required_reviewers", "wait_timer") for rule in rules)):
        raise RuntimeError(f"{environment} is not restricted to branch main without approvals")


def validate_key(key_bytes, service_account):
    try:
        key = json.loads(key_bytes)
    except (UnicodeDecodeError, json.JSONDecodeError) as error:
        raise RuntimeError("invalid service account key JSON") from error
    if (not isinstance(key, dict) or key.get("type") != "service_account" or key.get("project_id") != PROJECT or
            key.get("client_email") != service_account or
            not isinstance(key.get("private_key_id"), str) or
            not re.fullmatch(r"[0-9a-f]{40}", key["private_key_id"]) or
            not isinstance(key.get("private_key"), str) or not key["private_key"]):
        raise RuntimeError("service account key does not match Terraform identity and project")
    return key["private_key_id"]


def upload_key(repository, environment, secret, service_account, key_bytes):
    validate_key(key_bytes, service_account)
    command("gh", "secret", "set", secret, "--repo", repository, "--env", environment,
            input_bytes=key_bytes)


def read_key_file(filename):
    path = Path(filename)
    if (not path.is_file() or path.is_symlink() or
            path.resolve().is_relative_to(Path(__file__).resolve().parents[2]) or
            path.stat().st_mode & 0o077):
        raise RuntimeError("service account key must be a private file outside the checkout")
    return path.read_bytes()


def github_deploy_keys(repository, outputs, key_files=None):
    for environment, _, _ in ENVIRONMENTS:
        ensure_environment(repository, environment)
    for environment, secret, output in ENVIRONMENTS:
        account = outputs[output]["value"]
        if not re.fullmatch(r"[a-z0-9-]+@[a-z0-9-]+\.iam\.gserviceaccount\.com", account):
            raise RuntimeError("invalid Terraform deploy service account output")
        if secret in environment_secrets(repository, environment):
            continue
        if key_files is not None:
            upload_key(repository, environment, secret, account, read_key_file(key_files[secret]))
            continue
        with tempfile.TemporaryDirectory(prefix="heat-safe-key-") as directory:
            path = Path(directory) / "key.json"
            command("gcloud", "iam", "service-accounts", "keys", "create", str(path),
                    "--iam-account", account, "--project", PROJECT, "--quiet")
            key_id = None
            try:
                path.chmod(0o600)
                key_bytes = path.read_bytes()
                try:
                    parsed = json.loads(key_bytes)
                    if (isinstance(parsed, dict) and isinstance(parsed.get("private_key_id"), str) and
                            re.fullmatch(r"[0-9a-f]{40}", parsed["private_key_id"])):
                        key_id = parsed["private_key_id"]
                except json.JSONDecodeError:
                    pass
                key_id = validate_key(key_bytes, account)
                upload_key(repository, environment, secret, account, key_bytes)
            except Exception:
                if key_id:
                    command("gcloud", "iam", "service-accounts", "keys", "delete", key_id,
                            "--iam-account", account, "--project", PROJECT, "--quiet")
                else:
                    raise RuntimeError(f"key upload failed; inspect and remove the new {account} key") from None
                raise


def repository_name():
    repository = os.environ.get("GITHUB_REPOSITORY", "")
    if not re.fullmatch(r"[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+", repository):
        raise RuntimeError("set GITHUB_REPOSITORY=owner/repo")
    data = github_api(repository, "")
    if (data.get("id") != REPO_ID or data.get("owner", {}).get("id") != OWNER_ID or
            data.get("private") is not True):
        raise RuntimeError("GitHub repository identity does not match the trusted deployment repository")
    return repository


def terraform_outputs():
    # Reconfigure avoids migrating any local state into the existing private backend.
    command("terraform", "init", "-input=false", "-reconfigure",
            f"-backend-config=bucket={BUCKET}", "-backend-config=prefix=heat-safe/cloud", cwd=MODULE)
    return json.loads(command("terraform", "output", "-json", cwd=MODULE))


def main():
    parser = argparse.ArgumentParser()
    mode = parser.add_mutually_exclusive_group()
    mode.add_argument("--check", action="store_true", help="check bootstrap permissions without changing cloud resources")
    mode.add_argument("--cloud-only", action="store_true", help="set up GCP resources without GitHub administration")
    mode.add_argument("--github-only", action="store_true", help="read existing private Terraform state and set GitHub variables and environment secrets")
    parser.add_argument("--presenter-member", help="explicit user:email IAM member allowed to retrieve raw access codes")
    parser.add_argument("--main-key-file", help="existing main deployer key for --github-only")
    parser.add_argument("--preview-key-file", help="existing preview deployer key for --github-only")
    args = parser.parse_args()
    if args.github_only and not (args.main_key_file and args.preview_key_file):
        parser.error("--github-only requires --main-key-file and --preview-key-file")
    if not args.github_only and (args.main_key_file or args.preview_key_file):
        parser.error("key files are accepted only with --github-only")
    if args.github_only:
        repository = repository_name()
        outputs = terraform_outputs()
        files = {"GCP_MAIN_DEPLOY_KEY": args.main_key_file,
                 "GCP_PREVIEW_DEPLOY_KEY": args.preview_key_file}
        for _, secret, output in ENVIRONMENTS:
            validate_key(read_key_file(files[secret]), outputs[output]["value"])
        github_deploy_keys(repository, outputs, files)
        github_vars(repository, outputs)
        print("GitHub deployment variables and environment secrets configured")
        return
    preflight(create_keys=not args.cloud_only)
    if args.check:
        return
    if not args.presenter_member or not re.fullmatch(r"user:[^@\s]+@[^@\s]+", args.presenter_member):
        raise RuntimeError("bootstrap requires --presenter-member=user:email@example.com")
    repository = repository_name() if not args.cloud_only else None
    apis = ["artifactregistry.googleapis.com", "aiplatform.googleapis.com",
            "bigquery.googleapis.com", "iam.googleapis.com",
            "run.googleapis.com", "secretmanager.googleapis.com", "sqladmin.googleapis.com",
            ]
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
    verify_state_bucket(bucket)
    command("terraform", "init", "-input=false", "-reconfigure",
            f"-backend-config=bucket={BUCKET}", "-backend-config=prefix=heat-safe/cloud", cwd=MODULE)
    command("terraform", "apply", "-input=false", "-auto-approve",
            f"-var=project={PROJECT}",
            f"-var=region={REGION}", f"-var=presenter_member={args.presenter_member}", cwd=MODULE)
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
    if not args.cloud_only:
        github_deploy_keys(repository, outputs)
        github_vars(repository, outputs)
    print("Cloud Run bootstrap complete; main placeholder is private until first app deployment")


if __name__ == "__main__":
    try:
        main()
    except (RuntimeError, ValueError, KeyError, json.JSONDecodeError) as error:
        sys.exit(str(error))
