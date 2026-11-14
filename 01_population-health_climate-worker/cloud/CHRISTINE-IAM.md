# Message to send Christine

Hi Christine — I’ve prepared the Cloud Run infrastructure in `future-health-513202`: four service accounts, two private image registries, PostgreSQL 16 and the main database, seven empty secrets, and private versioned Terraform state. The changes are in [draft PR #6](https://github.com/rampadc/futurehealth-hackathon/pull/6).

Could you run the `gcloud` commands below once using your GCP administrator account? They grant the deployment/runtime accounts their scoped access and let me read the seven setup secrets. They do not make me Owner or grant me ongoing IAM administration. No secret values, deployment keys, GitHub configuration, Terraform or setup script are involved in your step.

The seven named custom roles are not yet present. Their permission sets and the six conditions have been checked against Google IAM, and the grants have had an independent security review. Main and preview access stay separate, and BigQuery reads stay limited to `vectors`.

If a command fails, please send me the command and error text, without any tokens, keys or passwords. Once the grants are applied, I’ll verify access and finish the database, deployment keys, CI/CD and previews. You won’t need to handle routine deployments afterward.

## Commands

```sh
gcloud iam roles create heatSafeImageCleanup --project=future-health-513202 --title='Heat-Safe image cleanup' --permissions=artifactregistry.repositories.deleteArtifacts,artifactregistry.packages.delete,artifactregistry.versions.delete,artifactregistry.tags.delete --stage=GA
gcloud iam roles create heatSafeRunCreate --project=future-health-513202 --title='Heat-Safe Cloud Run create' --permissions=run.services.create --stage=GA
gcloud iam roles create heatSafeRunManage --project=future-health-513202 --title='Heat-Safe Cloud Run existing service management' --permissions=run.services.get,run.services.update,run.services.delete,run.services.getIamPolicy,run.services.setIamPolicy --stage=GA
gcloud iam roles create heatSafeRunRead --project=future-health-513202 --title='Heat-Safe preview service inventory' --permissions=run.services.list --stage=GA
gcloud iam roles create heatSafeSecretCreate --project=future-health-513202 --title='Heat-Safe preview secret creation' --permissions=secretmanager.secrets.create,secretmanager.secrets.list --stage=GA
gcloud iam roles create heatSafeSecretManage --project=future-health-513202 --title='Heat-Safe preview secret management' --permissions=secretmanager.secrets.get,secretmanager.secrets.delete,secretmanager.secrets.getIamPolicy,secretmanager.secrets.setIamPolicy,secretmanager.versions.add,secretmanager.versions.get,secretmanager.versions.access,secretmanager.versions.list --stage=GA
gcloud iam roles create heatSafeSqlInventory --project=future-health-513202 --title='Heat-Safe SQL database inventory' --permissions=cloudsql.databases.list --stage=GA
gcloud projects add-iam-policy-binding future-health-513202 --member='serviceAccount:heat-main-runtime@future-health-513202.iam.gserviceaccount.com' --role=roles/aiplatform.user --condition=None
gcloud projects add-iam-policy-binding future-health-513202 --member='serviceAccount:heat-main-runtime@future-health-513202.iam.gserviceaccount.com' --role=roles/bigquery.jobUser --condition=None
gcloud projects add-iam-policy-binding future-health-513202 --member='serviceAccount:heat-preview-runtime@future-health-513202.iam.gserviceaccount.com' --role=roles/aiplatform.user --condition=None
gcloud projects add-iam-policy-binding future-health-513202 --member='serviceAccount:heat-preview-runtime@future-health-513202.iam.gserviceaccount.com' --role=roles/bigquery.jobUser --condition=None
gcloud projects add-iam-policy-binding future-health-513202 --member='serviceAccount:heat-main-runtime@future-health-513202.iam.gserviceaccount.com' --role=roles/bigquery.dataViewer --condition="title=VectorsOnly,expression=resource.service == 'bigquery.googleapis.com' && (resource.name == 'projects/future-health-513202/datasets/vectors' || resource.name.startsWith('projects/future-health-513202/datasets/vectors/'))"
gcloud projects add-iam-policy-binding future-health-513202 --member='serviceAccount:heat-preview-runtime@future-health-513202.iam.gserviceaccount.com' --role=roles/bigquery.dataViewer --condition="title=VectorsOnly,expression=resource.service == 'bigquery.googleapis.com' && (resource.name == 'projects/future-health-513202/datasets/vectors' || resource.name.startsWith('projects/future-health-513202/datasets/vectors/'))"
gcloud projects add-iam-policy-binding future-health-513202 --member='user:ishka.quark@gmail.com' --role=roles/secretmanager.secretAccessor --condition="title=PreviewCodesOnly,expression=resource.type == 'secretmanager.googleapis.com/SecretVersion' && (resource.name.startsWith('projects/future-health-513202/secrets/heat-safe-pr-') || resource.name.startsWith('projects/350411621586/secrets/heat-safe-pr-')) && resource.name.extract('/secrets/{secret}/versions/').endsWith('-codes')"
gcloud projects add-iam-policy-binding future-health-513202 --member='serviceAccount:heat-main-runtime@future-health-513202.iam.gserviceaccount.com' --role=roles/cloudsql.client --condition="title=HeatSafeInstanceOnly,expression=resource.name == 'projects/future-health-513202/instances/heat-safe-pg16' && resource.service == 'sqladmin.googleapis.com'"
gcloud projects add-iam-policy-binding future-health-513202 --member='serviceAccount:heat-preview-runtime@future-health-513202.iam.gserviceaccount.com' --role=roles/cloudsql.client --condition="title=HeatSafeInstanceOnly,expression=resource.name == 'projects/future-health-513202/instances/heat-safe-pg16' && resource.service == 'sqladmin.googleapis.com'"
gcloud projects add-iam-policy-binding future-health-513202 --member='serviceAccount:heat-preview-deploy@future-health-513202.iam.gserviceaccount.com' --role=roles/cloudsql.client --condition="title=HeatSafeInstanceOnly,expression=resource.name == 'projects/future-health-513202/instances/heat-safe-pg16' && resource.service == 'sqladmin.googleapis.com'"
gcloud projects add-iam-policy-binding future-health-513202 --member='serviceAccount:heat-preview-deploy@future-health-513202.iam.gserviceaccount.com' --role=projects/future-health-513202/roles/heatSafeRunRead --condition=None
gcloud projects add-iam-policy-binding future-health-513202 --member='serviceAccount:heat-preview-deploy@future-health-513202.iam.gserviceaccount.com' --role=projects/future-health-513202/roles/heatSafeRunCreate --condition=None
gcloud projects add-iam-policy-binding future-health-513202 --member='serviceAccount:heat-main-deploy@future-health-513202.iam.gserviceaccount.com' --role=projects/future-health-513202/roles/heatSafeRunManage --condition="title=MainServiceOnly,expression=resource.name == 'projects/future-health-513202/locations/me-central1/services/heat-safe-app' || resource.name == 'projects/350411621586/locations/me-central1/services/heat-safe-app'"
gcloud projects add-iam-policy-binding future-health-513202 --member='serviceAccount:heat-preview-deploy@future-health-513202.iam.gserviceaccount.com' --role=projects/future-health-513202/roles/heatSafeRunManage --condition="title=PreviewServicesOnly,expression=resource.name.startsWith('projects/future-health-513202/locations/me-central1/services/heat-safe-pr-') || resource.name.startsWith('projects/350411621586/locations/me-central1/services/heat-safe-pr-')"
gcloud projects add-iam-policy-binding future-health-513202 --member='serviceAccount:heat-preview-deploy@future-health-513202.iam.gserviceaccount.com' --role=projects/future-health-513202/roles/heatSafeSecretCreate --condition=None
gcloud projects add-iam-policy-binding future-health-513202 --member='serviceAccount:heat-preview-deploy@future-health-513202.iam.gserviceaccount.com' --role=projects/future-health-513202/roles/heatSafeSecretManage --condition="title=PreviewSecretsOnly,expression=resource.name.startsWith('projects/future-health-513202/secrets/heat-safe-pr-') || resource.name.startsWith('projects/350411621586/secrets/heat-safe-pr-')"
gcloud projects add-iam-policy-binding future-health-513202 --member='serviceAccount:heat-preview-deploy@future-health-513202.iam.gserviceaccount.com' --role=projects/future-health-513202/roles/heatSafeSqlInventory --condition=None
gcloud artifacts repositories add-iam-policy-binding heat-safe-main --project=future-health-513202 --location=me-central1 --member='serviceAccount:heat-main-deploy@future-health-513202.iam.gserviceaccount.com' --role=roles/artifactregistry.writer
gcloud artifacts repositories add-iam-policy-binding heat-safe-main --project=future-health-513202 --location=me-central1 --member='serviceAccount:heat-main-deploy@future-health-513202.iam.gserviceaccount.com' --role=projects/future-health-513202/roles/heatSafeImageCleanup
gcloud artifacts repositories add-iam-policy-binding heat-safe-previews --project=future-health-513202 --location=me-central1 --member='serviceAccount:heat-preview-deploy@future-health-513202.iam.gserviceaccount.com' --role=roles/artifactregistry.writer
gcloud artifacts repositories add-iam-policy-binding heat-safe-previews --project=future-health-513202 --location=me-central1 --member='serviceAccount:heat-preview-deploy@future-health-513202.iam.gserviceaccount.com' --role=projects/future-health-513202/roles/heatSafeImageCleanup
gcloud iam service-accounts add-iam-policy-binding heat-main-runtime@future-health-513202.iam.gserviceaccount.com --project=future-health-513202 --member='serviceAccount:heat-main-deploy@future-health-513202.iam.gserviceaccount.com' --role=roles/iam.serviceAccountUser
gcloud iam service-accounts add-iam-policy-binding heat-preview-runtime@future-health-513202.iam.gserviceaccount.com --project=future-health-513202 --member='serviceAccount:heat-preview-deploy@future-health-513202.iam.gserviceaccount.com' --role=roles/iam.serviceAccountUser
gcloud secrets add-iam-policy-binding heat-safe-main-gate-sha256 --project=future-health-513202 --member='serviceAccount:heat-main-runtime@future-health-513202.iam.gserviceaccount.com' --role=roles/secretmanager.secretAccessor
gcloud secrets add-iam-policy-binding heat-safe-main-presenter-sha256 --project=future-health-513202 --member='serviceAccount:heat-main-runtime@future-health-513202.iam.gserviceaccount.com' --role=roles/secretmanager.secretAccessor
gcloud secrets add-iam-policy-binding heat-safe-main-db-password --project=future-health-513202 --member='serviceAccount:heat-main-runtime@future-health-513202.iam.gserviceaccount.com' --role=roles/secretmanager.secretAccessor
gcloud secrets add-iam-policy-binding heat-safe-sql-provisioner-password --project=future-health-513202 --member='serviceAccount:heat-preview-deploy@future-health-513202.iam.gserviceaccount.com' --role=roles/secretmanager.secretAccessor
gcloud secrets add-iam-policy-binding heat-safe-main-gate-code --project=future-health-513202 --member='user:ishka.quark@gmail.com' --role=roles/secretmanager.secretAccessor
gcloud secrets add-iam-policy-binding heat-safe-main-presenter-code --project=future-health-513202 --member='user:ishka.quark@gmail.com' --role=roles/secretmanager.secretAccessor
gcloud secrets add-iam-policy-binding heat-safe-main-gate-sha256 --project=future-health-513202 --member='user:ishka.quark@gmail.com' --role=roles/secretmanager.secretAccessor
gcloud secrets add-iam-policy-binding heat-safe-main-presenter-sha256 --project=future-health-513202 --member='user:ishka.quark@gmail.com' --role=roles/secretmanager.secretAccessor
gcloud secrets add-iam-policy-binding heat-safe-main-db-password --project=future-health-513202 --member='user:ishka.quark@gmail.com' --role=roles/secretmanager.secretAccessor
gcloud secrets add-iam-policy-binding heat-safe-sql-provisioner-password --project=future-health-513202 --member='user:ishka.quark@gmail.com' --role=roles/secretmanager.secretAccessor
gcloud secrets add-iam-policy-binding heat-safe-sql-admin-password --project=future-health-513202 --member='user:ishka.quark@gmail.com' --role=roles/secretmanager.secretAccessor
```

---

## Operator reference

The block above is the first-time handoff. IAM changes can take a few minutes to propagate. Creation and inventory permissions are project-scoped because those operations have no existing target resource; management of existing services and secrets remains name-restricted. The operator’s seven secret grants include SQL administrator credentials and are intentionally limited to the designated person and those seven secrets.

## If a custom role already exists

If a `gcloud iam roles create` command reports that its role already exists, run only that role's matching `update` command below. Each update sets the exact permissions of that role; do not run this whole block automatically after the first-time block.

```sh
gcloud iam roles update heatSafeImageCleanup --project=future-health-513202 --title='Heat-Safe image cleanup' --permissions=artifactregistry.repositories.deleteArtifacts,artifactregistry.packages.delete,artifactregistry.versions.delete,artifactregistry.tags.delete --stage=GA
gcloud iam roles update heatSafeRunCreate --project=future-health-513202 --title='Heat-Safe Cloud Run create' --permissions=run.services.create --stage=GA
gcloud iam roles update heatSafeRunManage --project=future-health-513202 --title='Heat-Safe Cloud Run existing service management' --permissions=run.services.get,run.services.update,run.services.delete,run.services.getIamPolicy,run.services.setIamPolicy --stage=GA
gcloud iam roles update heatSafeRunRead --project=future-health-513202 --title='Heat-Safe preview service inventory' --permissions=run.services.list --stage=GA
gcloud iam roles update heatSafeSecretCreate --project=future-health-513202 --title='Heat-Safe preview secret creation' --permissions=secretmanager.secrets.create,secretmanager.secrets.list --stage=GA
gcloud iam roles update heatSafeSecretManage --project=future-health-513202 --title='Heat-Safe preview secret management' --permissions=secretmanager.secrets.get,secretmanager.secrets.delete,secretmanager.secrets.getIamPolicy,secretmanager.secrets.setIamPolicy,secretmanager.versions.add,secretmanager.versions.get,secretmanager.versions.access,secretmanager.versions.list --stage=GA
gcloud iam roles update heatSafeSqlInventory --project=future-health-513202 --title='Heat-Safe SQL database inventory' --permissions=cloudsql.databases.list --stage=GA
```
