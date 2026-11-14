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
