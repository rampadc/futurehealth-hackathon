output "url" {
  description = "Share this link with the team (public; destroy after the demo)"
  value       = google_cloud_run_v2_service.supervisor.uri
}

output "image" {
  value = terraform_data.image.output
}
