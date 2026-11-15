#!/usr/bin/env python3
"""Trusted default-branch Cloud Run controller. Never execute this file from PR code."""

import argparse
import http.cookiejar
import hashlib
import json
import os
import re
import secrets
import socket
import subprocess
import sys
import tempfile
import time
import urllib.request
import urllib.error
from urllib.parse import urlsplit
from contextlib import contextmanager
from pathlib import Path

PROJECT = os.environ.get("GOOGLE_CLOUD_PROJECT", "heat-safe-example")
REGION = os.environ.get("CLOUD_RUN_REGION", "me-central1")
INSTANCE = "heat-safe-pg16"
MAIN_SERVICE = "heat-safe-app"
PREVIEW_PREFIX = "heat-safe-pr-"
MAIN_RUNTIME = f"heat-main-runtime@{PROJECT}.iam.gserviceaccount.com"
PREVIEW_RUNTIME = f"heat-preview-runtime@{PROJECT}.iam.gserviceaccount.com"
SHA_RE = re.compile(r"^[0-9a-f]{40}$")


def run(*args, input_bytes=None, missing_ok=False):
    command = [str(arg) for arg in args]
    result = subprocess.run(command, input=input_bytes, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
    if result.returncode:
        error = result.stderr.decode(errors="replace")
        if missing_ok and re.search(r"NOT_FOUND|not found|does not exist|could not find|Cannot find service \[[^\]]+\]", error, re.I):
            return None
        # Cloud CLIs may repeat submitted values on failure. Do not surface them.
        raise RuntimeError(f"{command[0]} {command[1]} failed (exit {result.returncode}); inspect Cloud Audit Logs")
    return result.stdout.decode().strip()


def gcloud(*args, input_bytes=None, missing_ok=False):
    return run("gcloud", *args, "--project", PROJECT, input_bytes=input_bytes, missing_ok=missing_ok)


def secret(name):
    return gcloud("secrets", "versions", "access", "latest", "--secret", name)


def secret_exists(name):
    return gcloud("secrets", "describe", name, missing_ok=True) is not None


def create_secret(name, value):
    if not secret_exists(name):
        gcloud("secrets", "create", name, "--replication-policy", "user-managed",
               "--locations", REGION, "--quiet")
    versions = gcloud("secrets", "versions", "list", name, "--filter=state:ENABLED",
                      "--format=value(name)")
    if not versions:
        gcloud("secrets", "versions", "add", name, "--data-file=-", "--quiet", input_bytes=value.encode())


def emit(**values):
    lines = "".join(f"{key}={value}\n" for key, value in values.items())
    if path := os.environ.get("GITHUB_OUTPUT"):
        with open(path, "a", encoding="utf-8") as output:
            output.write(lines)
    sys.stdout.write(lines)


def image_path(repository, pr=None):
    if repository == "heat-safe-main" and pr is None:
        return f"{REGION}-docker.pkg.dev/{PROJECT}/heat-safe-main/app"
    if repository == "heat-safe-previews" and pr is not None:
        return f"{REGION}-docker.pkg.dev/{PROJECT}/heat-safe-previews/pr-{validate_pr(pr)}/app"
    raise ValueError("invalid image target")


def validate_image(image, repository, pr=None):
    expected = image_path(repository, pr)
    if not re.fullmatch(re.escape(expected) + r"@sha256:[0-9a-f]{64}", image):
        raise ValueError("image must be an immutable digest in the expected private Artifact Registry repository")


def validate_pr(pr):
    if pr < 1 or pr > 999999999:
        raise ValueError("invalid PR number")
    return pr


def connection_name():
    return f"{PROJECT}:{REGION}:{INSTANCE}"


@contextmanager
def sql_proxy():
    connection = connection_name()
    with socket.socket() as sock:
        sock.bind(("127.0.0.1", 0))
        port = sock.getsockname()[1]
    proxy = subprocess.Popen(
        ["cloud-sql-proxy", "--address", "127.0.0.1", "--port", str(port), connection],
        stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
    )
    try:
        for _ in range(100):
            if proxy.poll() is not None:
                raise RuntimeError("Cloud SQL proxy exited")
            try:
                with socket.create_connection(("127.0.0.1", port), timeout=0.2):
                    break
            except OSError:
                time.sleep(0.1)
        else:
            raise RuntimeError("Cloud SQL proxy did not become ready")
        yield port
    finally:
        proxy.terminate()
        try:
            proxy.wait(timeout=5)
        except subprocess.TimeoutExpired:
            proxy.kill()
            proxy.wait()


def sql(port, query, database="postgres"):
    env = os.environ.copy()
    env.update(PGHOST="127.0.0.1", PGPORT=str(port), PGUSER="heat_preview_provisioner",
               PGPASSWORD=secret("heat-safe-sql-provisioner-password"), PGDATABASE=database)
    result = subprocess.run(["psql", "--no-psqlrc", "-X", "-A", "-t", "-v", "ON_ERROR_STOP=1"],
                            input=query.encode(), stdout=subprocess.PIPE, stderr=subprocess.PIPE, env=env)
    if result.returncode:
        raise RuntimeError("preview database operation failed; inspect Cloud SQL logs")
    return result.stdout.decode().strip()


def preview_database(pr, password, revoke_sessions=False):
    name = f"heat_pr_{pr}"
    if not re.fullmatch(r"[A-Za-z0-9_-]{32,128}", password):
        raise RuntimeError("preview DB credential has an invalid format")
    with sql_proxy() as port:
        if sql(port, f"SELECT 1 FROM pg_roles WHERE rolname = '{name}';") != "1":
            sql(port, f"CREATE ROLE {name} LOGIN PASSWORD '{password}';")
        else:
            sql(port, f"ALTER ROLE {name} LOGIN PASSWORD '{password}';")
        # PG16 grants CREATEROLE creators ADMIN but no inherited privileges.
        # Inheriting only this role lets DROP DATABASE FORCE signal its sessions.
        sql(port, f"GRANT {name} TO heat_preview_provisioner WITH INHERIT TRUE, SET FALSE;")
        if sql(port, f"SELECT 1 FROM pg_database WHERE datname = '{name}';") != "1":
            sql(port, f"CREATE DATABASE {name};")
        sql(port, f"REVOKE ALL ON DATABASE {name} FROM PUBLIC; GRANT CONNECT, CREATE, TEMP ON DATABASE {name} TO {name};")
        # Connecting as the role makes it the owner of its application schemas.
        runtime_env = os.environ.copy()
        runtime_env.update(PGHOST="127.0.0.1", PGPORT=str(port), PGUSER=name,
                           PGPASSWORD=password, PGDATABASE=name)
        setup = "CREATE SCHEMA IF NOT EXISTS app; CREATE SCHEMA IF NOT EXISTS adk;"
        if revoke_sessions:
            setup += ("DO $$ BEGIN IF to_regclass('app.access_sessions') IS NOT NULL "
                      "THEN DELETE FROM app.access_sessions; END IF; "
                      "IF to_regclass('app.access_personas') IS NOT NULL "
                      "THEN DELETE FROM app.access_personas; END IF; END $$;")
        result = subprocess.run(["psql", "--no-psqlrc", "-X", "-v", "ON_ERROR_STOP=1"],
                                input=setup.encode(),
                                stdout=subprocess.DEVNULL, stderr=subprocess.PIPE, env=runtime_env)
        if result.returncode:
            raise RuntimeError("preview schema creation failed")
        sql(port, f"REVOKE CREATE ON DATABASE {name} FROM {name};")


def delete_preview_database(pr):
    name = f"heat_pr_{pr}"
    with sql_proxy() as port:
        if sql(port, f"SELECT 1 FROM pg_database WHERE datname = '{name}';") == "1":
            if sql(port, f"SELECT 1 FROM pg_roles WHERE rolname = '{name}';") == "1":
                # Repair pre-existing previews created before the membership fix.
                sql(port, f"GRANT {name} TO heat_preview_provisioner WITH INHERIT TRUE, SET FALSE;")
            sql(port, f"DROP DATABASE {name} WITH (FORCE);")
        if sql(port, f"SELECT 1 FROM pg_roles WHERE rolname = '{name}';") == "1":
            sql(port, f"DROP ROLE {name};")


@contextmanager
def env_file(values):
    path = None
    try:
        with tempfile.NamedTemporaryFile(mode="w", encoding="utf-8", suffix=".yaml", delete=False) as file:
            path = Path(file.name)
            os.chmod(path, 0o600)
            # JSON is valid YAML and safely escapes commas, colons, and socket paths.
            json.dump(values, file)
        yield path
    finally:
        if path:
            path.unlink(missing_ok=True)


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, request, file_pointer, code, message, headers, new_url):
        return None


def http_status(opener, url, path, method="GET", payload=None):
    headers = {"Origin": url} if method != "GET" else {}
    if payload is not None:
        headers["Content-Type"] = "application/json"
    request = urllib.request.Request(url + path, method=method, headers=headers,
                                     data=json.dumps(payload).encode() if payload is not None else None)
    try:
        with opener.open(request, timeout=5) as response:
            return response.status, response.read(8192)
    except urllib.error.HTTPError as error:
        return error.code, error.read(8192)


def smoke(url, codes=None):
    parsed = urlsplit(url)
    if parsed.scheme != "https" or not parsed.hostname or not parsed.hostname.endswith(".run.app") or parsed.path or parsed.query:
        raise RuntimeError("Cloud Run did not return its canonical HTTPS URL")
    opener = urllib.request.build_opener(NoRedirect)
    for _ in range(12):
        try:
            status, _ = http_status(opener, url, "/api/ready")
            if status == 200:
                break
        except (OSError, TimeoutError):
            pass
        time.sleep(2)
    else:
        raise RuntimeError("deployed application readiness HTTP check failed")
    status, html = http_status(opener, url, "/")
    if status != 200 or b"<title>Heat-Safe Crew" not in html:
        raise RuntimeError("deployed application HTML check failed")
    expected = {"/api/case": 401, "/api/chat/history": 401,
                "/api/demo/state": 401, "/guide": 404}
    for path, desired in expected.items():
        status, _ = http_status(opener, url, path)
        if status != desired:
            raise RuntimeError(f"deployed access check failed for {path} (HTTP {status})")
    if codes:
        for key, role, demo_status in (("access_code", "viewer", 403),
                                       ("presenter_code", "presenter", 200)):
            jar = http.cookiejar.CookieJar()
            authenticated = urllib.request.build_opener(NoRedirect, urllib.request.HTTPCookieProcessor(jar))
            try:
                status, body = http_status(authenticated, url, "/api/access", "POST", {"code": codes[key]})
                if status != 200 or json.loads(body).get("role") != role:
                    raise RuntimeError(f"deployed {role} login check failed")
                status, _ = http_status(authenticated, url, "/api/demo/state")
                if status != demo_status:
                    raise RuntimeError(f"deployed {role} permission check failed")
            finally:
                status, _ = http_status(authenticated, url, "/api/access", "DELETE")
                if status != 200:
                    raise RuntimeError("deployed logout check failed")
            status, _ = http_status(authenticated, url, "/api/demo/state")
            if status != 401:
                raise RuntimeError("deployed logout did not clear access")


def deploy_service(name, image, runtime, values, secrets_flag=None, codes=None):
    prior = gcloud("run", "services", "describe", name, "--region", REGION,
                   "--format=json", missing_ok=True)
    prior_service = json.loads(prior) if prior else {}
    prior_template = prior_service.get("spec", {}).get("template", {}).get("spec", {})
    prior_containers = prior_template.get("containers") or prior_service.get("template", {}).get("containers", [])
    prior_container = prior_containers[0] if prior_containers else {}
    prior_env = {item["name"]: item.get("value") for item in prior_container.get("env", [])}
    prior_ready = prior_service.get("status", {}).get("latestReadyRevisionName")
    changed = prior_container.get("image") != image or any(prior_env.get(key) != value for key, value in values.items())
    with env_file(values) as path:
        command = ["run", "deploy", name, "--image", image, "--region", REGION,
                   "--service-account", runtime, "--ingress", "all", "--port", "8080",
                   "--cpu", "2", "--memory", "2Gi", "--max-instances", "1",
                   "--min-instances", "0", "--timeout", "600", "--concurrency", "4",
                   "--set-cloudsql-instances", connection_name(), "--env-vars-file", str(path),
                   "--async", "--quiet"]
        if secrets_flag:
            command.extend(["--set-secrets", secrets_flag])
        gcloud(*command)
    deadline = time.monotonic() + 600
    while time.monotonic() < deadline:
        raw = gcloud("run", "services", "describe", name, "--region", REGION,
                     "--format=json", missing_ok=True)
        if raw:
            service = json.loads(raw)
            status = service.get("status", {})
            template = service.get("spec", {}).get("template", {}).get("spec", {})
            containers = template.get("containers") or service.get("template", {}).get("containers", [])
            ready = any(condition.get("type") == "Ready" and condition.get("status") == "True"
                        for condition in status.get("conditions", []))
            if (containers and containers[0].get("image") == image and ready and
                    status.get("latestReadyRevisionName") and
                    status.get("latestReadyRevisionName") == status.get("latestCreatedRevisionName") and
                    (not changed or status.get("latestReadyRevisionName") != prior_ready)):
                break
        time.sleep(5)
    else:
        raise RuntimeError("Cloud Run revision did not become ready within 10 minutes")
    gcloud("run", "services", "add-iam-policy-binding", name, "--region", REGION,
           "--member=allUsers", "--role=roles/run.invoker", "--quiet")
    url = status.get("url", "")
    if not url.startswith("https://"):
        raise RuntimeError("Cloud Run service has no canonical HTTPS URL")
    try:
        smoke(url, codes)
    except Exception as error:
        try:
            gcloud("run", "services", "remove-iam-policy-binding", name, "--region", REGION,
                   "--member=allUsers", "--role=roles/run.invoker", "--quiet")
        except RuntimeError:
            raise RuntimeError("HTTP smoke failed and public invoker removal failed; manual access removal required") from error
        raise RuntimeError("deployed application failed HTTP smoke checks; public invoker removed") from error
    emit(service=name, url=url)


def deploy_main(args):
    validate_image(args.image, "heat-safe-main")
    if not SHA_RE.fullmatch(args.sha):
        raise ValueError("invalid commit SHA")
    if gcloud("run", "services", "describe", MAIN_SERVICE, "--region", REGION, missing_ok=True) is None:
        raise RuntimeError("create the private main service as documented in cloud/README.md before the first deployment")
    values = dict(GOOGLE_CLOUD_PROJECT=PROJECT, GOOGLE_CLOUD_LOCATION=REGION,
                  HEAT_SAFE_MODEL_LOCATION="global", HEAT_SAFE_TELEMETRY="0",
                  STATIC_DIR="/app/static", HEAT_REQUIRE_ACCESS="true",
                  DATABASE_HOST=f"/cloudsql/{connection_name()}", DATABASE_NAME="heat_safe_main",
                  DATABASE_USER="heat_main")
    deploy_service(MAIN_SERVICE, args.image, MAIN_RUNTIME, values,
                   "DATABASE_PASSWORD=heat-safe-main-db-password:latest,"
                   "HEAT_ACCESS_CODE_SHA256=heat-safe-main-gate-sha256:latest,"
                   "HEAT_PRESENTER_CODE_SHA256=heat-safe-main-presenter-sha256:latest")


def deploy_preview(args):
    pr = validate_pr(args.pr)
    validate_image(args.image, "heat-safe-previews", pr)
    if not SHA_RE.fullmatch(args.sha):
        raise ValueError("invalid commit SHA")
    name = f"{PREVIEW_PREFIX}{pr}"
    codes_name, password_name = f"{name}-codes", f"{name}-db-password"
    create_secret(codes_name, json.dumps({"access_code": secrets.token_urlsafe(24),
                                         "presenter_code": secrets.token_urlsafe(24)}))
    create_secret(password_name, secrets.token_urlsafe(36))
    codes = json.loads(secret(codes_name))
    password = secret(password_name)
    old = gcloud("run", "services", "describe", name, "--region", REGION,
                 "--format=json", missing_ok=True)
    previous = {}
    if old:
        service = json.loads(old)
        template = service.get("spec", {}).get("template", {}).get("spec", {})
        containers = template.get("containers") or service.get("template", {}).get("containers", [])
        if containers:
            previous = {item["name"]: item.get("value") for item in containers[0].get("env", [])}
    values = dict(GOOGLE_CLOUD_PROJECT=PROJECT, GOOGLE_CLOUD_LOCATION=REGION,
                  HEAT_SAFE_MODEL_LOCATION="global", HEAT_SAFE_TELEMETRY="0",
                  STATIC_DIR="/app/static", HEAT_REQUIRE_ACCESS="true",
                  HEAT_ACCESS_CODE_SHA256=hashlib.sha256(codes["access_code"].encode()).hexdigest(),
                  HEAT_PRESENTER_CODE_SHA256=hashlib.sha256(codes["presenter_code"].encode()).hexdigest(),
                  DATABASE_HOST=f"/cloudsql/{connection_name()}", DATABASE_NAME=f"heat_pr_{pr}",
                  DATABASE_USER=f"heat_pr_{pr}", DATABASE_PASSWORD=password)
    rotated = bool(old and (previous.get("HEAT_ACCESS_CODE_SHA256") != values["HEAT_ACCESS_CODE_SHA256"] or
                            previous.get("HEAT_PRESENTER_CODE_SHA256") != values["HEAT_PRESENTER_CODE_SHA256"]))
    preview_database(pr, password, revoke_sessions=rotated)
    deploy_service(name, args.image, PREVIEW_RUNTIME, values, codes=codes)


def cleanup_preview(pr):
    pr = validate_pr(pr)
    name = f"{PREVIEW_PREFIX}{pr}"
    if gcloud("run", "services", "describe", name, "--region", REGION, missing_ok=True) is not None:
        gcloud("run", "services", "delete", name, "--region", REGION, "--quiet")
    delete_preview_database(pr)
    for suffix in ("codes", "db-password"):
        secret_name = f"{name}-{suffix}"
        if secret_exists(secret_name):
            gcloud("secrets", "delete", secret_name, "--quiet")
    for uri in preview_images().get(pr, []):
        gcloud("artifacts", "docker", "images", "delete", uri, "--delete-tags", "--quiet")
    emit(service=name, status="deleted")


def preview_images():
    repository = f"{REGION}-docker.pkg.dev/{PROJECT}/heat-safe-previews"
    images = json.loads(gcloud("artifacts", "docker", "images", "list", repository, "--format=json"))
    found = {}
    pattern = re.compile(re.escape(repository) + r"/pr-([1-9][0-9]*)/app@sha256:[0-9a-f]{64}")
    for image in images:
        uri = image.get("uri", "")
        if match := pattern.fullmatch(uri):
            found.setdefault(int(match.group(1)), []).append(uri)
    return found


def open_prs():
    repository = os.environ.get("GITHUB_REPOSITORY", "")
    token = os.environ.get("GITHUB_TOKEN", "")
    if not re.fullmatch(r"[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+", repository) or not token:
        raise RuntimeError("reconcile requires GITHUB_REPOSITORY and GITHUB_TOKEN")
    found = set()
    page = 1
    while True:
        url = f"https://api.github.com/repos/{repository}/pulls?state=open&per_page=100&page={page}"
        request = urllib.request.Request(url, headers={"Authorization": f"Bearer {token}",
                                                       "Accept": "application/vnd.github+json",
                                                       "X-GitHub-Api-Version": "2022-11-28"})
        with urllib.request.urlopen(request, timeout=20) as response:
            prs = json.load(response)
        if not isinstance(prs, list):
            raise RuntimeError("GitHub returned an unexpected PR list")
        found.update(validate_pr(int(item["number"])) for item in prs)
        if len(prs) < 100:
            return found
        page += 1


def reconcile():
    active = open_prs()
    services = json.loads(gcloud("run", "services", "list", "--region", REGION, "--format=json"))
    known = set()
    for service in services:
        name = service.get("metadata", {}).get("name") or service.get("name", "").rsplit("/", 1)[-1]
        match = re.fullmatch(r"heat-safe-pr-([1-9][0-9]*)", name)
        if match:
            known.add(int(match.group(1)))
    for name in gcloud("secrets", "list", "--format=value(name)").splitlines():
        match = re.fullmatch(r"heat-safe-pr-([1-9][0-9]*)-(codes|db-password)", name.rsplit("/", 1)[-1])
        if match:
            known.add(int(match.group(1)))
    databases = gcloud("sql", "databases", "list", "--instance", INSTANCE, "--format=value(name)")
    for name in databases.splitlines():
        match = re.fullmatch(r"heat_pr_([1-9][0-9]*)", name)
        if match:
            known.add(int(match.group(1)))
    with sql_proxy() as port:
        for name in sql(port, "SELECT rolname FROM pg_roles WHERE rolname ~ '^heat_pr_[0-9]+$';").splitlines():
            match = re.fullmatch(r"heat_pr_([1-9][0-9]*)", name)
            if match:
                known.add(int(match.group(1)))
    known.update(preview_images())
    stale = known - active
    for pr in sorted(stale):
        cleanup_preview(pr)
    emit(reconciled=len(stale), removed_prs=",".join(str(pr) for pr in sorted(stale)))


def main():
    parser = argparse.ArgumentParser()
    actions = parser.add_subparsers(dest="action", required=True)
    for action in ("deploy-main", "deploy-preview"):
        command = actions.add_parser(action)
        command.add_argument("--image", required=True)
        command.add_argument("--sha", required=True)
        if action == "deploy-preview":
            command.add_argument("--pr", type=int, required=True)
    actions.add_parser("cleanup-preview").add_argument("--pr", type=int, required=True)
    actions.add_parser("reconcile")
    args = parser.parse_args()
    if args.action == "deploy-main":
        deploy_main(args)
    elif args.action == "deploy-preview":
        deploy_preview(args)
    elif args.action == "cleanup-preview":
        cleanup_preview(args.pr)
    else:
        reconcile()


if __name__ == "__main__":
    try:
        main()
    except (ValueError, RuntimeError, KeyError, json.JSONDecodeError) as error:
        sys.exit(str(error))
