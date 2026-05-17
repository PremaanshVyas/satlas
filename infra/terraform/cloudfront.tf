resource "aws_cloudfront_distribution" "catalog" {
  enabled         = true
  is_ipv6_enabled = true
  comment         = "Aussie Sky TLE catalog"

  origin {
    domain_name = aws_s3_bucket.catalog.bucket_regional_domain_name
    origin_id   = "s3-catalog"
    s3_origin_config { origin_access_identity = "" }
  }

  default_cache_behavior {
    allowed_methods        = ["GET", "HEAD"]
    cached_methods         = ["GET", "HEAD"]
    target_origin_id       = "s3-catalog"
    viewer_protocol_policy = "redirect-to-https"

    forwarded_values {
      query_string = false
      cookies { forward = "none" }
    }

    min_ttl     = 0
    default_ttl = 7200
    max_ttl     = 86400
  }

  restrictions {
    geo_restriction { restriction_type = "none" }
  }

  viewer_certificate {
    cloudfront_default_certificate = true
  }
}

output "cloudfront_domain" {
  value = aws_cloudfront_distribution.catalog.domain_name
}
