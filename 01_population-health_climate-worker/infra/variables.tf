variable "project" {
  description = "GCP project (the personal hackathon project, never the work one)"
  type        = string
  default     = "heat-safe-example"
}

variable "region" {
  description = "Region for Cloud Run, Artifact Registry and Cloud Build (data stays in the UAE)"
  type        = string
  default     = "me-central1"
}

variable "demo_today" {
  description = "HEAT_SAFE_TODAY for the demo: 2025-07-31 makes 'tomorrow' the cached 1 Aug 2025 replay day. Empty = real date"
  type        = string
  default     = "2025-07-31"
}
