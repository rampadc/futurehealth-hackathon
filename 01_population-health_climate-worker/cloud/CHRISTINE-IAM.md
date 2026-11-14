# Christine: Heat-Safe IAM handoff

Run the first-time block below in a terminal authenticated as an account already authorized to manage IAM in project `future-health-513202`. Ishka prepares the four service accounts, both Artifact Registry repositories, the Cloud SQL instance, and all seven named secrets before this handoff. No secret values are needed. The first-time block grants no Owner or ongoing IAM administrator role.

This handoff uses the Google Cloud CLI directly. It does not run Terraform, the project bootstrap, or a custom CLI. IAM policy changes can take a few minutes to propagate.

The two BigQuery Data Viewer grants are conditional on the `vectors` dataset and its descendants. Project-wide BigQuery job creation remains a separate `jobUser` grant. The main runtime reads only its two code digests and main database password. The preview deployer reads only the SQL provisioner password here. The seven grants to `ishka.quark@gmail.com` cover all bootstrap secrets, including the SQL admin password; these are sensitive administrator credentials.

`heatSafeRunCreate`, `heatSafeSecretCreate`, `heatSafeRunRead`, and `heatSafeSqlInventory` contain create/list permissions, which cannot be restricted to an existing target resource by a resource-name condition. They are granted only to the preview deployment identity used by the trusted deployment workflow.

## First-time handoff

The seven custom roles are not yet present in this project. After the owner creates the named resources, copy this entire block once:

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

## Verify

```sh
gcloud iam roles list --project=future-health-513202 --format='table(name,title,stage)'
gcloud projects get-iam-policy future-health-513202 --format=json
gcloud artifacts repositories get-iam-policy heat-safe-main --project=future-health-513202 --location=me-central1 --format=json
gcloud artifacts repositories get-iam-policy heat-safe-previews --project=future-health-513202 --location=me-central1 --format=json
gcloud iam service-accounts get-iam-policy heat-main-runtime@future-health-513202.iam.gserviceaccount.com --project=future-health-513202 --format=json
gcloud iam service-accounts get-iam-policy heat-preview-runtime@future-health-513202.iam.gserviceaccount.com --project=future-health-513202 --format=json
gcloud secrets get-iam-policy heat-safe-main-gate-code --project=future-health-513202 --format=json
gcloud secrets get-iam-policy heat-safe-main-presenter-code --project=future-health-513202 --format=json
gcloud secrets get-iam-policy heat-safe-main-gate-sha256 --project=future-health-513202 --format=json
gcloud secrets get-iam-policy heat-safe-main-presenter-sha256 --project=future-health-513202 --format=json
gcloud secrets get-iam-policy heat-safe-main-db-password --project=future-health-513202 --format=json
gcloud secrets get-iam-policy heat-safe-sql-provisioner-password --project=future-health-513202 --format=json
gcloud secrets get-iam-policy heat-safe-sql-admin-password --project=future-health-513202 --format=json
```

Check that the project policy has the condition titles and expressions shown above, that repository and service-account policies contain the intended deployer bindings, and that each of the seven secret policies includes the designated user. Do not replace the `vectors` dataset ACL or add `roles/bigquery.dataViewer` without its `VectorsOnly` condition.
