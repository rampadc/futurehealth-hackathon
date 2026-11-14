variable "project" {
  type    = string
  default = "future-health-513202"
}

variable "region" {
  type    = string
  default = "me-central1"
}

variable "github_repository_id" {
  type    = string
  default = "1444949018"
}

variable "github_owner_id" {
  type    = string
  default = "5560025"
}

variable "github_repository" {
  type = string
}

variable "presenter_member" {
  description = "Explicit Google account member allowed to retrieve raw application access codes"
  type        = string
  validation {
    condition     = can(regex("^user:[^@[:space:]]+@[^@[:space:]]+$", var.presenter_member))
    error_message = "presenter_member must be a user:email@example.com IAM member."
  }
}
