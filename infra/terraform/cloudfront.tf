# CORS headers are attached by CloudFront itself rather than left to S3's bucket rule.
#
# The behaviour below uses the legacy `forwarded_values` block. CloudFront does forward the
# viewer's Origin header to the origin, but `headers` is empty so Origin is NOT part of the
# cache key and no Vary is emitted. That means whichever request causes a cache MISS at a
# given edge decides, for every later viewer at that edge, whether the cached copy carries
# Access-Control-Allow-Origin at all.
#
# In practice: catalog.tle is rewritten hourly and its cache is re-warmed by the server-side
# Vercel proxy, which sends no Origin, so it serves no CORS headers. satcat.json happened to
# be warmed by a request that did send one, so it does. satcat.json is fetched cross-origin
# by the browser (see apps/web/src/lib/satcat.ts), so that race can silently break satellite
# metadata for everyone on a PoP until the cache rotates.
#
# A response headers policy is applied to every response, cache hit or miss, so the headers
# no longer depend on who warmed the cache. SimpleCORS sets Access-Control-Allow-Origin: *,
# matching the intent of the bucket rule in s3.tf (allowed_origins = ["*"]).
#
# Only simple GETs are made against this distribution, so no preflight is involved and
# allowed_methods does not need OPTIONS.
data "aws_cloudfront_response_headers_policy" "simple_cors" {
  name = "Managed-SimpleCORS"
}

resource "aws_cloudfront_distribution" "catalog" {
  enabled         = true
  is_ipv6_enabled = true
  comment         = "Satlas TLE catalog"

  origin {
    domain_name = aws_s3_bucket.catalog.bucket_regional_domain_name
    origin_id   = "s3-catalog"
    custom_origin_config {
      http_port              = 80
      https_port             = 443
      origin_protocol_policy = "https-only"
      origin_ssl_protocols   = ["TLSv1.2"]
    }
  }

  default_cache_behavior {
    allowed_methods        = ["GET", "HEAD"]
    cached_methods         = ["GET", "HEAD"]
    target_origin_id       = "s3-catalog"
    viewer_protocol_policy = "redirect-to-https"

    response_headers_policy_id = data.aws_cloudfront_response_headers_policy.simple_cors.id

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
