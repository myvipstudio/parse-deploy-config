# Ensure npm dependencies are installed
resource "null_resource" "install_dependencies" {
  triggers = {
    # Trigger when package.json changes or when node_modules doesn't exist
    package_json = filemd5("${path.module}/../../package.json")
    force_install = fileexists("${path.module}/../../node_modules/json5/package.json") ? "installed" : timestamp()
  }

  provisioner "local-exec" {
    command     = "npm install --production"
    working_dir = "${path.module}/../.."
  }
}

data "external" "merged_config" {
  depends_on = [null_resource.install_dependencies]

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
