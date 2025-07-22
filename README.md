# Parse Deploy Config

Reusable configuration merging tools to define deployment configurations across different environments and regions, with
support for both GitHub Actions and Terraform as well as a CLI tool for local usage.

These tools are designed to merge a hierarchical JSON configuration file with environment and region overrides,
returning the configuration that is active for a specified environment and region combination.

The combination of these tools allows you to manage complex configurations in a structured way, making it easier to
handle different environments and regions without duplicating configuration data, and to easily share the same
deployment configuration across multiple platforms like GitHub Actions and Terraform and keeping this configuration
in files that are source controlled alongside your codebase. As always, you should ensure that sensitive data or secrets
are not included in any configuration files that are checked into source control.

These tools are designed to handle JSON5 configuration files, which allows for comments and more flexible syntax
compared to standard JSON.

## Required Field Validation

The merge-config tool includes automatic validation to ensure that all configuration values are properly defined. If a
field is set to `null` in the `defaults` section, it must be overridden with a concrete value in the appropriate
environment configuration. This validation helps enforce that required fields are not accidentally left undefined.

### Example Configuration with Required Fields

```json5
{
    "defaults": {          // Default values for all environments
        "database": {      // 'Components' are defined by adding child objects to the root
            "host": null,  // Must be defined in environment config
            "port": 5432   // Optional: has default value
        }
    },
    "environments": {      // Environment-specific configurations (will override defaults)
        "dev": {
            "database": {
                "host": "dev-db.example.com"  // Provides environment-level concrete value for required field
            }
        },
        "prod": {
            "regions": {
                "us-west-2": {
                    "database": {
                        "host": "prod-db.example.com"  // Provides concrete value for required field
                    },
                "us-east-1": {
                    "database": {
                        // Missing 'host' field here will trigger validation error when requesting this region since
                        // the 'prod' region does not have an environment-level value defined for 'host'
                    }
                }
            }
        }
    }
}
```
This validation occurs automatically during configuration merging and applies to all tools that use the merge-config
functionality.


## GitHub Actions Usage

```yaml
- name: Read Deployment Configuration
  id: read_deployment_config
  uses: myvipstudio/parse-deploy-config@main
  with:
    config: ./deploy-config.json
    env: dev
    region: us-west-2

- name: Show merged config value
  run: echo "Deploy with NAT instance type: ${{ steps.read_deployment_config.outputs['network.nat_instance_type'] }}"
```

### GitHub Action Inputs

| Input                     | Description                                                                                     | Required | Default      |
|---------------------------|-------------------------------------------------------------------------------------------------|----------|--------------|
| `config`                  | Path to config JSON file                                                                        | Yes      | -            |
| `env`                     | Environment (e.g. dev, prod)                                                                    | Yes      | -            |
| `region`                  | Region (us-east-1, us-west-2, etc.)                                                             | Yes      | -            |
| `ephemeral-branch-prefix` | Prefix for branches associated with ephemeral environments (set to empty string to disable)     | No       | `ephemeral/` |
| `delimiter`               | Delimiter for flattening nested properties                                                      | No       | `.`          |
| `display-outputs`         | Display the merged output for the specified environment/region to the console                   | No       | `true`       |
| `component`               | Specific component to hoist to root level in the output (e.g. tfState, network)                 | No       | -            |


### Example with all options

```yaml
- name: Read Deployment Configuration Basic Example
  id: read_deployment_config
  uses: myvipstudio/parse-deploy-config@main
  with:
    config: ./deploy-config.json5
    env: dev
    region: us-west-2

- name: Show Merged Values
  run: |
    echo "NAT Instance Type: ${{ steps.read_deployment_config.outputs['network.nat_instance_type'] }}"
    echo "VPC CIDR: ${{ steps.read_deployment_config.outputs['network.vpc_cidr'] }}"
```

Note that the output from the parse-deploy-config action returns a flattened version of the merged configuration, where
nested properties are represented as keys with dot notation. Because of this, you must use bracket notation to access
these values in from the 'outputs' object, as shown in the example above.

### Component Hoisting

The `component` parameter allows you to hoist a specific component to the root level of the output, which is useful when
you only need configuration for a particular component (like `service`, `network`, `persistence`, etc.) rather than the
entire merged configuration.

When using component hoisting:
- Only the specified component's properties are included at the root level
- Environment metadata (`env_name`, `env_config_name`, `region`, `region_short`, `is_ephemeral`) is preserved
- Other components are excluded from the output

#### Example: Getting only terraform state configuration

```yaml
- name: Get TF State Configuration
  id: tf_state_config
  uses: myvipstudio/parse-deploy-config@main
  with:
    config: ./deploy-config.json5
    env: dev
    region: us-west-2
    component: tfState

- name: Configure Terraform Backend
  run: |
    echo "bucket=${{ steps.tf_state_config.outputs.bucketName }}" >> $GITHUB_OUTPUT
    echo "region=${{ steps.tf_state_config.outputs.region }}" >> $GITHUB_OUTPUT
```

### jq-json5 Utility

After running the parse-deploy-config action, a `jq-json5` utility is made available in the GitHub Actions runner's PATH.
This utility combines JSON5 parsing capabilities with jq's powerful JSON filtering and transformation features, allowing
you to process JSON5 configuration files directly with jq syntax:

```yaml
- name: Process config with jq-json5
  run: |
    # Extract specific values from your JSON5 config file
    jq-json5 './deployment-config.json5' '.network.subnets[] | select(.type == "public")'

    # Transform and filter configuration data
    jq-json5 './deployment-config.json5' '.environments.dev | keys'
```


## Terraform Usage

This module is designed to handle configuration for the **root** module of a Terraform project. For **child** (shared)
modules, any configuration data should be passed in as normal Terraform variables.

```hcl
module "merge_config" {
  source      = "git@github.com/myvipstudio/parse-deploy-config.git//terraform/merge_config?ref=main"
  config_json = "${path.root}/deploy-config.json"
  env         = "dev"
  region      = "us-west-2"
}

locals {
  deployment_config = module.merge_config.merged_config
  nat_instance_type = local.deployment_config.network.nat_instance_type
}
```


## Local CLI Usage

Merged JSON:
```sh
node merge-config.js --config ./test-cfg.json5 --env dev --region us-west-2 --output json
```

Flattened output (equivalent to what the 'parse-deploy-config' GitHub Action does):
```sh
node merge-config.js --config ./test-cfg.json5 --env dev --region us-west-2 --output flatten
```

Show output for Terraform (equivalent to what the 'merge_config' module does):
```sh
node merge-config.js --config ./test-cfg.json5 --env dev --region us-west-2 --output json --terraform
```

Get only a specific component (e.g., tfState):
```sh
node merge-config.js --config ./test-cfg.json5 --env dev --region us-west-2 --component tfState
```

Get only network configuration flattened:
```sh
node merge-config.js --config ./test-cfg.json5 --env dev --region us-west-2 --component network --output flatten
```
