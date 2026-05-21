variable "region" {
  default = "ap-southeast-2"
}

variable "account_id" {
  description = "AWS account ID (12 digits, no dashes)"
}

variable "app_name" {
  default = "satlas"
}

variable "domain_name" {
  description = "Domain name for the ALB (e.g. satlas.app)"
  default     = "satlas.app"
}
