# Parse Deploy Config

Reusable configuration merging tools for GitHub Actions and Terraform.

These tools are designed to merge a hierarchical JSON configuration file with environment and region overrides, returning the configuration that is active for a specified environment and region combination.

The combination of these tools allows you to manage complex configurations in a structured way, making it easier to handle different environments and regions without duplicating configuration data, and to easily share the same deployment configuration across GitHub Actions workflows and Terraform modules.


## GitHub Actions Usage

```yaml
- name: Read Deployment Configuration
  id: read_deployment_config
  uses: myvipstudio/parse-deploy-config@main
  with:
    config: ./deploy-config.json
    env: dev
    region: usw2

# This is for demonstration purposes only!
- name: Display merged config value
  run: echo "Deploy with NAT instance type: ${{ steps.read_deployment_config.outputs['network.nat_instance_type'] }}"

```


## Terraform Usage

```hcl
module "merge_config" {
  source      = "git@github.com/myvipstudio/parse-deploy-config.git//terraform/merge_config?ref=main"
  config_json = "${path.root}/deploy-config.json"
  env         = "dev"
  region      = "usw2"
}

locals {
  deployment_config = module.merge_config.merged_config
  nat_instance_type = local.deployment_config.network.nat_instance_type
}
```


## Local Usage

Merged JSON:
```sh
node merge-config.js --config ./test-cfg.json --env dev --region usw2 --output json
```

Flattened output (equivalent to what the GitHub Action does):
```sh
node merge-config.js --config ./test-cfg.json --env dev --region usw2 --output flatten
```

Show output for Terraform (equivalent to what the 'merge_config' module does):
```sh
node merge-config.js --config ./test-cfg.json --env dev --region usw2 --output json --terraform
```
