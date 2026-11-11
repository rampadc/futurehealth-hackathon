"""Fail fast when Google credentials point at the wrong account or project.

Client libraries find credentials through Application Default Credentials (ADC), in this order:
  1. the file named by GOOGLE_APPLICATION_CREDENTIALS
  2. ~/.config/gcloud/application_default_credentials.json (set by `gcloud auth application-default login`)
  3. the metadata server, when running on GCP (Cloud Run uses its service account)
On this machine step 2 is a *work* account, so a shell without step 1 quietly uses the wrong
identity and every call returns 403. This check turns that into one clear message at startup.
"""
from __future__ import annotations

import os

EXPECTED_PROJECT = "heat-safe-example"
HINT = ("Run with the project environment:  uv run --env-file .env python ...\n"
        "  (.env sets GOOGLE_APPLICATION_CREDENTIALS to the heat-safe ADC; see README 'Credentials')")


class WrongCredentialsError(RuntimeError):
    pass


def check_credentials(expected_project: str = EXPECTED_PROJECT) -> str:
    """Return a one-line description of the credentials in use, or raise WrongCredentialsError.

    Checks the quota project (which project is billed for API calls) rather than calling an API,
    so it costs nothing and works offline. On Cloud Run there is no quota project on the service
    account credentials; the metadata server's project is checked instead.
    """
    import google.auth

    try:
        creds, project = google.auth.default()
    except google.auth.exceptions.DefaultCredentialsError as e:
        raise WrongCredentialsError(f"No Google credentials found.\n  {HINT}") from e

    source = os.getenv("GOOGLE_APPLICATION_CREDENTIALS") or "default gcloud ADC"
    quota = getattr(creds, "quota_project_id", None)
    billed = quota or project
    if billed != expected_project:
        raise WrongCredentialsError(
            f"Credentials from {source} belong to project {billed!r}, not {expected_project!r}.\n"
            f"  This usually means GOOGLE_APPLICATION_CREDENTIALS is not set in this shell, so the\n"
            f"  default (work) ADC is used.\n  {HINT}")
    return f"credentials ok: {type(creds).__name__} from {source}, project {billed}"
