locals {
  secret_names = ["SPACE_TRACK_USER", "SPACE_TRACK_PASS", "ANTHROPIC_API_KEY", "SENTRY_DSN", "DATABASE_URL"]
}

resource "aws_secretsmanager_secret" "app" {
  for_each = toset(local.secret_names)
  name     = "${var.app_name}/${each.key}"
}

output "secret_arns" {
  value = { for k, v in aws_secretsmanager_secret.app : k => v.arn }
}
