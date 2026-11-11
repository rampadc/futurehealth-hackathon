terraform {
  required_version = ">= 1.6"

  required_providers {
    google = {
      source  = "hashicorp/google"
      version = "~> 7.0" # exact version pinned in .terraform.lock.hcl (commit it)
    }
  }

  # Local state (terraform.tfstate, gitignored) is fine for one person and a short-lived demo.
  # Shared or long-lived: a GCS backend. See README "What changes for production".
}

provider "google" {
  project = var.project
  region  = var.region
}
