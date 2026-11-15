import hashlib
import json
import subprocess
import unittest
from contextlib import nullcontext
from types import SimpleNamespace
from unittest.mock import patch

import deploy


class DeploymentTests(unittest.TestCase):
    def test_connection_name_needs_no_sql_admin_permission(self):
        with patch.object(deploy, "gcloud") as cloud:
            self.assertEqual(deploy.connection_name(),
                             f"{deploy.PROJECT}:{deploy.REGION}:{deploy.INSTANCE}")
        cloud.assert_not_called()

    def test_preview_role_membership_is_scoped_for_force_cleanup(self):
        queries = []

        def fake_sql(_port, query, database="postgres"):
            queries.append(query)
            if "FROM pg_roles" in query:
                return "1"
            if "FROM pg_database" in query:
                return "1"
            return ""

        with patch.object(deploy, "sql_proxy", return_value=nullcontext(15432)), \
             patch.object(deploy, "sql", side_effect=fake_sql), \
             patch.object(deploy.subprocess, "run", return_value=SimpleNamespace(returncode=0)):
            deploy.preview_database(27, "x" * 40)
            deploy.delete_preview_database(27)
        grant = "GRANT heat_pr_27 TO heat_preview_provisioner WITH INHERIT TRUE, SET FALSE;"
        self.assertEqual(queries.count(grant), 2)
        self.assertIn("DROP DATABASE heat_pr_27 WITH (FORCE);", queries)
        self.assertNotIn("pg_signal_backend", " ".join(queries))

    def test_missing_cloud_run_service_is_a_supported_first_deploy(self):
        absent = subprocess.CompletedProcess(["gcloud"], 1, b"",
                    b"ERROR: (gcloud.run.services.describe) Cannot find service [heat-safe-pr-27]")
        with patch.object(deploy.subprocess, "run", return_value=absent):
            self.assertIsNone(deploy.gcloud("run", "services", "describe", "heat-safe-pr-27", missing_ok=True))

    def test_missing_ok_does_not_hide_permission_failure(self):
        denied = subprocess.CompletedProcess(["gcloud"], 1, b"", b"PERMISSION_DENIED")
        with patch.object(deploy.subprocess, "run", return_value=denied):
            with self.assertRaises(RuntimeError):
                deploy.gcloud("secrets", "describe", "heat-safe-pr-27-codes", missing_ok=True)

    def test_digest_is_private_and_target_specific(self):
        digest = "0" * 64
        image = f"{deploy.REGION}-docker.pkg.dev/{deploy.PROJECT}/heat-safe-previews/pr-27/app@sha256:{digest}"
        deploy.validate_image(image, "heat-safe-previews", 27)
        for bad in (image.replace("heat-safe-previews", "heat-safe-main"),
                    image.replace("pr-27", "pr-28"),
                    image.replace("@sha256:" + digest, ":latest"),
                    image.replace(deploy.PROJECT, "other-project")):
            with self.assertRaises(ValueError):
                deploy.validate_image(bad, "heat-safe-previews", 27)

    def test_preview_service_receives_hashes_and_only_own_db_password(self):
        access, presenter, password = "access-raw", "presenter-raw", "db-raw"
        digest = "a" * 64
        image = f"{deploy.REGION}-docker.pkg.dev/{deploy.PROJECT}/heat-safe-previews/pr-27/app@sha256:{digest}"
        with patch.object(deploy, "create_secret"), \
             patch.object(deploy, "secret", side_effect=[json.dumps({"access_code": access,
                                                                     "presenter_code": presenter}), password]), \
             patch.object(deploy, "gcloud", return_value=None), \
             patch.object(deploy, "preview_database"), \
             patch.object(deploy, "connection_name", return_value="project:region:instance"), \
             patch.object(deploy, "deploy_service") as service:
            deploy.deploy_preview(SimpleNamespace(pr=27, image=image, sha="b" * 40))
        name, _, runtime, values = service.call_args.args
        self.assertEqual(name, "heat-safe-pr-27")
        self.assertEqual(runtime, deploy.PREVIEW_RUNTIME)
        self.assertEqual(values["DATABASE_NAME"], "heat_pr_27")
        self.assertEqual(values["DATABASE_PASSWORD"], password)
        self.assertEqual(values["HEAT_ACCESS_CODE_SHA256"], hashlib.sha256(access.encode()).hexdigest())
        self.assertEqual(values["HEAT_PRESENTER_CODE_SHA256"], hashlib.sha256(presenter.encode()).hexdigest())
        self.assertNotIn(access, json.dumps(values))
        self.assertNotIn(presenter, json.dumps(values))

    def test_preview_code_rotation_revokes_sessions(self):
        digest = "a" * 64
        image = f"{deploy.REGION}-docker.pkg.dev/{deploy.PROJECT}/heat-safe-previews/pr-27/app@sha256:{digest}"
        old = {"spec": {"template": {"spec": {"containers": [{"env": [
            {"name": "HEAT_ACCESS_CODE_SHA256", "value": "0" * 64},
            {"name": "HEAT_PRESENTER_CODE_SHA256", "value": "1" * 64},
        ]}]}}}}
        with patch.object(deploy, "create_secret"), \
             patch.object(deploy, "secret", side_effect=[json.dumps({"access_code": "new-access",
                                                                     "presenter_code": "new-presenter"}), "x" * 40]), \
             patch.object(deploy, "gcloud", return_value=json.dumps(old)), \
             patch.object(deploy, "connection_name", return_value="project:region:instance"), \
             patch.object(deploy, "preview_database") as database, \
             patch.object(deploy, "deploy_service"):
            deploy.deploy_preview(SimpleNamespace(pr=27, image=image, sha="b" * 40))
        database.assert_called_once_with(27, "x" * 40, revoke_sessions=True)

    def test_async_deploy_waits_for_new_ready_revision(self):
        image = f"{deploy.REGION}-docker.pkg.dev/{deploy.PROJECT}/heat-safe-main/app@sha256:{'a' * 64}"
        old = {"spec": {"template": {"spec": {"containers": [{"image": "old"}]}}},
               "status": {"latestReadyRevisionName": "rev-1", "latestCreatedRevisionName": "rev-1"}}
        pending = {"spec": {"template": {"spec": {"containers": [{"image": image}]}}},
                   "status": {"latestReadyRevisionName": "rev-1", "latestCreatedRevisionName": "rev-1",
                              "conditions": [{"type": "Ready", "status": "True"}], "url": "https://app.example"}}
        ready = json.loads(json.dumps(pending))
        ready["status"]["latestReadyRevisionName"] = "rev-2"
        ready["status"]["latestCreatedRevisionName"] = "rev-2"
        calls = []

        def cloud(*args, **_kwargs):
            calls.append(args)
            if args[:3] == ("run", "services", "describe"):
                return [json.dumps(old), json.dumps(pending), json.dumps(ready)].pop(
                    sum(call[:3] == ("run", "services", "describe") for call in calls) - 1)
            return ""

        with patch.object(deploy, "gcloud", side_effect=cloud), \
             patch.object(deploy, "connection_name", return_value="project:region:instance"), \
             patch.object(deploy.time, "sleep"), patch.object(deploy, "smoke"), \
             patch.object(deploy, "emit") as emitted:
            deploy.deploy_service("heat-safe-app", image, deploy.MAIN_RUNTIME, {"STATIC_DIR": "/app/static"})
        self.assertEqual(sum(call[:3] == ("run", "services", "describe") for call in calls), 3)
        self.assertIn("--async", next(call for call in calls if call[:2] == ("run", "deploy")))
        emitted.assert_called_once_with(service="heat-safe-app", url="https://app.example")

    def test_failed_smoke_revokes_public_invoker_before_url_output(self):
        image = deploy.image_path("heat-safe-main") + "@sha256:" + "a" * 64
        service = {"spec": {"template": {"spec": {"containers": [{"image": image,
                                                                     "env": [{"name": "STATIC_DIR", "value": "/app/static"}]}]}}},
                   "status": {"latestReadyRevisionName": "rev-1", "latestCreatedRevisionName": "rev-1",
                              "conditions": [{"type": "Ready", "status": "True"}], "url": "https://app.run.app"}}
        calls = []

        def cloud(*args, **_kwargs):
            calls.append(args)
            return json.dumps(service) if args[:3] == ("run", "services", "describe") else ""

        with patch.object(deploy, "gcloud", side_effect=cloud), \
             patch.object(deploy, "connection_name", return_value="project:region:instance"), \
             patch.object(deploy, "smoke", side_effect=RuntimeError("failed")), \
             patch.object(deploy, "emit") as emitted:
            with self.assertRaisesRegex(RuntimeError, "public invoker removed"):
                deploy.deploy_service("heat-safe-app", image, deploy.MAIN_RUNTIME, {"STATIC_DIR": "/app/static"})
        self.assertTrue(any(call[:3] == ("run", "services", "remove-iam-policy-binding") for call in calls))
        emitted.assert_not_called()

    def test_http_smoke_rejects_open_unauthenticated_api(self):
        responses = iter([(200, b"{}"), (200, b"<title>Heat-Safe Crew</title>"),
                          (401, b""), (200, b"unexpected")])
        with patch.object(deploy, "http_status", side_effect=lambda *_args, **_kwargs: next(responses)):
            with self.assertRaisesRegex(RuntimeError, "/api/chat/history"):
                deploy.smoke("https://app.run.app")

    def test_preview_http_smoke_checks_roles_and_logout(self):
        responses = iter([(200, b"{}"), (200, b"<title>Heat-Safe Crew</title>"),
                          (401, b""), (401, b""), (401, b""), (404, b""),
                          (200, b'{"role":"viewer"}'), (403, b""), (200, b"{}"), (401, b""),
                          (200, b'{"role":"presenter"}'), (200, b"null"), (200, b"{}"), (401, b"")])
        with patch.object(deploy, "http_status", side_effect=lambda *_args, **_kwargs: next(responses)) as request:
            deploy.smoke("https://app.run.app", {"access_code": "viewer-code", "presenter_code": "presenter-code"})
        self.assertEqual(request.call_count, 14)
        self.assertEqual([call.args[3] for call in request.call_args_list if len(call.args) > 3],
                         ["POST", "DELETE", "POST", "DELETE"])

    def test_preview_image_inventory_and_cleanup_stay_in_pr_namespace(self):
        own = deploy.image_path("heat-safe-previews", 27) + "@sha256:" + "a" * 64
        other = deploy.image_path("heat-safe-previews", 28) + "@sha256:" + "b" * 64
        main = deploy.image_path("heat-safe-main") + "@sha256:" + "c" * 64
        with patch.object(deploy, "gcloud", return_value=json.dumps([
            {"uri": own}, {"uri": other}, {"uri": main}, {"uri": "unexpected"},
        ])):
            self.assertEqual(deploy.preview_images(), {27: [own], 28: [other]})
        with patch.object(deploy, "gcloud", return_value=None) as cloud, \
             patch.object(deploy, "delete_preview_database"), \
             patch.object(deploy, "secret_exists", return_value=False), \
             patch.object(deploy, "preview_images", return_value={27: [own], 28: [other]}), \
             patch.object(deploy, "emit"):
            deploy.cleanup_preview(27)
        deletes = [call.args for call in cloud.call_args_list if call.args[:4] ==
                   ("artifacts", "docker", "images", "delete")]
        self.assertEqual(deletes, [("artifacts", "docker", "images", "delete", own,
                                    "--delete-tags", "--quiet")])


if __name__ == "__main__":
    unittest.main()
