# Short-lived public demo of the supervisor agent with the ADK dev UI. See README.md before applying:
# anyone with the URL can use it (and spend the project's Gemini budget). `terraform destroy` afterwards.

locals {
  repo_root = abspath("${path.module}/..")

  # Everything that goes into the image. The hash names the image, so a change here builds a new
  # image and a new Cloud Run revision, and no change means no rebuild (README note 1)
  image_inputs = sort(concat(
    [for f in fileset(local.repo_root, "{src,agents}/**/*.{py,yaml}") : f],
    [for f in fileset(local.repo_root, "data/heat_safe/raw/weather/*.csv") : f],
    ["data/heat_safe/processed/onet_work_context_plan_roles.csv", "server.py", "Dockerfile", ".gcloudignore",
     "pyproject.toml", "uv.lock"],
  ))
  image_hash = substr(sha256(join("", [for f in local.image_inputs : filesha256("${local.repo_root}/${f}")])), 0, 12)
  image      = "${var.region}-docker.pkg.dev/${var.project}/${google_artifact_registry_repository.images.repository_id}/supervisor:${local.image_hash}"
}

# --- APIs: all already enabled by hand; declaring them makes the dependency visible -------------
resource "google_project_service" "apis" {
  for_each = toset([
    "run.googleapis.com",
    "artifactregistry.googleapis.com",
    "cloudbuild.googleapis.com",
    "aiplatform.googleapis.com",
    "bigquery.googleapis.com",
  ])
  service            = each.value
  disable_on_destroy = false # destroying the demo must not switch off APIs the rest of the project uses
}

# --- Where images live ---------------------------------------------------------------------------
resource "google_artifact_registry_repository" "images" {
  repository_id = "heat-safe"
  location      = var.region
  format        = "DOCKER"
  description   = "Heat-Safe Crew images"
  depends_on    = [google_project_service.apis]
}

# --- Identity the agent runs as: only what its tools call (README note 4) ------------------------
resource "google_service_account" "supervisor" {
  account_id   = "supervisor-demo"
  display_name = "Heat-Safe supervisor agent (Cloud Run demo)"
}

resource "google_project_iam_member" "supervisor" {
  for_each = toset([
    "roles/aiplatform.user",  # Gemini (global endpoint) and gemini-embedding-001
    "roles/bigquery.jobUser", # run the VECTOR_SEARCH query and telemetry writes
  ])
  project = var.project
  role    = each.value
  member  = google_service_account.supervisor.member
}

# Dataset-level grants: Terraform does not own these datasets (tools/ scripts created them)
resource "google_bigquery_dataset_iam_member" "vectors_read" {
  dataset_id = "vectors"
  role       = "roles/bigquery.dataViewer"
  member     = google_service_account.supervisor.member
}

resource "google_bigquery_dataset_iam_member" "telemetry_write" {
  dataset_id = "telemetry"
  role       = "roles/bigquery.dataEditor" # BigQueryAgentAnalyticsPlugin appends to agent_events
  member     = google_service_account.supervisor.member
}

# --- Build identity and staging (README note 2) --------------------------------------------------
# Without these, Cloud Build runs as the Compute Engine default account (no roles here: 403) and
# stages the source in an auto-created US bucket. A dedicated account and a UAE bucket fix both.
resource "google_service_account" "build" {
  account_id   = "image-build"
  display_name = "Cloud Build: builds and pushes Heat-Safe images"
}

resource "google_storage_bucket" "builds" {
  name                        = "${var.project}-builds"
  location                    = var.region
  uniform_bucket_level_access = true
  public_access_prevention    = "enforced"
  force_destroy               = true # only build sources and logs: safe to delete with the demo

  lifecycle_rule {
    condition { age = 7 }
    action { type = "Delete" }
  }
}

resource "google_storage_bucket_iam_member" "build_staging" {
  for_each = toset([
    "roles/storage.objectAdmin",        # read the uploaded source, write the build log
    "roles/storage.legacyBucketReader", # storage.buckets.get: Cloud Build checks the bucket itself first
  ])
  bucket = google_storage_bucket.builds.name
  role   = each.value
  member = google_service_account.build.member
}

resource "google_artifact_registry_repository_iam_member" "build_push" {
  repository = google_artifact_registry_repository.images.name
  location   = var.region
  role       = "roles/artifactregistry.writer"
  member     = google_service_account.build.member
}

resource "google_project_iam_member" "build_logs" {
  project = var.project
  role    = "roles/logging.logWriter"
  member  = google_service_account.build.member
}

# --- Build: a demo shortcut. Real projects build in CI and pass Terraform the tag (README note 1) -
resource "terraform_data" "image" {
  triggers_replace = local.image_hash
  input            = local.image

  provisioner "local-exec" {
    working_dir = local.repo_root
    command = join(" ", [
      "gcloud builds submit . --quiet --project=${var.project} --region=${var.region}",
      "--tag=${self.input}",
      "--service-account=${google_service_account.build.id}",
      "--gcs-source-staging-dir=${google_storage_bucket.builds.url}/source",
      "--gcs-log-dir=${google_storage_bucket.builds.url}/logs",
    ])
  }

  depends_on = [
    google_storage_bucket_iam_member.build_staging,
    google_artifact_registry_repository_iam_member.build_push,
    google_project_iam_member.build_logs,
  ]
}

# --- The service ---------------------------------------------------------------------------------
resource "google_cloud_run_v2_service" "supervisor" {
  name                = "supervisor-demo"
  location            = var.region
  ingress             = "INGRESS_TRAFFIC_ALL"
  deletion_protection = false # so `terraform destroy` can remove it (provider default is true)

  template {
    service_account = google_service_account.supervisor.email
    timeout         = "300s"

    scaling {
      min_instance_count = 0 # scale to zero: free when nobody is using it
      max_instance_count = 1 # adk web keeps sessions in memory; one instance, and a cost cap (README note 5)
    }

    containers {
      image = terraform_data.image.output

      resources {
        limits = {
          cpu    = "1"
          memory = "1Gi"
        }
        cpu_idle = true # CPU billed only while handling requests
      }

      env {
        name  = "GOOGLE_CLOUD_PROJECT"
        value = var.project
      }
      env {
        name  = "GOOGLE_CLOUD_LOCATION"
        value = var.region
      }
      env {
        name  = "HEAT_SAFE_TODAY"
        value = var.demo_today
      }
    }
  }

  depends_on = [
    google_project_iam_member.supervisor,
    google_bigquery_dataset_iam_member.vectors_read,
    google_bigquery_dataset_iam_member.telemetry_write,
  ]
}

# Public: anyone with the URL, no login. Deliberate for a short demo (README note 6)
resource "google_cloud_run_v2_service_iam_member" "public" {
  name     = google_cloud_run_v2_service.supervisor.name
  location = var.region
  role     = "roles/run.invoker"
  member   = "allUsers"
}
