# Heat-Safe Cloud Run control plane

This module is separate from `infra/`, which belongs to the earlier supervisor demo. Terraform creates the private main and preview Artifact Registry repositories, a PostgreSQL 16 Cloud SQL instance and main database, four service accounts, and seven fixed Secret Manager secrets. IAM grants are managed separately using the standard `gcloud` CLI after those resources exist; Terraform does not own IAM policies. The trusted `cloud/deploy.py` controller manages application services and per-PR resources during deployment.

The controller allows 80 concurrent requests per Cloud Run instance so live event streams leave capacity for access and case API calls.

## Prepared state — 15 November 2026

Infrastructure preparation completed as `contributor-f10ae3d0821d@example.invalid` with the existing Editor access. Terraform manages 24 resources and its post-apply plan reports no changes: nine enabled APIs, four service accounts, two private registries, seven fixed secrets, the PostgreSQL 16 Enterprise instance `heat-safe-pg16`, and database `heat_safe_main`.

The state bucket is private, uniform-access and versioned; anonymous state retrieval returns 403. Both registry paths reject anonymous requests with 401 and have no public IAM grants. PostgreSQL is RUNNABLE with no authorized public networks. The existing `supervisor-demo` generation and revision are unchanged. The two GitHub environments allow only `main`, require no approvals, and have the four original non-secret deployment variables configured; the WIF provider variable is part of the setup below.

All seven fixed secrets have enabled versions, and the main PostgreSQL roles and schemas are initialized. No JSON keys exist or are configured in GitHub. Organization policy blocks service-account key creation, so deployments use GitHub OIDC and Workload Identity Federation (WIF); keep that policy in place. IAM grants and the WIF provider are configured, with the Cloud Run exception documented below.

[PR #5 preview](https://heat-safe.example.invalid) was deployed manually using the scoped preview deployment identity and the combined PR #5 application / PR #6 container configuration. The live cross-persona journey produced 120 initial worker minutes, 90 after the incident, and 120 after substitution. Restart review retained the heavy-work hold. Two live Gemini/ADK answers and successful BigQuery policy queries were verified. Case version 36, access/persona sessions and chat history survived a backend revision replacement. A disposable preview passed runtime database isolation, active-connection cleanup and repeated full cleanup; its resources were removed. Local test credentials and temporary impersonation grants were removed.

Automatic GitHub deployment/comment/close handling remains unverified until this control-plane PR is merged to the default branch. PR #5 must then incorporate the merged files so its head contains `Dockerfile.cloudrun` and can produce the OCI artifact. Both PRs remain draft/unmerged until approved.

## One-time operator setup

Run these commands from the repository root as `contributor-f10ae3d0821d@example.invalid`, the designated setup operator. A project administrator performs the separate IAM grants. You need `gcloud`, Terraform 1.5 or newer, `cloud-sql-proxy` v2, `psql`, `openssl`, and `gh`. Cloud SQL and Artifact Registry must be available in `me-central1`. Authenticate the CLI and Terraform's Application Default Credentials as Ishka:

```sh
gcloud auth login --account=contributor-f10ae3d0821d@example.invalid
gcloud auth application-default login --account=contributor-f10ae3d0821d@example.invalid
gcloud config set project heat-safe-example
gh auth login
```

Confirm the project has no `allUsers` or `allAuthenticatedUsers` IAM binding before creating images or other artifacts. Keep the Terraform state bucket private, with uniform bucket-level access, public access prevention, and versioning:

```sh
gcloud projects get-iam-policy heat-safe-example --format=json
gcloud storage buckets create gs://heat-safe-example-heat-safe-terraform \
  --project=heat-safe-example --location=me-central1 \
  --uniform-bucket-level-access --public-access-prevention
gcloud storage buckets update gs://heat-safe-example-heat-safe-terraform \
  --project=heat-safe-example --versioning --public-access-prevention
gcloud storage buckets describe gs://heat-safe-example-heat-safe-terraform --format=json
```

Create the bucket only if it does not exist. If it already exists, verify its owner and private settings before using it; do not reuse an unknown bucket. The bucket name is globally unique. Apply the base resources with the private GCS backend. Terraform state may contain sensitive resource metadata, so restrict bucket access to the operators who need it:

```sh
gcloud services enable serviceusage.googleapis.com cloudresourcemanager.googleapis.com storage.googleapis.com \
  --project=heat-safe-example
terraform -chdir=01_population-health_climate-worker/cloud init -reconfigure \
  -backend-config=bucket=heat-safe-example-heat-safe-terraform \
  -backend-config=prefix=heat-safe/cloud
terraform -chdir=01_population-health_climate-worker/cloud plan -out=/private/path/heat-safe.tfplan
terraform -chdir=01_population-health_climate-worker/cloud apply /private/path/heat-safe.tfplan
```

Keep the plan file outside the checkout and delete it after apply. Then ask the project administrator to apply the reviewed IAM grants with `gcloud`. Complete the grants and WIF setup before running the workflows.

### Initialize the fixed secret values

First inspect all seven secrets for enabled versions. Run this initialization only when none has an enabled version. If all seven already have enabled versions, keep them: generating replacements would change application credentials and break the existing database roles or code digests. If only some have versions, stop and reconcile the partial setup using the existing values before proceeding.

```sh
gcloud secrets versions list heat-safe-sql-admin-password --project=heat-safe-example --filter='state:ENABLED'
gcloud secrets versions list heat-safe-main-db-password --project=heat-safe-example --filter='state:ENABLED'
gcloud secrets versions list heat-safe-sql-provisioner-password --project=heat-safe-example --filter='state:ENABLED'
gcloud secrets versions list heat-safe-main-gate-code --project=heat-safe-example --filter='state:ENABLED'
gcloud secrets versions list heat-safe-main-presenter-code --project=heat-safe-example --filter='state:ENABLED'
gcloud secrets versions list heat-safe-main-gate-sha256 --project=heat-safe-example --filter='state:ENABLED'
gcloud secrets versions list heat-safe-main-presenter-sha256 --project=heat-safe-example --filter='state:ENABLED'
```

For a first installation, use a private directory outside the checkout. Keep files mode 600, never display their contents in terminal output, and never put passwords in command arguments, shell history, logs, or the repository. Generate the raw values and their SHA-256 digests locally:

```sh
umask 077
mkdir -p -m 700 /private/path/heat-safe-secrets
openssl rand -hex 32 | tr -d '\n' > /private/path/heat-safe-secrets/sql-admin-password
openssl rand -hex 32 | tr -d '\n' > /private/path/heat-safe-secrets/main-db-password
openssl rand -hex 32 | tr -d '\n' > /private/path/heat-safe-secrets/sql-provisioner-password
openssl rand -hex 24 | tr -d '\n' > /private/path/heat-safe-secrets/main-gate-code
openssl rand -hex 24 | tr -d '\n' > /private/path/heat-safe-secrets/main-presenter-code
shasum -a 256 /private/path/heat-safe-secrets/main-gate-code | cut -d ' ' -f 1 | tr -d '\n' > /private/path/heat-safe-secrets/main-gate-sha256
shasum -a 256 /private/path/heat-safe-secrets/main-presenter-code | cut -d ' ' -f 1 | tr -d '\n' > /private/path/heat-safe-secrets/main-presenter-sha256
```

All seven files must contain no trailing newline. Terraform creates the seven secret resources. Add one version of each:

```sh
gcloud secrets versions add heat-safe-sql-admin-password --project=heat-safe-example --data-file=/private/path/heat-safe-secrets/sql-admin-password
gcloud secrets versions add heat-safe-main-db-password --project=heat-safe-example --data-file=/private/path/heat-safe-secrets/main-db-password
gcloud secrets versions add heat-safe-sql-provisioner-password --project=heat-safe-example --data-file=/private/path/heat-safe-secrets/sql-provisioner-password
gcloud secrets versions add heat-safe-main-gate-code --project=heat-safe-example --data-file=/private/path/heat-safe-secrets/main-gate-code
gcloud secrets versions add heat-safe-main-presenter-code --project=heat-safe-example --data-file=/private/path/heat-safe-secrets/main-presenter-code
gcloud secrets versions add heat-safe-main-gate-sha256 --project=heat-safe-example --data-file=/private/path/heat-safe-secrets/main-gate-sha256
gcloud secrets versions add heat-safe-main-presenter-sha256 --project=heat-safe-example --data-file=/private/path/heat-safe-secrets/main-presenter-sha256
```

On a rerun with all seven versions present, skip the generation and `versions add` commands. If database setup remains incomplete, recover its existing passwords into new private files outside the checkout without printing them:

```sh
umask 077
mkdir -p -m 700 /private/path/heat-safe-secrets
gcloud secrets versions access latest --project=heat-safe-example --secret=heat-safe-sql-admin-password --out-file=/private/path/heat-safe-secrets/sql-admin-password
gcloud secrets versions access latest --project=heat-safe-example --secret=heat-safe-main-db-password --out-file=/private/path/heat-safe-secrets/main-db-password
gcloud secrets versions access latest --project=heat-safe-example --secret=heat-safe-sql-provisioner-password --out-file=/private/path/heat-safe-secrets/sql-provisioner-password
```

For the first installation, use `gcloud sql users set-password postgres --instance=heat-safe-pg16 --project=heat-safe-example --prompt-for-password` and enter the admin password from the private file at the hidden prompt. On a rerun, skip that password change if the admin password is already set to the stored value. In another terminal, run `cloud-sql-proxy heat-safe-example:me-central1:heat-safe-pg16 --address=127.0.0.1 --port=5432`. With the proxy running, connect as admin (the `-W` prompt hides input):

```sh
psql 'host=127.0.0.1 port=5432 dbname=postgres user=postgres' -W -v ON_ERROR_STOP=1
```

For the first installation, enter these statements in `psql`. `\password` asks for each password without recording it in SQL command history. Paste the values from the corresponding private files into those hidden prompts. On a rerun, check whether the roles already exist and skip their `CREATE ROLE` and `\password` commands if they do:

```sql
CREATE ROLE heat_main LOGIN;
\password heat_main
CREATE ROLE heat_preview_provisioner LOGIN CREATEDB CREATEROLE;
\password heat_preview_provisioner
REVOKE ALL ON DATABASE heat_safe_main FROM PUBLIC;
GRANT CONNECT, CREATE, TEMP ON DATABASE heat_safe_main TO heat_main;
```

Connect as `heat_main` to create the schemas it owns, then reconnect as admin to remove database-level `CREATE` and verify the provisioner cannot connect to main:

```sh
psql 'host=127.0.0.1 port=5432 dbname=heat_safe_main user=heat_main' -W -v ON_ERROR_STOP=1
```

```sql
CREATE SCHEMA IF NOT EXISTS app;
CREATE SCHEMA IF NOT EXISTS adk;
```

```sh
psql 'host=127.0.0.1 port=5432 dbname=postgres user=postgres' -W -v ON_ERROR_STOP=1
```

```sql
REVOKE CREATE ON DATABASE heat_safe_main FROM heat_main;
SELECT has_database_privilege('heat_preview_provisioner', 'heat_safe_main', 'CONNECT');
```

The final query must return `f`. Create the main Cloud Run target only if it does not already exist, before the main deployer runs. If it exists, skip the placeholder deployment below so a setup rerun cannot overwrite the application with the hello image. Omit both authentication flags and use `--quiet` so the CLI does not prompt for a public invoker grant:

```sh
gcloud run deploy heat-safe-app \
  --project=heat-safe-example --region=me-central1 \
  --image=us-docker.pkg.dev/cloudrun/container/hello \
  --service-account=heat-main-runtime@heat-safe-example.iam.gserviceaccount.com --quiet
gcloud run services get-iam-policy heat-safe-app --project=heat-safe-example --region=me-central1 --format=json
```

The service policy must contain neither `allUsers` nor `allAuthenticatedUsers`. If Cloud Run attempts an IAM change and Ishka lacks permission, stop and have Christine complete or verify the private placeholder; do not request broader Editor grants or make the service public.

### Connect the existing GitHub environments

`heat-safe-main` and `heat-safe-preview` must each allow only the exact `main` branch and require no manual approval. Verify their branch policies and protection rules in GitHub:

```sh
gh api repos/rampadc/futurehealth-hackathon/environments/heat-safe-main
gh api repos/rampadc/futurehealth-hackathon/environments/heat-safe-main/deployment-branch-policies
gh api repos/rampadc/futurehealth-hackathon/environments/heat-safe-preview
gh api repos/rampadc/futurehealth-hackathon/environments/heat-safe-preview/deployment-branch-policies
```

Each environment must report one `main` branch policy, custom branch policies enabled, and no reviewer or wait-timer protection rule. There must be no repository-wide deployment keys. A project administrator creates the WIF pool and OIDC provider once, in the project containing the deployer service accounts. A GitHub repository administrator sets the variables at the end:

```sh
gcloud iam workload-identity-pools create heat-safe-github \
  --project=heat-safe-example --location=global \
  --display-name='Heat-Safe GitHub'

mapping="google.subject=assertion.sub,attribute.repository_id=assertion.repository_id,attribute.repository_owner_id=assertion.repository_owner_id,attribute.deployer=assertion.event_name == 'workflow_run' && assertion.workflow_ref == 'rampadc/futurehealth-hackathon/.github/workflows/deploy-main.yml@refs/heads/main' ? 'main' : 'preview'"
condition="assertion.repository_id == '1444949018' && assertion.repository_owner_id == '5560025' && assertion.repository == 'rampadc/futurehealth-hackathon' && assertion.ref == 'refs/heads/main' && ((assertion.event_name == 'workflow_run' && assertion.workflow_ref == 'rampadc/futurehealth-hackathon/.github/workflows/deploy-main.yml@refs/heads/main') || (assertion.event_name == 'workflow_run' && assertion.workflow_ref == 'rampadc/futurehealth-hackathon/.github/workflows/deploy-preview.yml@refs/heads/main') || (assertion.event_name == 'pull_request_target' && assertion.workflow_ref == 'rampadc/futurehealth-hackathon/.github/workflows/cleanup.yml@refs/heads/main') || ((assertion.event_name == 'schedule' || assertion.event_name == 'workflow_dispatch') && assertion.workflow_ref == 'rampadc/futurehealth-hackathon/.github/workflows/reconcile.yml@refs/heads/main'))"
gcloud iam workload-identity-pools providers create-oidc github-actions \
  --project=heat-safe-example --location=global \
  --workload-identity-pool=heat-safe-github \
  --issuer-uri=https://token.actions.githubusercontent.com \
  --attribute-mapping="$mapping" --attribute-condition="$condition"

gcloud iam service-accounts add-iam-policy-binding \
  heat-main-deploy@heat-safe-example.iam.gserviceaccount.com \
  --project=heat-safe-example --role=roles/iam.workloadIdentityUser \
  --member='principalSet://iam.googleapis.com/projects/123456789012/locations/global/workloadIdentityPools/heat-safe-github/attribute.deployer/main'
gcloud iam service-accounts add-iam-policy-binding \
  heat-preview-deploy@heat-safe-example.iam.gserviceaccount.com \
  --project=heat-safe-example --role=roles/iam.workloadIdentityUser \
  --member='principalSet://iam.googleapis.com/projects/123456789012/locations/global/workloadIdentityPools/heat-safe-github/attribute.deployer/preview'

gh variable set GCP_PROJECT_ID --repo rampadc/futurehealth-hackathon --body heat-safe-example
gh variable set GCP_REGION --repo rampadc/futurehealth-hackathon --body me-central1
gh variable set GCP_MAIN_DEPLOY_SA --repo rampadc/futurehealth-hackathon --body heat-main-deploy@heat-safe-example.iam.gserviceaccount.com
gh variable set GCP_PREVIEW_DEPLOY_SA --repo rampadc/futurehealth-hackathon --body heat-preview-deploy@heat-safe-example.iam.gserviceaccount.com
gh variable set GCP_WIF_PROVIDER --repo rampadc/futurehealth-hackathon --body projects/123456789012/locations/global/workloadIdentityPools/heat-safe-github/providers/github-actions
```

The provider condition limits tokens to repository ID `1444949018`, owner ID `5560025`, the default branch, and the four trusted workflow files and events. The `deployer` attribute limits the main service account to the main deployment workflow; the preview service account handles preview deployment, cleanup, and reconciliation. Workflows must request `id-token: write` and authenticate with `google-github-actions/auth` using the provider resource and the relevant deployer service account. Do not create JSON keys or populate the old `GCP_MAIN_DEPLOY_KEY` and `GCP_PREVIEW_DEPLOY_KEY` secrets. Keep the organization key-creation policy enabled.

The designated presenter (`user:contributor-f10ae3d0821d@example.invalid` unless the owner changes the grant) can retrieve raw main codes and preview code pairs:

```sh
gcloud secrets versions access latest --project=heat-safe-example --secret=heat-safe-main-gate-code
gcloud secrets versions access latest --project=heat-safe-example --secret=heat-safe-main-presenter-code
gcloud secrets versions access latest --project=heat-safe-example --secret=heat-safe-pr-123-codes
```

Treat command output as sensitive. The main runtime receives only code digests and its DB password. The preview runtime receives code digests and its own preview DB password, and has no Secret Manager access. The SQL preview provisioner has `CREATEDB` and `CREATEROLE`, but no PostgreSQL admin or main database access.

## Cloud Run permission boundary

The main deployment role is bound directly to `heat-safe-app`. Cloud Run does not support `resource.name` conditions for service management ([supported attributes](https://docs.cloud.google.com/iam/docs/conditions-resource-attributes)), so the preview deployment account has project-level service create/list/manage permissions. The trusted controller restricts its operations to validated `heat-safe-pr-N` names; IAM does not enforce that name prefix. This is an explicit hackathon trade-off: a compromised preview deployment identity could manage other Cloud Run services in this project. Registry permissions, main secret access and PostgreSQL logins remain separated. Do not describe the preview service-management permission as prefix-restricted IAM.

## Trusted deployment controller

Only execute `cloud/deploy.py` from the checked-out default branch in privileged workflows. PR code is built without GCP credentials into an OCI archive; the trusted workflow verifies provenance and pushes it into the private preview repository. The controller never builds source. Its image input must be a digest in `heat-safe-main/app` or that PR's exact `heat-safe-previews/pr-N/app` path. CI checks anonymous manifest retrieval before and after push and deletes the just-pushed digest if it becomes public.

```sh
cd 01_population-health_climate-worker
python3 cloud/deploy.py deploy-main --image me-central1-docker.pkg.dev/heat-safe-example/heat-safe-main/app@sha256:DIGEST --sha COMMIT_SHA
python3 cloud/deploy.py deploy-preview --pr 123 --image me-central1-docker.pkg.dev/heat-safe-example/heat-safe-previews/pr-123/app@sha256:DIGEST --sha COMMIT_SHA
python3 cloud/deploy.py cleanup-preview --pr 123
GITHUB_TOKEN=... GITHUB_REPOSITORY=OWNER/REPO python3 cloud/deploy.py reconcile
```

The controller emits `service=` and `url=` to `GITHUB_OUTPUT` only after HTTPS smoke checks pass. Cleanup deletes only that PR's service, database, role, secrets, and image versions. Reconcile removes stale preview resources. It requires `cloud-sql-proxy` and `psql` on `PATH`.

## Local validation

```sh
terraform -chdir=01_population-health_climate-worker/cloud init -backend=false
terraform -chdir=01_population-health_climate-worker/cloud validate
python3 -m unittest discover -s 01_population-health_climate-worker/cloud -p 'test_*.py'
```
