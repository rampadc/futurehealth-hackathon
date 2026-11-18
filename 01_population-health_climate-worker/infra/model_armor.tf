# Model Armor: screens what goes into and comes out of the supervisor agent (agents/supervisor/armor.py).
# Decisions: infra/README.md, "Design decisions".
#
# Location: Model Armor is not offered in me-central1, and `global` takes only floor settings, not
# templates ("not supported in 'global' location"). asia-south1 (Mumbai) is the nearest region that has
# it. Its Sensitive Data Protection templates must be in the same location.
# Mumbai lacks two capabilities ("does not support ... Malicious URI filter, Multi-language detection"),
# so neither is used. Links in answers are still checked by our own check_link_grounding, and the agent
# has no tool that opens a link. Injection detection is strongest on English text.
#
#   heat-safe-input   the supervisor's message: prompt injection / jailbreak, personal data (de-identified,
#                     not blocked), harmful content
#   heat-safe-tool    guidance text from search_guidance (untrusted documents): injection only.
#                     No personal-data filter: the plugin blocks (cannot de-identify) tool output, and the
#                     guidance PDFs legitimately contain phone numbers and emails
#   heat-safe-output  the agent's answer: personal data (de-identified), harmful content

locals {
  armor_location = "asia-south1"
  dlp_parent     = "projects/${var.project}/locations/${local.armor_location}"
}

resource "google_project_service" "armor_apis" {
  for_each           = toset(["modelarmor.googleapis.com", "dlp.googleapis.com"])
  service            = each.value
  disable_on_destroy = false
}

# --- Sensitive Data Protection: what counts as personal data, and how it is replaced ---------------
resource "google_data_loss_prevention_inspect_template" "personal_data" {
  parent       = local.dlp_parent
  template_id  = "heat-safe-personal-data"
  display_name = "Heat-Safe: worker personal data"
  description  = "Personal data a supervisor might type about a worker. Names are deliberately not included: see README note 9."

  inspect_config {
    min_likelihood = "LIKELY"
    info_types { name = "PHONE_NUMBER" }
    info_types { name = "EMAIL_ADDRESS" }
    info_types { name = "DATE_OF_BIRTH" }
    info_types { name = "STREET_ADDRESS" }
    # Emirates ID: 784-YYYY-NNNNNNN-N, hyphens optional. Not a built-in detector.
    custom_info_types {
      info_type { name = "UAE_EMIRATES_ID" }
      regex { pattern = "\\b784-?\\d{4}-?\\d{7}-?\\d\\b" }
      likelihood = "VERY_LIKELY"
    }
    # Passport numbers as workers' passports print them (1-2 letters, 7-8 digits). The built-in PASSPORT
    # detector missed "passport N1234567" in testing (16 Nov), so a pattern, the same one the telemetry
    # redactor uses (armor.PATTERNS), so the model request and the log agree.
    custom_info_types {
      info_type { name = "PASSPORT_NUMBER" }
      regex { pattern = "\\b[A-Z]{1,2}\\d{7,8}\\b" }
      likelihood = "VERY_LIKELY"
    }
  }
  depends_on = [google_project_service.armor_apis]
}

resource "google_data_loss_prevention_deidentify_template" "replace_with_type" {
  parent       = local.dlp_parent
  template_id  = "heat-safe-replace-with-type"
  display_name = "Heat-Safe: replace personal data with its type"
  description  = "+971 50 123 4567 becomes [PHONE_NUMBER]: the agent still knows what kind of thing was there."

  deidentify_config {
    info_type_transformations {
      transformations {
        primitive_transformation { replace_with_info_type_config = true }
      }
    }
  }
  depends_on = [google_project_service.armor_apis]
}

# Model Armor's service agent calls Sensitive Data Protection with these templates on our behalf. It is
# only created on first use, so create it explicitly before granting it roles.
resource "google_project_service_identity" "armor" {
  provider   = google-beta
  service    = "modelarmor.googleapis.com"
  depends_on = [google_project_service.armor_apis]
}

resource "google_project_iam_member" "armor_service_agent_dlp" {
  for_each = toset(["roles/dlp.user", "roles/dlp.reader"])
  project  = var.project
  role     = each.value
  member   = google_project_service_identity.armor.member
}

# --- Model Armor templates ----------------------------------------------------------------------
locals {
  rai_filters = {
    HARASSMENT        = "MEDIUM_AND_ABOVE"
    HATE_SPEECH       = "MEDIUM_AND_ABOVE"
    SEXUALLY_EXPLICIT = "MEDIUM_AND_ABOVE"
    # HIGH only: first aid for heat stroke is legitimately about danger to life
    DANGEROUS = "HIGH"
  }
}

resource "google_model_armor_template" "input" {
  location    = local.armor_location
  template_id = "heat-safe-input"

  filter_config {
    pi_and_jailbreak_filter_settings {
      filter_enforcement = "ENABLED"
      confidence_level   = "MEDIUM_AND_ABOVE"
    }
    rai_settings {
      dynamic "rai_filters" {
        for_each = local.rai_filters
        content {
          filter_type      = rai_filters.key
          confidence_level = rai_filters.value
        }
      }
    }
    sdp_settings {
      advanced_config {
        inspect_template    = google_data_loss_prevention_inspect_template.personal_data.id
        deidentify_template = google_data_loss_prevention_deidentify_template.replace_with_type.id
      }
    }
  }
  depends_on = [google_project_iam_member.armor_service_agent_dlp]
}

resource "google_model_armor_template" "tool" {
  location    = local.armor_location
  template_id = "heat-safe-tool"

  filter_config {
    pi_and_jailbreak_filter_settings {
      filter_enforcement = "ENABLED"
      confidence_level   = "MEDIUM_AND_ABOVE"
    }
  }
  depends_on = [google_project_service.armor_apis]
}

resource "google_model_armor_template" "output" {
  location    = local.armor_location
  template_id = "heat-safe-output"

  filter_config {
    rai_settings {
      dynamic "rai_filters" {
        for_each = local.rai_filters
        content {
          filter_type      = rai_filters.key
          confidence_level = rai_filters.value
        }
      }
    }
    sdp_settings {
      advanced_config {
        inspect_template    = google_data_loss_prevention_inspect_template.personal_data.id
        deidentify_template = google_data_loss_prevention_deidentify_template.replace_with_type.id
      }
    }
  }
  depends_on = [google_project_iam_member.armor_service_agent_dlp]
}

# The agent's own identity may call Model Armor
resource "google_project_iam_member" "supervisor_armor" {
  project = var.project
  role    = "roles/modelarmor.user"
  member  = google_service_account.supervisor.member
}
