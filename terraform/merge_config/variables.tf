variable "config_json" {
  description = "Path to the hierarchical config JSON file"
  type        = string
}

variable "env" {
  description = "Environment name (e.g. dev, prod)"
  type        = string
}

variable "region" {
  description = "Region code"
  type        = string
  default     = ""
}
