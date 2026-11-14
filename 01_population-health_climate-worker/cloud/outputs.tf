output "wif_provider" { value = google_iam_workload_identity_pool_provider.github.name }
output "main_deployer" { value = google_service_account.main_deploy.email }
output "preview_deployer" { value = google_service_account.preview_deploy.email }
output "main_runtime" { value = google_service_account.main_runtime.email }
output "preview_runtime" { value = google_service_account.preview_runtime.email }
output "sql_connection_name" { value = google_sql_database_instance.app.connection_name }
