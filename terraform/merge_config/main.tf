data "external" "merged_config" {
  program = [
    "node",
    "${path.module}/../../merge-config.js",
    "--config", var.config_json,
    "--env", var.env,
    "--region", var.region,
    "--output", "json",
    "--terraform"
  ]
}

locals {
  merged_config = jsondecode(data.external.merged_config.result.mergedConfig)
}

output "merged_config" {
  value = local.merged_config
}
