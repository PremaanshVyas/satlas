resource "aws_s3_bucket" "catalog" {
  bucket = "${var.app_name}-catalog"
}

resource "aws_s3_bucket_public_access_block" "catalog" {
  bucket                  = aws_s3_bucket.catalog.id
  block_public_acls       = false
  block_public_policy     = false
  ignore_public_acls      = false
  restrict_public_buckets = false
}

resource "aws_s3_bucket_cors_configuration" "catalog" {
  bucket = aws_s3_bucket.catalog.id
  cors_rule {
    allowed_methods = ["GET"]
    allowed_origins = ["*"]
    allowed_headers = ["*"]
  }
}

resource "aws_s3_bucket_policy" "catalog" {
  bucket     = aws_s3_bucket.catalog.id
  depends_on = [aws_s3_bucket_public_access_block.catalog]
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect    = "Allow"
      Principal = "*"
      Action    = "s3:GetObject"
      Resource  = "${aws_s3_bucket.catalog.arn}/*"
    }]
  })
}
