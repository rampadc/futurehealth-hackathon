# Heat-Safe Cloud Run control plane

This module is separate from `infra/`, which belongs to the earlier supervisor demo. Terraform creates the private main and preview Artifact Registry repositories, a PostgreSQL 16 Cloud SQL instance and main database, four service accounts, and seven fixed Secret Manager secrets. IAM grants are managed separately using the standard `gcloud` CLI after those resources exist; Terraform does not own IAM policies. The trusted `cloud/deploy.py` controller manages application services and per-PR resources during deployment.

The controller allows 80 concurrent requests per Cloud Run instance so live event streams leave capacity for access and case API calls.

## Deployment configuration

This guide is a configuration template. Replace `YOUR_PROJECT_ID`,
`YOUR_PROJECT_NUMBER`, `operator@example.com` and service URL placeholders with
your own values. Repository IDs in the trust policy belong to the original
repository; configure and review them before using a fork. Deployment credentials,
state, images and access codes must remain private.

## One-time operator setup

Run these commands from the repository root as `operator@example.com`, the designated setup operator. A project administrator performs the separate IAM grants. You need `gcloud`, Terraform 1.5 or newer, `cloud-sql-proxy` v2, `psql`, `openssl`, and `gh`. Cloud SQL and Artifact Registry must be available in `me-central1`. Authenticate the CLI and Terraform's Application Default Credentials with your deployment account:

```sh
gcloud auth login --account=operator@example.com
gcloud auth application-default login --account=operator@example.com
gcloud config set project YOUR_PROJECT_ID
gh auth login
```

Confirm the project has no `allUsers` or `allAuthenticatedUsers` IAM binding before creating images or other artifacts. Keep the Terraform state bucket private, with uniform bucket-level access, public access prevention, and versioning:

```sh
gcloud projects get-iam-policy YOUR_PROJECT_ID --format=json
gcloud storage buckets create gs://YOUR_PROJECT_ID-heat-safe-terraform \
  --project=YOUR_PROJECT_ID --location=me-central1 \
  --uniform-bucket-level-access --public-access-prevention
gcloud storage buckets update gs://YOUR_PROJECT_ID-heat-safe-terraform \
  --project=YOUR_PROJECT_ID --versioning --public-access-prevention
gcloud storage buckets describe gs://YOUR_PROJECT_ID-heat-safe-terraform --format=json
```

Create the bucket only if it does not exist. If it already exists, verify its owner and private settings before using it; do not reuse an unknown bucket. The bucket name is globally unique. Apply the base resources with the private GCS backend. Terraform state may contain sensitive resource metadata, so restrict bucket access to the operators who need it:

```sh
gcloud services enable serviceusage.googleapis.com cloudresourcemanager.googleapis.com storage.googleapis.com \
  --project=YOUR_PROJECT_ID
terraform -chdir=01_population-health_climate-worker/cloud init -reconfigure \
  -backend-config=bucket=YOUR_PROJECT_ID-heat-safe-terraform \
  -backend-config=prefix=heat-safe/cloud
terraform -chdir=01_population-health_climate-worker/cloud plan -var='project=YOUR_PROJECT_ID' -out=/private/path/heat-safe.tfplan
terraform -chdir=01_population-health_climate-worker/cloud apply /private/path/heat-safe.tfplan
```

Keep the plan file outside the checkout and delete it after apply. Then ask the project administrator to apply the reviewed IAM grants with `gcloud`. Complete the grants and WIF setup before running the workflows.

### Initialize the fixed secret values

First inspect all seven secrets for enabled versions. Run this initialization only when none has an enabled version. If all seven already have enabled versions, keep them: generating replacements would change application credentials and break the existing database roles or code digests. If only some have versions, stop and reconcile the partial setup using the existing values before proceeding.

```sh
gcloud secrets versions list heat-safe-sql-admin-password --project=YOUR_PROJECT_ID --filter='state:ENABLED'
gcloud secrets versions list heat-safe-main-db-password --project=YOUR_PROJECT_ID --filter='state:ENABLED'
gcloud secrets versions list heat-safe-sql-provisioner-password --project=YOUR_PROJECT_ID --filter='state:ENABLED'
gcloud secrets versions list heat-safe-main-gate-code --project=YOUR_PROJECT_ID --filter='state:ENABLED'
gcloud secrets versions list heat-safe-main-presenter-code --project=YOUR_PROJECT_ID --filter='state:ENABLED'
gcloud secrets versions list heat-safe-main-gate-sha256 --project=YOUR_PROJECT_ID --filter='state:ENABLED'
gcloud secrets versions list heat-safe-main-presenter-sha256 --project=YOUR_PROJECT_ID --filter='state:ENABLED'
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
gcloud secrets versions add heat-safe-sql-admin-password --project=YOUR_PROJECT_ID --data-file=/private/path/heat-safe-secrets/sql-admin-password
gcloud secrets versions add heat-safe-main-db-password --project=YOUR_PROJECT_ID --data-file=/private/path/heat-safe-secrets/main-db-password
gcloud secrets versions add heat-safe-sql-provisioner-password --project=YOUR_PROJECT_ID --data-file=/private/path/heat-safe-secrets/sql-provisioner-password
gcloud secrets versions add heat-safe-main-gate-code --project=YOUR_PROJECT_ID --data-file=/private/path/heat-safe-secrets/main-gate-code
gcloud secrets versions add heat-safe-main-presenter-code --project=YOUR_PROJECT_ID --data-file=/private/path/heat-safe-secrets/main-presenter-code
gcloud secrets versions add heat-safe-main-gate-sha256 --project=YOUR_PROJECT_ID --data-file=/private/path/heat-safe-secrets/main-gate-sha256
gcloud secrets versions add heat-safe-main-presenter-sha256 --project=YOUR_PROJECT_ID --data-file=/private/path/heat-safe-secrets/main-presenter-sha256
```

On a rerun with all seven versions present, skip the generation and `versions add` commands. If database setup remains incomplete, recover its existing passwords into new private files outside the checkout without printing them:

```sh
umask 077
mkdir -p -m 700 /private/path/heat-safe-secrets
gcloud secrets versions access latest --project=YOUR_PROJECT_ID --secret=heat-safe-sql-admin-password --out-file=/private/path/heat-safe-secrets/sql-admin-password
gcloud secrets versions access latest --project=YOUR_PROJECT_ID --secret=heat-safe-main-db-password --out-file=/private/path/heat-safe-secrets/main-db-password
gcloud secrets versions access latest --project=YOUR_PROJECT_ID --secret=heat-safe-sql-provisioner-password --out-file=/private/path/heat-safe-secrets/sql-provisioner-password
```

For the first installation, use `gcloud sql users set-password postgres --instance=heat-safe-pg16 --project=YOUR_PROJECT_ID --prompt-for-password` and enter the admin password from the private file at the hidden prompt. On a rerun, skip that password change if the admin password is already set to the stored value. In another terminal, run `cloud-sql-proxy YOUR_PROJECT_ID:me-central1:heat-safe-pg16 --address=127.0.0.1 --port=5432`. With the proxy running, connect as admin (the `-W` prompt hides input):

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
  --project=YOUR_PROJECT_ID --region=me-central1 \
  --image=us-docker.pkg.dev/cloudrun/container/hello \
  --service-account=heat-main-runtime@YOUR_PROJECT_ID.iam.gserviceaccount.com --quiet
gcloud run services get-iam-policy heat-safe-app --project=YOUR_PROJECT_ID --region=me-central1 --format=json
```

The service policy must contain neither `allUsers` nor `allAuthenticatedUsers`. If Cloud Run attempts an IAM change and the operator lacks permission, stop and have a project administrator complete or verify the private placeholder; do not request broader Editor grants or make the service public.

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
  --project=YOUR_PROJECT_ID --location=global \
  --display-name='Heat-Safe GitHub'

mapping="google.subject=assertion.sub,attribute.repository_id=assertion.repository_id,attribute.repository_owner_id=assertion.repository_owner_id,attribute.deployer=assertion.event_name == 'workflow_run' && assertion.workflow_ref == 'rampadc/futurehealth-hackathon/.github/workflows/deploy-main.yml@refs/heads/main' ? 'main' : 'preview'"
condition="assertion.repository_id == '1444949018' && assertion.repository_owner_id == '5560025' && assertion.repository == 'rampadc/futurehealth-hackathon' && assertion.ref == 'refs/heads/main' && ((assertion.event_name == 'workflow_run' && assertion.workflow_ref == 'rampadc/futurehealth-hackathon/.github/workflows/deploy-main.yml@refs/heads/main') || (assertion.event_name == 'workflow_run' && assertion.workflow_ref == 'rampadc/futurehealth-hackathon/.github/workflows/deploy-preview.yml@refs/heads/main') || (assertion.event_name == 'pull_request_target' && assertion.workflow_ref == 'rampadc/futurehealth-hackathon/.github/workflows/cleanup.yml@refs/heads/main') || ((assertion.event_name == 'schedule' || assertion.event_name == 'workflow_dispatch') && assertion.workflow_ref == 'rampadc/futurehealth-hackathon/.github/workflows/reconcile.yml@refs/heads/main'))"
gcloud iam workload-identity-pools providers create-oidc github-actions \
  --project=YOUR_PROJECT_ID --location=global \
  --workload-identity-pool=heat-safe-github \
  --issuer-uri=https://token.actions.githubusercontent.com \
  --attribute-mapping="$mapping" --attribute-condition="$condition"

gcloud iam service-accounts add-iam-policy-binding \
  heat-main-deploy@YOUR_PROJECT_ID.iam.gserviceaccount.com \
  --project=YOUR_PROJECT_ID --role=roles/iam.workloadIdentityUser \
  --member='principalSet://iam.googleapis.com/projects/YOUR_PROJECT_NUMBER/locations/global/workloadIdentityPools/heat-safe-github/attribute.deployer/main'
gcloud iam service-accounts add-iam-policy-binding \
  heat-preview-deploy@YOUR_PROJECT_ID.iam.gserviceaccount.com \
  --project=YOUR_PROJECT_ID --role=roles/iam.workloadIdentityUser \
  --member='principalSet://iam.googleapis.com/projects/YOUR_PROJECT_NUMBER/locations/global/workloadIdentityPools/heat-safe-github/attribute.deployer/preview'

gh variable set GCP_PROJECT_ID --repo rampadc/futurehealth-hackathon --body YOUR_PROJECT_ID
gh variable set GCP_REGION --repo rampadc/futurehealth-hackathon --body me-central1
gh variable set GCP_MAIN_DEPLOY_SA --repo rampadc/futurehealth-hackathon --body heat-main-deploy@YOUR_PROJECT_ID.iam.gserviceaccount.com
gh variable set GCP_PREVIEW_DEPLOY_SA --repo rampadc/futurehealth-hackathon --body heat-preview-deploy@YOUR_PROJECT_ID.iam.gserviceaccount.com
gh variable set GCP_WIF_PROVIDER --repo rampadc/futurehealth-hackathon --body projects/YOUR_PROJECT_NUMBER/locations/global/workloadIdentityPools/heat-safe-github/providers/github-actions
```

The provider condition limits tokens to repository ID `1444949018`, owner ID `5560025`, the default branch, and the four trusted workflow files and events. The `deployer` attribute limits the main service account to the main deployment workflow; the preview service account handles preview deployment, cleanup, and reconciliation. Workflows must request `id-token: write` and authenticate with `google-github-actions/auth` using the provider resource and the relevant deployer service account. Do not create JSON keys or populate the old `GCP_MAIN_DEPLOY_KEY` and `GCP_PREVIEW_DEPLOY_KEY` secrets. Keep the organization key-creation policy enabled.

The designated presenter (`user:operator@example.com` unless the owner changes the grant) can retrieve raw main codes and preview code pairs:

```sh
gcloud secrets versions access latest --project=YOUR_PROJECT_ID --secret=heat-safe-main-gate-code
gcloud secrets versions access latest --project=YOUR_PROJECT_ID --secret=heat-safe-main-presenter-code
gcloud secrets versions access latest --project=YOUR_PROJECT_ID --secret=heat-safe-pr-123-codes
```

Treat command output as sensitive. The main runtime receives only code digests and its DB password. The preview runtime receives code digests and its own preview DB password, and has no Secret Manager access. The SQL preview provisioner has `CREATEDB` and `CREATEROLE`, but no PostgreSQL admin or main database access.

## Cloud Run permission boundary

The main deployment role is bound directly to `heat-safe-app`. Cloud Run does not support `resource.name` conditions for service management ([supported attributes](https://docs.cloud.google.com/iam/docs/conditions-resource-attributes)), so the preview deployment account has project-level service create/list/manage permissions. The trusted controller restricts its operations to validated `heat-safe-pr-N` names; IAM does not enforce that name prefix. This is an explicit hackathon trade-off: a compromised preview deployment identity could manage other Cloud Run services in this project. Registry permissions, main secret access and PostgreSQL logins remain separated. Do not describe the preview service-management permission as prefix-restricted IAM.

## Trusted deployment controller

Only execute `cloud/deploy.py` from the checked-out default branch in privileged workflows. CI runs application and security tests. After validating the CI run and source, the trusted deployment workflow checks out the source separately, builds and smoke-tests its image before Google Cloud authentication, then pushes it directly to the private Google Artifact Registry repository. It does not use a GitHub Actions image artifact. Main images go to `heat-safe-main/app`; preview images go to that PR's exact `heat-safe-previews/pr-N/app` path. The controller never builds source and accepts only a digest in the corresponding repository. The deployment workflow checks anonymous manifest retrieval before and after push and deletes the just-pushed digest if it becomes public.

```sh
cd 01_population-health_climate-worker
export GOOGLE_CLOUD_PROJECT=YOUR_PROJECT_ID
python3 cloud/deploy.py deploy-main --image me-central1-docker.pkg.dev/YOUR_PROJECT_ID/heat-safe-main/app@sha256:DIGEST --sha COMMIT_SHA
python3 cloud/deploy.py deploy-preview --pr 123 --image me-central1-docker.pkg.dev/YOUR_PROJECT_ID/heat-safe-previews/pr-123/app@sha256:DIGEST --sha COMMIT_SHA
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
