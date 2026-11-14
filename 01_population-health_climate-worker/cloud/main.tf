data "google_project" "current" {
  project_id = var.project
}

locals {
  apis = toset([
    "artifactregistry.googleapis.com",
    "aiplatform.googleapis.com",
    "bigquery.googleapis.com",
    "iam.googleapis.com",
    "run.googleapis.com",
    "secretmanager.googleapis.com",
    "sqladmin.googleapis.com",
  ])
  main_service   = "heat-safe-app"
  preview_prefix = "heat-safe-pr-"
  main_resource  = "projects/${var.project}/locations/${var.region}/services/${local.main_service}"
  preview_resource_prefixes = [
    "projects/${var.project}/locations/${var.region}/services/${local.preview_prefix}",
    "projects/${data.google_project.current.number}/locations/${var.region}/services/${local.preview_prefix}",
  ]
  main_resource_names = [
    local.main_resource,
    "projects/${data.google_project.current.number}/locations/${var.region}/services/${local.main_service}",
  ]
  preview_secret_prefixes = [
    "projects/${var.project}/secrets/${local.preview_prefix}",
    "projects/${data.google_project.current.number}/secrets/${local.preview_prefix}",
  ]
  main_service_condition    = join(" || ", [for name in local.main_resource_names : "resource.name == '${name}'"])
  preview_service_condition = join(" || ", [for prefix in local.preview_resource_prefixes : "resource.name.startsWith('${prefix}')"])
  preview_secret_condition  = join(" || ", [for prefix in local.preview_secret_prefixes : "resource.name.startsWith('${prefix}')"])
}

resource "google_project_service" "apis" {
  for_each           = local.apis
  service            = each.value
  disable_on_destroy = false
}

resource "google_artifact_registry_repository" "images" {
  for_each      = toset(["heat-safe-main", "heat-safe-previews"])
  location      = var.region
  repository_id = each.value
  format        = "DOCKER"
  description   = "Private Heat-Safe ${each.value} images"
  depends_on    = [google_project_service.apis]
}

resource "google_sql_database_instance" "app" {
  name                = "heat-safe-pg16"
  region              = var.region
  database_version    = "POSTGRES_16"
  deletion_protection = true
  settings {
    tier              = "db-custom-1-3840"
    availability_type = "ZONAL"
    disk_autoresize   = true
    disk_size         = 20
    disk_type         = "PD_SSD"
    backup_configuration {
      enabled                        = true
      point_in_time_recovery_enabled = true
    }
    ip_configuration {
      ipv4_enabled = true
    }
  }
  depends_on = [google_project_service.apis]
}

resource "google_sql_database" "main" {
  name     = "heat_safe_main"
  instance = google_sql_database_instance.app.name
}

resource "google_service_account" "main_runtime" {
  account_id   = "heat-main-runtime"
  display_name = "Heat-Safe main Cloud Run runtime"
}
resource "google_service_account" "preview_runtime" {
  account_id   = "heat-preview-runtime"
  display_name = "Heat-Safe preview Cloud Run runtime"
}
resource "google_service_account" "main_deploy" {
  account_id   = "heat-main-deploy"
  display_name = "Trusted main deployment workflow"
}
resource "google_service_account" "preview_deploy" {
  account_id   = "heat-preview-deploy"
  display_name = "Trusted preview deployment workflow"
}

resource "google_project_iam_member" "main_runtime" {
  for_each = toset(["roles/aiplatform.user", "roles/bigquery.jobUser"])
  project  = var.project
  role     = each.value
  member   = google_service_account.main_runtime.member
}
resource "google_bigquery_dataset_iam_member" "main_vectors" {
  dataset_id = "vectors"
  role       = "roles/bigquery.dataViewer"
  member     = google_service_account.main_runtime.member
}
resource "google_project_iam_member" "preview_runtime" {
  for_each = toset(["roles/aiplatform.user", "roles/bigquery.jobUser"])
  project  = var.project
  role     = each.value
  member   = google_service_account.preview_runtime.member
}
resource "google_bigquery_dataset_iam_member" "preview_vectors" {
  dataset_id = "vectors"
  role       = "roles/bigquery.dataViewer"
  member     = google_service_account.preview_runtime.member
}

resource "google_secret_manager_secret" "main_gate" {
  secret_id = "heat-safe-main-gate-code"
  replication {
    user_managed {
      replicas { location = var.region }
    }
  }
  depends_on = [google_project_service.apis]
}
resource "google_secret_manager_secret" "main_presenter" {
  secret_id = "heat-safe-main-presenter-code"
  replication {
    user_managed {
      replicas { location = var.region }
    }
  }
  depends_on = [google_project_service.apis]
}
resource "google_secret_manager_secret" "main_gate_hash" {
  secret_id = "heat-safe-main-gate-sha256"
  replication {
    user_managed {
      replicas { location = var.region }
    }
  }
  depends_on = [google_project_service.apis]
}
resource "google_secret_manager_secret" "main_presenter_hash" {
  secret_id = "heat-safe-main-presenter-sha256"
  replication {
    user_managed {
      replicas { location = var.region }
    }
  }
  depends_on = [google_project_service.apis]
}
resource "google_secret_manager_secret" "main_db" {
  secret_id = "heat-safe-main-db-password"
  replication {
    user_managed {
      replicas { location = var.region }
    }
  }
  depends_on = [google_project_service.apis]
}
resource "google_secret_manager_secret" "sql_provisioner" {
  secret_id = "heat-safe-sql-provisioner-password"
  replication {
    user_managed {
      replicas { location = var.region }
    }
  }
  depends_on = [google_project_service.apis]
}
resource "google_secret_manager_secret_iam_member" "main_gate_access" {
  secret_id = google_secret_manager_secret.main_gate_hash.id
  role      = "roles/secretmanager.secretAccessor"
  member    = google_service_account.main_runtime.member
}
resource "google_secret_manager_secret_iam_member" "main_db_access" {
  secret_id = google_secret_manager_secret.main_db.id
  role      = "roles/secretmanager.secretAccessor"
  member    = google_service_account.main_runtime.member
}
resource "google_secret_manager_secret_iam_member" "main_presenter_access" {
  secret_id = google_secret_manager_secret.main_presenter_hash.id
  role      = "roles/secretmanager.secretAccessor"
  member    = google_service_account.main_runtime.member
}
resource "google_secret_manager_secret_iam_member" "presenter_main_codes" {
  for_each = {
    gate      = google_secret_manager_secret.main_gate.id
    presenter = google_secret_manager_secret.main_presenter.id
  }
  secret_id = each.value
  role      = "roles/secretmanager.secretAccessor"
  member    = var.presenter_member
}
resource "google_project_iam_member" "presenter_preview_codes" {
  project = var.project
  role    = "roles/secretmanager.secretAccessor"
  member  = var.presenter_member
  condition {
    title      = "PreviewCodesOnly"
    expression = <<-EOT
      resource.type == 'secretmanager.googleapis.com/SecretVersion' &&
      (resource.name.startsWith('projects/${var.project}/secrets/heat-safe-pr-') ||
       resource.name.startsWith('projects/${data.google_project.current.number}/secrets/heat-safe-pr-')) &&
      resource.name.extract('/secrets/{secret}/versions/').endsWith('-codes')
    EOT
  }
}
resource "google_secret_manager_secret_iam_member" "provisioner_access" {
  secret_id = google_secret_manager_secret.sql_provisioner.id
  role      = "roles/secretmanager.secretAccessor"
  member    = google_service_account.preview_deploy.member
}
resource "google_project_iam_member" "cloudsql_client" {
  for_each = {
    main_runtime    = google_service_account.main_runtime.member
    preview_runtime = google_service_account.preview_runtime.member
    preview_deploy  = google_service_account.preview_deploy.member
  }
  project = var.project
  role    = "roles/cloudsql.client"
  member  = each.value
  condition {
    title      = "HeatSafeInstanceOnly"
    expression = "resource.name == 'projects/${var.project}/instances/${google_sql_database_instance.app.name}' && resource.service == 'sqladmin.googleapis.com'"
  }
}

resource "google_artifact_registry_repository_iam_member" "main_push" {
  location   = var.region
  repository = google_artifact_registry_repository.images["heat-safe-main"].name
  role       = "roles/artifactregistry.writer"
  member     = google_service_account.main_deploy.member
}
resource "google_artifact_registry_repository_iam_member" "preview_push" {
  location   = var.region
  repository = google_artifact_registry_repository.images["heat-safe-previews"].name
  role       = "roles/artifactregistry.writer"
  member     = google_service_account.preview_deploy.member
}
resource "google_project_iam_custom_role" "image_cleanup" {
  role_id = "heatSafeImageCleanup"
  title   = "Heat-Safe image cleanup"
  permissions = [
    "artifactregistry.repositories.deleteArtifacts",
    "artifactregistry.packages.delete",
    "artifactregistry.versions.delete",
    "artifactregistry.tags.delete",
  ]
}
resource "google_artifact_registry_repository_iam_member" "image_cleanup" {
  for_each = {
    main     = { repository = google_artifact_registry_repository.images["heat-safe-main"].name, member = google_service_account.main_deploy.member }
    previews = { repository = google_artifact_registry_repository.images["heat-safe-previews"].name, member = google_service_account.preview_deploy.member }
  }
  location   = var.region
  repository = each.value.repository
  role       = google_project_iam_custom_role.image_cleanup.id
  member     = each.value.member
}
resource "google_service_account_iam_member" "main_act_as" {
  service_account_id = google_service_account.main_runtime.name
  role               = "roles/iam.serviceAccountUser"
  member             = google_service_account.main_deploy.member
}
resource "google_service_account_iam_member" "preview_act_as" {
  service_account_id = google_service_account.preview_runtime.name
  role               = "roles/iam.serviceAccountUser"
  member             = google_service_account.preview_deploy.member
}

# Creation has no target resource to condition; only trusted default-branch code receives it.
resource "google_project_iam_custom_role" "run_create" {
  role_id     = "heatSafeRunCreate"
  title       = "Heat-Safe Cloud Run create"
  permissions = ["run.services.create"]
}
resource "google_project_iam_custom_role" "run_manage" {
  role_id = "heatSafeRunManage"
  title   = "Heat-Safe Cloud Run existing service management"
  permissions = [
    "run.services.get", "run.services.update", "run.services.delete",
    "run.services.getIamPolicy", "run.services.setIamPolicy",
  ]
}
resource "google_project_iam_custom_role" "run_read" {
  role_id     = "heatSafeRunRead"
  title       = "Heat-Safe preview service inventory"
  permissions = ["run.services.list"]
}
resource "google_project_iam_member" "deploy_run_read" {
  project = var.project
  role    = google_project_iam_custom_role.run_read.id
  member  = google_service_account.preview_deploy.member
}
resource "google_project_iam_member" "preview_run_create" {
  project = var.project
  role    = google_project_iam_custom_role.run_create.id
  member  = google_service_account.preview_deploy.member
}
resource "google_project_iam_member" "main_run_manage" {
  project = var.project
  role    = google_project_iam_custom_role.run_manage.id
  member  = google_service_account.main_deploy.member
  condition {
    title      = "MainServiceOnly"
    expression = local.main_service_condition
  }
}
resource "google_project_iam_member" "preview_run_manage" {
  project = var.project
  role    = google_project_iam_custom_role.run_manage.id
  member  = google_service_account.preview_deploy.member
  condition {
    title      = "PreviewServicesOnly"
    expression = local.preview_service_condition
  }
}

resource "google_project_iam_custom_role" "secret_create" {
  role_id     = "heatSafeSecretCreate"
  title       = "Heat-Safe preview secret creation"
  permissions = ["secretmanager.secrets.create", "secretmanager.secrets.list"]
}
resource "google_project_iam_custom_role" "secret_manage" {
  role_id = "heatSafeSecretManage"
  title   = "Heat-Safe preview secret management"
  permissions = [
    "secretmanager.secrets.get", "secretmanager.secrets.delete",
    "secretmanager.secrets.getIamPolicy", "secretmanager.secrets.setIamPolicy",
    "secretmanager.versions.add", "secretmanager.versions.get", "secretmanager.versions.access", "secretmanager.versions.list",
  ]
}
resource "google_project_iam_member" "preview_secret_create" {
  project = var.project
  role    = google_project_iam_custom_role.secret_create.id
  member  = google_service_account.preview_deploy.member
}
resource "google_project_iam_member" "preview_secret_manage" {
  project = var.project
  role    = google_project_iam_custom_role.secret_manage.id
  member  = google_service_account.preview_deploy.member
  condition {
    title      = "PreviewSecretsOnly"
    expression = local.preview_secret_condition
  }
}
resource "google_project_iam_custom_role" "sql_inventory" {
  role_id     = "heatSafeSqlInventory"
  title       = "Heat-Safe SQL database inventory"
  permissions = ["cloudsql.databases.list"]
}
resource "google_project_iam_member" "preview_sql_inventory" {
  project = var.project
  role    = google_project_iam_custom_role.sql_inventory.id
  member  = google_service_account.preview_deploy.member
}
