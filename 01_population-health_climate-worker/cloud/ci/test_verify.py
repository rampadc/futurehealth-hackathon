import importlib.util
from http.client import RemoteDisconnected
import json
import tarfile
import tempfile
import unittest
from pathlib import Path

HERE = Path(__file__).parent
WORKFLOWS = HERE.parents[2] / ".github" / "workflows"


def load(name):
    spec = importlib.util.spec_from_file_location(name, HERE / f"{name}.py")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


verify = load("verify")
artifact = load("verify_artifact")
comment = load("comment")
smoke = load("smoke")
SHA = "a" * 40
MAIN = "b" * 40


def repo(id=verify.REPO_ID):
    return {"id": id, "owner": {"id": verify.OWNER_ID}}


def event():
    return {"repository": repo(), "workflow_run": {
        "id": 91, "name": verify.CI_NAME, "path": ".github/workflows/ci.yml",
        "status": "completed", "conclusion": "success", "event": "pull_request",
        "head_sha": SHA, "head_branch": "feature", "repository": repo(),
        "head_repository": repo(), "pull_requests": [{"number": 5}],
    }}


def pr(state="open", head=SHA, head_repo=None):
    return {"number": 5, "state": state, "changed_files": 0, "base": {"ref": "main", "repo": repo()},
            "head": {"sha": head, "repo": head_repo or repo()}}


class EventGuardTests(unittest.TestCase):
    def check(self, data=None, current_pr=None, files=(), artifacts=None):
        data = data or event()
        current_pr = current_pr or pr()
        current_pr["changed_files"] = len(files)
        artifacts = artifacts if artifacts is not None else [{"name": f"heat-safe-image-{SHA}", "expired": False}]
        return verify.validate_run(data, MAIN, lambda _: current_pr, lambda _: files, lambda _: artifacts)

    def test_current_same_repository_pr_can_deploy(self):
        self.assertEqual(self.check()["ready"], "true")

    def test_missing_image_skips_deployment(self):
        self.assertEqual(self.check(artifacts=[])["ready"], "false")

    def test_failed_ci_is_rejected(self):
        data = event()
        data["workflow_run"]["conclusion"] = "failure"
        with self.assertRaisesRegex(ValueError, "CI did not succeed"):
            self.check(data=data)

    def test_stale_head_and_closed_pr_are_rejected(self):
        with self.assertRaisesRegex(ValueError, "head changed"):
            self.check(current_pr=pr(head="c" * 40))
        with self.assertRaisesRegex(ValueError, "closed"):
            self.check(current_pr=pr(state="closed"))

    def test_fork_and_changed_controller_are_rejected(self):
        with self.assertRaisesRegex(ValueError, "repository ID"):
            self.check(current_pr=pr(head_repo=repo(42)))
        with self.assertRaisesRegex(ValueError, "control plane"):
            self.check(files=[".github/workflows/ci.yml"])
        with self.assertRaisesRegex(ValueError, "control plane"):
            self.check(files=["01_population-health_climate-worker/cloud/deploy.py"])

    def test_old_main_run_is_rejected(self):
        data = event()
        data["workflow_run"].update(event="push", head_branch="main", pull_requests=[])
        with self.assertRaisesRegex(ValueError, "stale main"):
            self.check(data=data)

    def test_close_between_preflight_and_deploy_is_rejected(self):
        current_pr = pr()
        self.check(current_pr=current_pr)
        current_pr["state"] = "closed"
        with self.assertRaisesRegex(ValueError, "closed"):
            self.check(current_pr=current_pr)

    def test_cleanup_only_targets_closed_main_pr(self):
        data = {"repository": repo(), "action": "closed", "pull_request": pr(state="closed")}
        result = verify.validate_closed(data, lambda _: pr(state="closed"))
        self.assertEqual(result["pr"], "5")
        self.assertEqual(result["ready"], "true")
        data["pull_request"]["base"]["ref"] = "other"
        with self.assertRaisesRegex(ValueError, "wrong cleanup target"):
            verify.validate_closed(data, lambda _: pr(state="closed"))
        data["pull_request"]["base"]["ref"] = "main"
        data["pull_request"]["base"]["repo"] = repo(42)
        with self.assertRaisesRegex(ValueError, "repository ID"):
            verify.validate_closed(data, lambda _: pr(state="closed"))

    def test_delayed_close_skips_reopened_pr_and_fork(self):
        data = {"repository": repo(), "action": "closed", "pull_request": pr(state="closed")}
        self.assertEqual(verify.validate_closed(data, lambda _: pr(state="open"))["ready"], "false")
        data["pull_request"]["head"]["repo"] = repo(42)
        self.assertEqual(verify.validate_closed(data, lambda _: pr(state="closed", head_repo=repo(42)))["ready"], "false")

    def test_comment_contains_retrieval_instruction_but_no_code(self):
        content = comment.body("5", "deployed", SHA, "https://example.run.app")
        self.assertIn("heat-safe-pr-5-codes", content)
        self.assertIn(SHA, content)
        self.assertNotIn("access_code\"", content)
        self.assertNotIn("presenter_code\"", content)
        self.assertNotIn("db-password", content)

    def test_cleanup_does_not_comment_on_undeployed_pr(self):
        calls = []
        original = comment.request
        try:
            comment.request = lambda method, path, body=None: calls.append(method) or []
            comment.update("5", "removed", SHA, "")
        finally:
            comment.request = original
        self.assertEqual(calls, ["GET"])

    def test_reconcile_comment_skips_reopened_pr(self):
        calls = []
        original = comment.request
        try:
            comment.request = lambda method, path, body=None: calls.append((method, path)) or pr(state="open")
            comment.mark_reconciled("5")
        finally:
            comment.request = original
        self.assertEqual(calls, [("GET", "pulls/5")])


class WorkflowAuthTests(unittest.TestCase):
    def test_cloud_auth_uses_only_environment_scoped_keys(self):
        deployments = {
            "deploy-main.yml": ("heat-safe-main", "GCP_MAIN_DEPLOY_KEY"),
            "deploy-preview.yml": ("heat-safe-preview", "GCP_PREVIEW_DEPLOY_KEY"),
            "cleanup.yml": ("heat-safe-preview", "GCP_PREVIEW_DEPLOY_KEY"),
            "reconcile.yml": ("heat-safe-preview", "GCP_PREVIEW_DEPLOY_KEY"),
        }
        for path in WORKFLOWS.glob("*.yml"):
            source = path.read_text()
            with self.subTest(workflow=path.name):
                self.assertNotIn("id-token: write", source)
                self.assertNotIn("workload_identity_provider:", source)
                self.assertNotIn("service_account:", source)
                if path.name in deployments:
                    environment, secret = deployments[path.name]
                    self.assertEqual(source.count(f"environment: {environment}"), 1)
                    self.assertEqual(source.count(f"credentials_json: ${{{{ secrets.{secret} }}}}"), 1)
                    self.assertEqual(source.count("google-github-actions/auth@"), 1)
                else:
                    self.assertNotIn("credentials_json:", source)
                    self.assertNotIn("environment:", source)


class ArtifactTests(unittest.TestCase):
    def test_archive_origin_and_path_are_checked(self):
        with tempfile.TemporaryDirectory() as temporary:
            directory = Path(temporary)
            payload = directory / "payload"
            payload.write_text("image")
            with tarfile.open(directory / "image.tar", "w") as tar:
                tar.add(payload, arcname="image-layer")
            import hashlib
            digest = hashlib.sha256((directory / "image.tar").read_bytes()).hexdigest()
            (directory / "image.json").write_text(json.dumps({"sha": SHA, "run_id": "91", "tag": f"heat-safe-ci:{SHA}", "sha256": digest}))
            self.assertEqual(artifact.verify(directory, SHA, "91"), f"heat-safe-ci:{SHA}")
            with self.assertRaises(ValueError):
                artifact.verify(directory, "c" * 40, "91")
            with self.assertRaisesRegex(ValueError, "origin"):
                artifact.verify(directory, SHA, "92")
            with tarfile.open(directory / "image.tar", "w") as tar:
                tar.add(payload, arcname="../escape")
            digest = hashlib.sha256((directory / "image.tar").read_bytes()).hexdigest()
            (directory / "image.json").write_text(json.dumps({"sha": SHA, "run_id": "91", "tag": f"heat-safe-ci:{SHA}", "sha256": digest}))
            with self.assertRaises(ValueError):
                artifact.verify(directory, SHA, "91")


class SmokeTests(unittest.TestCase):
    def test_startup_disconnect_is_retryable(self):
        original = smoke.urlopen
        try:
            smoke.urlopen = lambda *_args, **_kwargs: (_ for _ in ()).throw(RemoteDisconnected("starting"))
            self.assertEqual(smoke.fetch("/api/ready"), (None, b""))
        finally:
            smoke.urlopen = original

    def test_local_smoke_checks_readiness_and_anonymous_routes(self):
        sequence = iter([(None, b""), (503, b""), (200, b'{"ok":true}'), (200, b""),
                         (401, b""), (401, b""), (404, b"")])
        paths = []
        original_fetch, original_sleep = smoke.fetch, smoke.time.sleep
        try:
            smoke.fetch = lambda path: paths.append(path) or next(sequence)
            smoke.time.sleep = lambda _: None
            smoke.smoke()
        finally:
            smoke.fetch, smoke.time.sleep = original_fetch, original_sleep
        self.assertEqual(paths, ["/api/ready", "/api/ready", "/api/ready", "/", "/api/case", "/api/demo/state", "/guide"])

    def test_local_smoke_rejects_public_case_route(self):
        sequence = iter([(200, b'{"ok":true}'), (200, b""), (200, b"")])
        original_fetch = smoke.fetch
        try:
            smoke.fetch = lambda _: next(sequence)
            with self.assertRaisesRegex(RuntimeError, "expected HTTP 401"):
                smoke.smoke()
        finally:
            smoke.fetch = original_fetch

    def test_disconnect_after_ready_fails(self):
        sequence = iter([(200, b'{"ok":true}'), (None, b"")])
        original_fetch = smoke.fetch
        try:
            smoke.fetch = lambda _: next(sequence)
            with self.assertRaisesRegex(RuntimeError, "expected HTTP 200"):
                smoke.smoke()
        finally:
            smoke.fetch = original_fetch


if __name__ == "__main__":
    unittest.main()
