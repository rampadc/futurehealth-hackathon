import importlib.util
import io
import json
import sys
import tempfile
import unittest
from contextlib import redirect_stdout
from pathlib import Path
from unittest.mock import patch


module_path = Path(__file__).resolve().parents[1] / "tools" / "bootstrap_cloud_run.py"
spec = importlib.util.spec_from_file_location("bootstrap_cloud_run", module_path)
bootstrap = importlib.util.module_from_spec(spec)
spec.loader.exec_module(bootstrap)
MAIN = "main@future-health-513202.iam.gserviceaccount.com"
PREVIEW = "preview@future-health-513202.iam.gserviceaccount.com"
OUTPUTS = {"main_deployer": {"value": MAIN}, "preview_deployer": {"value": PREVIEW}}


def key(account, key_id="a" * 40):
    return json.dumps({"type": "service_account", "project_id": bootstrap.PROJECT,
                       "client_email": account, "private_key_id": key_id,
                       "private_key": "private"}).encode()


class BootstrapTests(unittest.TestCase):
    def test_gcloud_bucket_shape_requires_versioning(self):
        bucket = {"public_access_prevention": "enforced",
                  "uniform_bucket_level_access": True, "versioning_enabled": True}
        bootstrap.verify_state_bucket(bucket)
        with self.assertRaisesRegex(RuntimeError, "state bucket"):
            bootstrap.verify_state_bucket({**bucket, "versioning_enabled": False})

    def test_presenter_member_is_required_before_cloud_writes(self):
        with patch.object(bootstrap, "preflight"), \
             patch.object(bootstrap.deploy, "gcloud") as cloud, \
             patch.object(sys, "argv", ["bootstrap_cloud_run.py", "--cloud-only"]):
            with self.assertRaisesRegex(RuntimeError, "presenter-member"):
                bootstrap.main()
        cloud.assert_not_called()

    def test_github_only_validates_files_and_skips_gcp_preflight(self):
        with tempfile.TemporaryDirectory() as directory:
            main_file, preview_file = Path(directory) / "main.json", Path(directory) / "preview.json"
            main_file.write_bytes(key(MAIN))
            preview_file.write_bytes(key(PREVIEW, "b" * 40))
            main_file.chmod(0o600)
            preview_file.chmod(0o600)
            argv = ["bootstrap_cloud_run.py", "--github-only", "--main-key-file", str(main_file),
                    "--preview-key-file", str(preview_file)]
            with patch.object(bootstrap, "preflight") as preflight, \
                 patch.object(bootstrap, "repository_name", return_value="owner/repo"), \
                 patch.object(bootstrap, "terraform_outputs", return_value=OUTPUTS), \
                 patch.object(bootstrap, "github_deploy_keys") as github, \
                 patch.object(bootstrap, "github_vars"), \
                 patch.object(bootstrap.deploy, "gcloud") as cloud, \
                 patch.object(sys, "argv", argv), redirect_stdout(io.StringIO()):
                bootstrap.main()
            github.assert_called_once_with("owner/repo", OUTPUTS, {
                "GCP_MAIN_DEPLOY_KEY": str(main_file), "GCP_PREVIEW_DEPLOY_KEY": str(preview_file)})
            preflight.assert_not_called()
            cloud.assert_not_called()
            preview_file.write_bytes(key(MAIN, "b" * 40))
            with patch.object(bootstrap, "repository_name", return_value="owner/repo"), \
                 patch.object(bootstrap, "terraform_outputs", return_value=OUTPUTS), \
                 patch.object(bootstrap, "github_deploy_keys") as github, \
                 patch.object(sys, "argv", argv):
                with self.assertRaisesRegex(RuntimeError, "does not match"):
                    bootstrap.main()
            github.assert_not_called()

    def test_key_file_options_are_mode_specific(self):
        for argv in (["bootstrap_cloud_run.py", "--github-only"],
                     ["bootstrap_cloud_run.py", "--cloud-only", "--main-key-file", "x"]):
            with patch.object(sys, "argv", argv), redirect_stdout(io.StringIO()), \
                 patch("sys.stderr", io.StringIO()):
                with self.assertRaises(SystemExit):
                    bootstrap.main()

    def test_repository_identity_is_checked(self):
        with patch.dict(bootstrap.os.environ, {"GITHUB_REPOSITORY": "owner/repo"}), \
             patch.object(bootstrap, "github_api", return_value={"id": 1, "owner": {"id": 2}}):
            with self.assertRaisesRegex(RuntimeError, "identity"):
                bootstrap.repository_name()

    def test_key_files_must_be_private_and_outside_checkout(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "key.json"
            path.write_bytes(key(MAIN))
            path.chmod(0o644)
            with self.assertRaisesRegex(RuntimeError, "private file"):
                bootstrap.read_key_file(path)
            path.chmod(0o600)
            self.assertEqual(bootstrap.read_key_file(path), key(MAIN))
        with self.assertRaisesRegex(RuntimeError, "private file"):
            bootstrap.read_key_file(module_path)

    def test_environment_requires_exact_main_branch_and_no_approval(self):
        policy_path = "environments/heat-safe-main/deployment-branch-policies"
        calls = []
        def api(_repository, path, method="GET", payload=None):
            calls.append((path, method, payload))
            if path == f"{policy_path}?per_page=100":
                return {"total_count": 1, "branch_policies": [{"id": 7, "name": "main", "type": "branch"}]}
            if path == "environments/heat-safe-main":
                return {"deployment_branch_policy": {"protected_branches": False,
                                                     "custom_branch_policies": True},
                        "protection_rules": []}
            return {}
        with patch.object(bootstrap, "github_api", side_effect=api):
            bootstrap.ensure_environment("owner/repo", "heat-safe-main")
        self.assertEqual(calls[0][1], "PUT")
        self.assertNotIn("reviewers", calls[0][2])
        self.assertNotIn("wait_timer", calls[0][2])
        self.assertTrue(calls[0][2]["deployment_branch_policy"]["custom_branch_policies"])
        def wrong(_repository, path, method="GET", payload=None):
            if path.endswith("?per_page=100"):
                return {"total_count": 1, "branch_policies": [{"id": 7, "name": "release/*", "type": "branch"}]}
            if path.endswith("deployment-branch-policies"):
                return {}
            return {"deployment_branch_policy": {"protected_branches": False,
                                                  "custom_branch_policies": True},
                    "protection_rules": []}
        with patch.object(bootstrap, "github_api", side_effect=wrong):
            with self.assertRaisesRegex(RuntimeError, "restricted to branch main"):
                bootstrap.ensure_environment("owner/repo", "heat-safe-main")

    def test_secret_uses_environment_and_stdin(self):
        payload = key(MAIN)
        with patch.object(bootstrap, "command") as command:
            bootstrap.upload_key("owner/repo", "heat-safe-main", "GCP_MAIN_DEPLOY_KEY", MAIN, payload)
        args = command.call_args.args
        self.assertEqual(args[:4], ("gh", "secret", "set", "GCP_MAIN_DEPLOY_KEY"))
        self.assertEqual(args[4:], ("--repo", "owner/repo", "--env", "heat-safe-main"))
        self.assertEqual(command.call_args.kwargs["input_bytes"], payload)

    def test_new_key_is_deleted_after_failed_secret_upload(self):
        calls = []
        def command(*args, **kwargs):
            calls.append((args, kwargs))
            if args[:5] == ("gcloud", "iam", "service-accounts", "keys", "create"):
                Path(args[5]).write_bytes(key(MAIN))
            if args[:3] == ("gh", "secret", "set"):
                raise RuntimeError("upload failed")
            return ""
        with patch.object(bootstrap, "ensure_environment"), \
             patch.object(bootstrap, "environment_secrets", return_value=set()), \
             patch.object(bootstrap, "command", side_effect=command):
            with self.assertRaisesRegex(RuntimeError, "upload failed"):
                bootstrap.github_deploy_keys("owner/repo", OUTPUTS)
        create = next(args for args, _ in calls if args[:5] == ("gcloud", "iam", "service-accounts", "keys", "create"))
        delete = next(args for args, _ in calls if args[:5] == ("gcloud", "iam", "service-accounts", "keys", "delete"))
        self.assertEqual(delete[5], "a" * 40)
        self.assertFalse(Path(create[5]).exists())

    def test_missing_iam_permission_stops_before_any_write(self):
        def identity(*args, **_kwargs):
            if args[:3] == ("gcloud", "auth", "list"):
                return "owner@example.com"
            if args[:4] == ("gcloud", "config", "get-value", "project"):
                return bootstrap.PROJECT
            return "token"

        with patch.dict(bootstrap.os.environ, {"GOOGLE_APPLICATION_CREDENTIALS": ""}), \
             patch.object(bootstrap, "command", side_effect=identity), \
             patch.object(bootstrap, "tested_permissions", return_value=set()) as tested, \
             patch.object(bootstrap.deploy, "gcloud") as cloud, \
             patch.object(sys, "argv", ["bootstrap_cloud_run.py"]):
            with redirect_stdout(io.StringIO()):
                with self.assertRaisesRegex(RuntimeError, "preflight failed"):
                    bootstrap.main()
        self.assertIn("iam.serviceAccountKeys.create", tested.call_args.args[1])
        cloud.assert_not_called()


if __name__ == "__main__":
    unittest.main()
