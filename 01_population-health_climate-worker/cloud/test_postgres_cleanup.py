"""Opt-in PostgreSQL 16 isolation test against the disposable local test container.

Run with HEAT_SAFE_PG_TEST=1 python -m unittest test_postgres_cleanup from cloud/.
The test refuses any Docker endpoint except heat-safe-pg-test on 127.0.0.1:15432.
"""

import json
import os
import secrets
import shutil
import subprocess
import time
import unittest
from contextlib import contextmanager
from unittest.mock import patch

import deploy


@unittest.skipUnless(os.environ.get("HEAT_SAFE_PG_TEST") == "1", "opt-in local PostgreSQL test")
class PostgresCleanupTests(unittest.TestCase):
    def test_live_preview_cleanup_is_scoped_and_repeatable(self):
        self.assertIsNotNone(shutil.which("docker"))
        self.assertIsNotNone(shutil.which("psql"))
        inspected = json.loads(subprocess.check_output(["docker", "inspect", "heat-safe-pg-test"]))
        self.assertEqual(len(inspected), 1)
        container = inspected[0]
        self.assertEqual(container["Config"]["Image"], "postgres:16")
        self.assertEqual(container["State"]["Running"], True)
        self.assertEqual(container["NetworkSettings"]["Ports"]["5432/tcp"],
                         [{"HostIp": "127.0.0.1", "HostPort": "15432"}])
        admin_password = next(item.split("=", 1)[1] for item in container["Config"]["Env"]
                              if item.startswith("POSTGRES_PASSWORD="))
        admin_env = self._env("postgres", "postgres", admin_password)

        def admin(query):
            result = subprocess.run(["psql", "--no-psqlrc", "-X", "-A", "-t", "-v", "ON_ERROR_STOP=1"],
                                    input=query.encode(), env=admin_env,
                                    stdout=subprocess.PIPE, stderr=subprocess.PIPE)
            if result.returncode:
                raise AssertionError("local PostgreSQL fixture operation failed")
            return result.stdout.decode().strip()

        self.assertTrue(admin("SHOW server_version_num;").startswith("16"))
        provisioner = "heat_preview_provisioner"
        provisioner_password = secrets.token_hex(32)
        previous_hash = admin(f"SELECT rolpassword FROM pg_authid WHERE rolname = '{provisioner}';")
        had_provisioner = admin(f"SELECT 1 FROM pg_roles WHERE rolname = '{provisioner}';") == "1"
        if had_provisioner:
            admin(f"ALTER ROLE {provisioner} PASSWORD '{provisioner_password}';")
        else:
            admin(f"CREATE ROLE {provisioner} LOGIN CREATEDB CREATEROLE PASSWORD '{provisioner_password}';")

        # Use fresh numbers; never take over an existing preview fixture.
        first, second = self._free_pr(admin), self._free_pr(admin)
        while second == first:
            second = self._free_pr(admin)
        first_name, second_name = f"heat_pr_{first}", f"heat_pr_{second}"
        first_password, second_password = secrets.token_hex(32), secrets.token_hex(32)
        main_created = admin("SELECT 1 FROM pg_database WHERE datname = 'heat_safe_main';") != "1"
        if main_created:
            admin("CREATE DATABASE heat_safe_main;")
            admin("REVOKE ALL ON DATABASE heat_safe_main FROM PUBLIC;")
        sleeping = None

        @contextmanager
        def local_proxy():
            yield 15432

        try:
            with patch.object(deploy, "sql_proxy", local_proxy), \
                 patch.object(deploy, "secret", return_value=provisioner_password):
                deploy.preview_database(first, first_password)
                deploy.preview_database(second, second_password)
                # Neither preview login can connect to the main or other preview database.
                self.assertFalse(self._can_connect(first_name, first_password, "heat_safe_main"))
                self.assertFalse(self._can_connect(first_name, first_password, second_name))
                self.assertFalse(self._can_connect(second_name, second_password, first_name))
                self.assertTrue(self._can_connect(first_name, first_password, first_name))
                self.assertEqual(admin("SELECT rolcanlogin::text || ':' || rolcreaterole::text "
                                       f"FROM pg_roles WHERE rolname = '{first_name}';"), "true:false")
                # A live app connection used to make DROP DATABASE FORCE fail.
                sleeping = subprocess.Popen(["psql", "--no-psqlrc", "-X", "-c", "SELECT pg_sleep(60);"],
                                            env=self._env(first_name, first_name, first_password),
                                            stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
                for _ in range(50):
                    if admin("SELECT count(*) FROM pg_stat_activity "
                             f"WHERE datname = '{first_name}' AND usename = '{first_name}';") == "1":
                        break
                    time.sleep(0.1)
                else:
                    self.fail("local preview runtime session did not connect")
                deploy.delete_preview_database(first)
                self.assertNotEqual(sleeping.wait(timeout=10), 0)
                self.assertEqual(admin(f"SELECT 1 FROM pg_database WHERE datname = '{first_name}';"), "")
                self.assertEqual(admin(f"SELECT 1 FROM pg_roles WHERE rolname = '{first_name}';"), "")
                self.assertTrue(self._can_connect(second_name, second_password, second_name))
                deploy.delete_preview_database(first)  # idempotent after partial or repeated cleanup
                deploy.delete_preview_database(second)
                self.assertEqual(admin(f"SELECT 1 FROM pg_database WHERE datname = '{second_name}';"), "")
        finally:
            if sleeping and sleeping.poll() is None:
                sleeping.terminate()
                sleeping.wait(timeout=5)
            for name in (first_name, second_name):
                if admin(f"SELECT 1 FROM pg_database WHERE datname = '{name}';") == "1":
                    admin(f"DROP DATABASE {name} WITH (FORCE);")
                if admin(f"SELECT 1 FROM pg_roles WHERE rolname = '{name}';") == "1":
                    admin(f"DROP ROLE {name};")
            if main_created:
                admin("DROP DATABASE heat_safe_main WITH (FORCE);")
            if had_provisioner:
                if previous_hash:
                    admin(f"ALTER ROLE {provisioner} PASSWORD '{previous_hash}';")
                else:
                    admin(f"ALTER ROLE {provisioner} PASSWORD NULL;")
            else:
                admin(f"DROP ROLE {provisioner};")

    @staticmethod
    def _env(user, database, password):
        return {**os.environ, "PGHOST": "127.0.0.1", "PGPORT": "15432", "PGUSER": user,
                "PGPASSWORD": password, "PGDATABASE": database}

    @classmethod
    def _can_connect(cls, user, password, database):
        result = subprocess.run(["psql", "--no-psqlrc", "-X", "-A", "-t", "-v", "ON_ERROR_STOP=1"],
                                input=b"SELECT 1;", env=cls._env(user, database, password),
                                stdout=subprocess.PIPE, stderr=subprocess.PIPE)
        return result.returncode == 0 and result.stdout.strip() == b"1"

    @staticmethod
    def _free_pr(admin):
        for _ in range(20):
            number = secrets.randbelow(800_000_000) + 100_000_000
            name = f"heat_pr_{number}"
            if not admin(f"SELECT 1 FROM pg_roles WHERE rolname = '{name}';") and not admin(
                    f"SELECT 1 FROM pg_database WHERE datname = '{name}';"):
                return number
        raise AssertionError("could not allocate unused local PR fixture")


if __name__ == "__main__":
    unittest.main()
