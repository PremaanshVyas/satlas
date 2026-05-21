# ACM Certificate and validation for HTTPS
# TODO: Complete in next task with domain registration and Route53 setup

resource "aws_acm_certificate" "main" {
  domain_name       = var.domain_name
  validation_method = "DNS"

  lifecycle {
    create_before_destroy = true
  }
}

resource "aws_acm_certificate_validation" "main" {
  certificate_arn = aws_acm_certificate.main.arn
  timeouts {
    create = "5m"
  }
}
