import importlib.util
import io
import sys
import unittest
from contextlib import redirect_stdout
from pathlib import Path
from unittest.mock import patch


module_path = Path(__file__).resolve().parents[1] / "tools" / "bootstrap_cloud_run.py"
spec = importlib.util.spec_from_file_location("bootstrap_cloud_run", module_path)
bootstrap = importlib.util.module_from_spec(spec)
spec.loader.exec_module(bootstrap)


class BootstrapTests(unittest.TestCase):
    def test_gcloud_bucket_shape_requires_versioning(self):
        bucket = {
            "name": "future-health-513202-heat-safe-terraform",
            "public_access_prevention": "enforced",
            "uniform_bucket_level_access": True,
            "versioning_enabled": True,
        }
        bootstrap.verify_state_bucket(bucket)
        with self.assertRaisesRegex(RuntimeError, "state bucket"):
            bootstrap.verify_state_bucket({**bucket, "versioning_enabled": False})

    def test_presenter_member_is_required_before_cloud_writes(self):
        with patch.object(bootstrap, "preflight"), \
             patch.object(bootstrap.deploy, "gcloud") as cloud, \
             patch.dict(bootstrap.os.environ, {"GITHUB_REPOSITORY": "owner/repo"}), \
             patch.object(sys, "argv", ["bootstrap_cloud_run.py"]):
            with self.assertRaisesRegex(RuntimeError, "presenter-member"):
                bootstrap.main()
        cloud.assert_not_called()

    def test_missing_iam_permission_stops_before_any_write(self):
        def identity(*args, **_kwargs):
            if args[:3] == ("gcloud", "auth", "list"):
                return "owner@example.com"
            if args[:4] == ("gcloud", "config", "get-value", "project"):
                return bootstrap.PROJECT
            return "token"

        with patch.dict(bootstrap.os.environ, {"GOOGLE_APPLICATION_CREDENTIALS": ""}), \
             patch.object(bootstrap, "command", side_effect=identity), \
             patch.object(bootstrap, "tested_permissions", return_value=set()), \
             patch.object(bootstrap.deploy, "gcloud") as cloud, \
             patch.object(sys, "argv", ["bootstrap_cloud_run.py"]):
            with redirect_stdout(io.StringIO()):
                with self.assertRaisesRegex(RuntimeError, "preflight failed"):
                    bootstrap.main()
        cloud.assert_not_called()


if __name__ == "__main__":
    unittest.main()
