resource "aws_route53_zone" "main" {
  name = "satlas.app"
}

# ACM wildcard cert — covers api.satlas.app and any future subdomain
resource "aws_acm_certificate" "main" {
  domain_name               = "*.satlas.app"
  validation_method         = "DNS"
  subject_alternative_names = ["satlas.app"]

  lifecycle {
    create_before_destroy = true
  }
}

# Route 53 CNAME records for ACM DNS validation
resource "aws_route53_record" "cert_validation" {
  for_each = {
    for dvo in aws_acm_certificate.main.domain_validation_options : dvo.domain_name => {
      name   = dvo.resource_record_name
      record = dvo.resource_record_value
      type   = dvo.resource_record_type
    }
  }

  allow_overwrite = true
  name            = each.value.name
  records         = [each.value.record]
  ttl             = 60
  type            = each.value.type
  zone_id         = aws_route53_zone.main.zone_id
}

# Wait for cert validation before the HTTPS listener can use it
resource "aws_acm_certificate_validation" "main" {
  certificate_arn         = aws_acm_certificate.main.arn
  validation_record_fqdns = [for record in aws_route53_record.cert_validation : record.fqdn]
}

# api.satlas.app → ALB
resource "aws_route53_record" "api" {
  zone_id = aws_route53_zone.main.zone_id
  name    = "api.satlas.app"
  type    = "A"

  alias {
    name                   = aws_lb.main.dns_name
    zone_id                = aws_lb.main.zone_id
    evaluate_target_health = true
  }
}

# satlas.app → Vercel (standard Vercel apex A record)
resource "aws_route53_record" "apex" {
  zone_id = aws_route53_zone.main.zone_id
  name    = "satlas.app"
  type    = "A"
  ttl     = 300
  records = ["76.76.21.21"]
}

# Output the NS records so the user can paste them into Namecheap
output "route53_nameservers" {
  value       = aws_route53_zone.main.name_servers
  description = "Paste these 4 nameservers into Namecheap's custom DNS settings"
}
