data "google_project" "current" {
  project_id = var.project
}

locals {
  apis = toset([
    "artifactregistry.googleapis.com",
    "aiplatform.googleapis.com",
    "bigquery.googleapis.com",
    "iam.googleapis.com",
    "iamcredentials.googleapis.com",
    "sts.googleapis.com",
    "run.googleapis.com",
    "secretmanager.googleapis.com",
    "sqladmin.googleapis.com",
  ])
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
    edition           = "ENTERPRISE"
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

resource "google_secret_manager_secret" "sql_admin" {
  secret_id = "heat-safe-sql-admin-password"
  replication {
    user_managed {
      replicas { location = var.region }
    }
  }
  depends_on = [google_project_service.apis]
}
