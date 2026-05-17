resource "aws_ecr_repository" "orbital" {
  name                 = "${var.app_name}-orbital"
  image_tag_mutability = "MUTABLE"
  image_scanning_configuration { scan_on_push = true }
}

output "ecr_url" {
  value = aws_ecr_repository.orbital.repository_url
}
