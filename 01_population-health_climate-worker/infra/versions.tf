terraform {
  required_version = ">= 1.6"

  required_providers {
    google = {
      source  = "hashicorp/google"
      version = "~> 7.0" # exact version pinned in .terraform.lock.hcl (commit it)
    }
    google-beta = {
      source  = "hashicorp/google-beta"
      version = "~> 7.0" # only for google_project_service_identity (model_armor.tf)
    }
  }

  # Local state (terraform.tfstate, gitignored) is fine for one person and a short-lived demo.
  # Shared or long-lived: a GCS backend. See README "What changes for production".
}

provider "google" {
  project = var.project
  region  = var.region

  # Sensitive Data Protection refuses user credentials (ADC) without a quota project to bill
  user_project_override = true
  billing_project       = var.project
}

provider "google-beta" {
  project               = var.project
  region                = var.region
  user_project_override = true
  billing_project       = var.project
}
