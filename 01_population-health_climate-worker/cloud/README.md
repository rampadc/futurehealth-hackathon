# Heat-Safe Cloud Run control plane

This module is separate from `infra/`, which belongs to the earlier supervisor demo. It creates private main and preview Artifact Registry repositories, a zonal PostgreSQL 16 Cloud SQL instance, four fixed service accounts, UAE Secret Manager secrets, and GitHub OIDC federation. The application services and per-PR database resources are managed by `deploy.py`.

## Owner bootstrap

An account able to create IAM roles, service accounts, workload identity pools, and project IAM bindings must run the cloud setup. The current Editor account lacks those permissions. Bootstrap has **not** been run yet. The GCP owner and GitHub repository administrator can run separate modes with their own credentials; neither needs to share OAuth tokens.

For the GCP owner: `gcloud`, `terraform >=1.5`, PostgreSQL `psql`, and `cloud-sql-proxy` v2 on `PATH`; Cloud SQL and Artifact Registry available in `me-central1`. Authenticate the CLI and Application Default Credentials as the **same GCP bootstrap principal**, and select the exact project. The script checks both credential sets for required IAM permissions before any writes:

```sh
gcloud auth login --account=YOUR_BOOTSTRAP_ACCOUNT
gcloud auth application-default login --account=YOUR_BOOTSTRAP_ACCOUNT
gcloud config set project future-health-513202
python3 01_population-health_climate-worker/tools/bootstrap_cloud_run.py --check
```

After `--check` reports no missing permissions, the GCP owner runs from the repository root:

```sh
export GITHUB_REPOSITORY=rampadc/futurehealth-hackathon
python3 01_population-health_climate-worker/tools/bootstrap_cloud_run.py --cloud-only --presenter-member=user:ishka.quark@gmail.com
```

Cloud setup creates a versioned GCS Terraform state bucket with uniform access and public access prevention, enables APIs, applies this module, initializes PostgreSQL roles and schemas, and creates random access codes and credentials. It creates a **private** main Cloud Run placeholder so the main deployment identity needs update permission only. A first successful main deployment replaces it and enables the application gate.

The GitHub repository administrator uses their own GCP ADC identity with **read access to the existing private state bucket** and their own `gh` login. `--github-only` reads Terraform outputs from that bucket and sets repository variables; it does not run GCP bootstrap or require GCP owner IAM privileges:

```sh
gcloud auth application-default login --account=YOUR_GCP_STATE_READER_ACCOUNT
gh auth login
export GITHUB_REPOSITORY=rampadc/futurehealth-hackathon
python3 01_population-health_climate-worker/tools/bootstrap_cloud_run.py --github-only
```

The default mode still runs both stages for one person who has both sets of permissions. The two-actor sequence avoids sharing credentials.

Raw main access and presenter codes are in `heat-safe-main-gate-code` and `heat-safe-main-presenter-code`. The explicit `--presenter-member` account can read only those two raw main code secrets and preview `heat-safe-pr-N-codes` versions. It cannot read the main DB password, preview DB passwords, or SQL provisioner credential through these grants. The current designated operator is `user:ishka.quark@gmail.com`; pass a different member explicitly if that changes. Their SHA-256 digests are separate secrets mounted as Cloud Run environment variables. The main DB password is mounted from Secret Manager; the main deployer does not read it. Preview code pairs are in `heat-safe-pr-N-codes` and preview DB passwords in `heat-safe-pr-N-db-password`. Preview services receive only code digests; the preview DB password is passed as a Cloud Run environment variable for that one service. The preview runtime identity has no Secret Manager permissions.

The designated presenter can retrieve codes without an owner intervening for each PR:

```sh
gcloud secrets versions access latest --project=future-health-513202 --secret=heat-safe-main-gate-code
gcloud secrets versions access latest --project=future-health-513202 --secret=heat-safe-main-presenter-code
gcloud secrets versions access latest --project=future-health-513202 --secret=heat-safe-pr-123-codes
```

## Trusted deployment controller

Only execute `cloud/deploy.py` from the checked-out default branch in privileged workflows. PR code is built without GCP credentials into an OCI archive; the trusted workflow verifies provenance and pushes it into the private preview repository. The controller never builds source. Its image input must be a digest in `heat-safe-main/app` or that PR's exact `heat-safe-previews/pr-N/app` path. CI checks anonymous manifest retrieval before and after push and deletes the just-pushed digest if it becomes public.

```sh
cd 01_population-health_climate-worker
python3 cloud/deploy.py deploy-main --image me-central1-docker.pkg.dev/future-health-513202/heat-safe-main/app@sha256:DIGEST --sha COMMIT_SHA
python3 cloud/deploy.py deploy-preview --pr 123 --image me-central1-docker.pkg.dev/future-health-513202/heat-safe-previews/pr-123/app@sha256:DIGEST --sha COMMIT_SHA
python3 cloud/deploy.py cleanup-preview --pr 123
GITHUB_TOKEN=... GITHUB_REPOSITORY=OWNER/REPO python3 cloud/deploy.py reconcile
```

The controller appends `service=` and `url=` to `GITHUB_OUTPUT` only after a bounded HTTPS smoke check passes: readiness and product HTML return 200, unauthenticated case/chat/demo APIs return 401, and `/guide` returns 404. Preview smoke additionally logs in separately with viewer and presenter codes, checks demo access (403/200), and logs out. A failed check removes the public Cloud Run invoker binding and emits no URL. Cleanup is repeatable and deletes only that PR's service, database, role, secrets, and all versions of `pr-N/app`. Reconcile lists open GitHub PRs and deletes stale preview resources, including orphaned database roles, secrets, or image paths without a service. It emits `removed_prs=` only after successful cleanup. It requires `cloud-sql-proxy` and `psql` on `PATH`. The proxy is launched on loopback and its output is suppressed. Passwords and raw codes are never printed by the controller.

## Boundaries and checks

The main runtime can access Vertex AI, BigQuery jobs, the `vectors` dataset, Cloud SQL, and only its own digest/password secrets. Preview runtime has the same AI, dataset, and SQL access but no Secret Manager or Cloud Run read access. The SQL preview provisioner has `CREATEDB` and `CREATEROLE`, but no PostgreSQL admin or main database access. `PUBLIC` database access is revoked for main and each preview database. Runtime roles own only their `app` and `adk` schemas, and database `CREATE` is revoked after schema setup.

Creating a Cloud Run service or Secret Manager secret has no existing target resource to condition, so the preview deployer has project-level create permission. Existing-resource update/delete and secret access are conditioned to the preview name prefix. The GitHub identity provider accepts only the specified repository and owner numeric IDs, the main ref, and exact trusted workflow paths/events. `deploy-main.yml` alone maps to the main deployer principal set; `deploy-preview.yml`, `cleanup.yml`, and `reconcile.yml` map to the preview set. Test these IAM denials with the deployed identities before releasing the workflow.

Local validation:

```sh
terraform -chdir=01_population-health_climate-worker/cloud init -backend=false
terraform -chdir=01_population-health_climate-worker/cloud validate
python3 -m unittest discover -s 01_population-health_climate-worker/cloud -p 'test_*.py'
```
