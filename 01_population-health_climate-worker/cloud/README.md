# Heat-Safe Cloud Run control plane

This module is separate from `infra/`, which belongs to the earlier supervisor demo. Terraform creates the private main and preview Artifact Registry repositories, a PostgreSQL 16 Cloud SQL instance and main database, four service accounts, and seven fixed Secret Manager secrets. [Christine's IAM instructions](CHRISTINE-IAM.md) grant the narrowly scoped permissions after those resources exist. The trusted `cloud/deploy.py` controller manages application services and per-PR resources during deployment.

## One-time operator setup

Run these commands from the repository root as `ishka.quark@gmail.com`, the project Editor and designated setup operator. Christine performs the separate IAM grants in `CHRISTINE-IAM.md`. You need `gcloud`, Terraform 1.5 or newer, `cloud-sql-proxy` v2, `psql`, `openssl`, and `gh`. Cloud SQL and Artifact Registry must be available in `me-central1`. Authenticate the CLI and Terraform's Application Default Credentials as Ishka:

```sh
gcloud auth login --account=ishka.quark@gmail.com
gcloud auth application-default login --account=ishka.quark@gmail.com
gcloud config set project future-health-513202
gh auth login
```

Confirm the project has no `allUsers` or `allAuthenticatedUsers` IAM binding before creating images or other artifacts. Keep the Terraform state bucket private, with uniform bucket-level access, public access prevention, and versioning:

```sh
gcloud projects get-iam-policy future-health-513202 --format=json
gcloud storage buckets create gs://future-health-513202-heat-safe-terraform \
  --project=future-health-513202 --location=me-central1 \
  --uniform-bucket-level-access --public-access-prevention
gcloud storage buckets update gs://future-health-513202-heat-safe-terraform \
  --project=future-health-513202 --versioning --public-access-prevention
gcloud storage buckets describe gs://future-health-513202-heat-safe-terraform --format=json
```

Create the bucket only if it does not exist. If it already exists, verify its owner and private settings before using it; do not reuse an unknown bucket. The bucket name is globally unique. Apply the base resources with the private GCS backend. Terraform state may contain sensitive resource metadata, so restrict bucket access to the operators who need it:

```sh
gcloud services enable serviceusage.googleapis.com cloudresourcemanager.googleapis.com storage.googleapis.com \
  --project=future-health-513202
terraform -chdir=01_population-health_climate-worker/cloud init -reconfigure \
  -backend-config=bucket=future-health-513202-heat-safe-terraform \
  -backend-config=prefix=heat-safe/cloud
terraform -chdir=01_population-health_climate-worker/cloud plan -out=/private/path/heat-safe.tfplan
terraform -chdir=01_population-health_climate-worker/cloud apply /private/path/heat-safe.tfplan
```

Keep the plan file outside the checkout and delete it after apply. Then follow [CHRISTINE-IAM.md](CHRISTINE-IAM.md) for the direct `gcloud` IAM grants. Complete the grants before creating deployment keys or running the workflows.

### Initialize the fixed secret values

First inspect all seven secrets for enabled versions. Run this initialization only when none has an enabled version. If all seven already have enabled versions, keep them: generating replacements would change application credentials and break the existing database roles or code digests. If only some have versions, stop and reconcile the partial setup using the existing values before proceeding.

```sh
gcloud secrets versions list heat-safe-sql-admin-password --project=future-health-513202 --filter='state:ENABLED'
gcloud secrets versions list heat-safe-main-db-password --project=future-health-513202 --filter='state:ENABLED'
gcloud secrets versions list heat-safe-sql-provisioner-password --project=future-health-513202 --filter='state:ENABLED'
gcloud secrets versions list heat-safe-main-gate-code --project=future-health-513202 --filter='state:ENABLED'
gcloud secrets versions list heat-safe-main-presenter-code --project=future-health-513202 --filter='state:ENABLED'
gcloud secrets versions list heat-safe-main-gate-sha256 --project=future-health-513202 --filter='state:ENABLED'
gcloud secrets versions list heat-safe-main-presenter-sha256 --project=future-health-513202 --filter='state:ENABLED'
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
gcloud secrets versions add heat-safe-sql-admin-password --project=future-health-513202 --data-file=/private/path/heat-safe-secrets/sql-admin-password
gcloud secrets versions add heat-safe-main-db-password --project=future-health-513202 --data-file=/private/path/heat-safe-secrets/main-db-password
gcloud secrets versions add heat-safe-sql-provisioner-password --project=future-health-513202 --data-file=/private/path/heat-safe-secrets/sql-provisioner-password
gcloud secrets versions add heat-safe-main-gate-code --project=future-health-513202 --data-file=/private/path/heat-safe-secrets/main-gate-code
gcloud secrets versions add heat-safe-main-presenter-code --project=future-health-513202 --data-file=/private/path/heat-safe-secrets/main-presenter-code
gcloud secrets versions add heat-safe-main-gate-sha256 --project=future-health-513202 --data-file=/private/path/heat-safe-secrets/main-gate-sha256
gcloud secrets versions add heat-safe-main-presenter-sha256 --project=future-health-513202 --data-file=/private/path/heat-safe-secrets/main-presenter-sha256
```

On a rerun with all seven versions present, skip the generation and `versions add` commands. If database setup remains incomplete, recover its existing passwords into new private files outside the checkout without printing them:

```sh
umask 077
mkdir -p -m 700 /private/path/heat-safe-secrets
gcloud secrets versions access latest --project=future-health-513202 --secret=heat-safe-sql-admin-password --out-file=/private/path/heat-safe-secrets/sql-admin-password
gcloud secrets versions access latest --project=future-health-513202 --secret=heat-safe-main-db-password --out-file=/private/path/heat-safe-secrets/main-db-password
gcloud secrets versions access latest --project=future-health-513202 --secret=heat-safe-sql-provisioner-password --out-file=/private/path/heat-safe-secrets/sql-provisioner-password
```

For the first installation, use `gcloud sql users set-password postgres --instance=heat-safe-pg16 --project=future-health-513202 --prompt-for-password` and enter the admin password from the private file at the hidden prompt. On a rerun, skip that password change if the admin password is already set to the stored value. In another terminal, run `cloud-sql-proxy future-health-513202:me-central1:heat-safe-pg16 --address=127.0.0.1 --port=5432`. With the proxy running, connect as admin (the `-W` prompt hides input):

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

The final query must return `f`. Create the main Cloud Run target once, before the main deployer runs. Omit both authentication flags and use `--quiet` so the CLI does not prompt for a public invoker grant:

```sh
gcloud run deploy heat-safe-app \
  --project=future-health-513202 --region=me-central1 \
  --image=us-docker.pkg.dev/cloudrun/container/hello \
  --service-account=heat-main-runtime@future-health-513202.iam.gserviceaccount.com --quiet
gcloud run services get-iam-policy heat-safe-app --project=future-health-513202 --region=me-central1 --format=json
```

The service policy must contain neither `allUsers` nor `allAuthenticatedUsers`. If Cloud Run attempts an IAM change and Ishka lacks permission, stop and have Christine complete or verify the private placeholder; do not request broader Editor grants or make the service public.

### Connect the existing GitHub environments

`heat-safe-main` and `heat-safe-preview` must each allow only the exact `main` branch and require no manual approval. Verify their branch policies and protection rules in GitHub before uploading keys:

```sh
gh api repos/rampadc/futurehealth-hackathon/environments/heat-safe-main
gh api repos/rampadc/futurehealth-hackathon/environments/heat-safe-main/deployment-branch-policies
gh api repos/rampadc/futurehealth-hackathon/environments/heat-safe-preview
gh api repos/rampadc/futurehealth-hackathon/environments/heat-safe-preview/deployment-branch-policies
```

Each environment must report one `main` branch policy, custom branch policies enabled, and no reviewer or wait-timer protection rule. There must be no repository-wide deployment keys. As the authorized GCP key creator and GitHub repository administrator, create one key per deployer in a private directory outside the checkout and upload each through stdin to its environment secret:

```sh
umask 077
mkdir -m 700 /private/path/heat-safe-keys
gcloud iam service-accounts keys create /private/path/heat-safe-keys/main.json \
  --iam-account=heat-main-deploy@future-health-513202.iam.gserviceaccount.com --project=future-health-513202
gcloud iam service-accounts keys create /private/path/heat-safe-keys/preview.json \
  --iam-account=heat-preview-deploy@future-health-513202.iam.gserviceaccount.com --project=future-health-513202
gh secret set GCP_MAIN_DEPLOY_KEY --repo rampadc/futurehealth-hackathon --env heat-safe-main < /private/path/heat-safe-keys/main.json
gh secret set GCP_PREVIEW_DEPLOY_KEY --repo rampadc/futurehealth-hackathon --env heat-safe-preview < /private/path/heat-safe-keys/preview.json
gh variable set GCP_PROJECT_ID --repo rampadc/futurehealth-hackathon --body future-health-513202
gh variable set GCP_REGION --repo rampadc/futurehealth-hackathon --body me-central1
gh variable set GCP_MAIN_DEPLOY_SA --repo rampadc/futurehealth-hackathon --body heat-main-deploy@future-health-513202.iam.gserviceaccount.com
gh variable set GCP_PREVIEW_DEPLOY_SA --repo rampadc/futurehealth-hackathon --body heat-preview-deploy@future-health-513202.iam.gserviceaccount.com
```

Delete the private key and secret files once stored in the intended secure stores. To rotate a key, create a replacement for the same service account, update its environment secret with `gh secret set ... < PRIVATE_FILE`, verify an automated run succeeds, then delete the old Google key with `gcloud iam service-accounts keys delete OLD_KEY_ID --iam-account=ACCOUNT`. In an exposure incident, disable or delete the affected key immediately and replace its environment secret.

The designated presenter (`user:ishka.quark@gmail.com` unless the owner changes the grant) can retrieve raw main codes and preview code pairs:

```sh
gcloud secrets versions access latest --project=future-health-513202 --secret=heat-safe-main-gate-code
gcloud secrets versions access latest --project=future-health-513202 --secret=heat-safe-main-presenter-code
gcloud secrets versions access latest --project=future-health-513202 --secret=heat-safe-pr-123-codes
```

Treat command output as sensitive. The main runtime receives only code digests and its DB password. The preview runtime receives code digests and its own preview DB password, and has no Secret Manager access. The SQL preview provisioner has `CREATEDB` and `CREATEROLE`, but no PostgreSQL admin or main database access.

## Trusted deployment controller

Only execute `cloud/deploy.py` from the checked-out default branch in privileged workflows. PR code is built without GCP credentials into an OCI archive; the trusted workflow verifies provenance and pushes it into the private preview repository. The controller never builds source. Its image input must be a digest in `heat-safe-main/app` or that PR's exact `heat-safe-previews/pr-N/app` path. CI checks anonymous manifest retrieval before and after push and deletes the just-pushed digest if it becomes public.

```sh
cd 01_population-health_climate-worker
python3 cloud/deploy.py deploy-main --image me-central1-docker.pkg.dev/future-health-513202/heat-safe-main/app@sha256:DIGEST --sha COMMIT_SHA
python3 cloud/deploy.py deploy-preview --pr 123 --image me-central1-docker.pkg.dev/future-health-513202/heat-safe-previews/pr-123/app@sha256:DIGEST --sha COMMIT_SHA
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
