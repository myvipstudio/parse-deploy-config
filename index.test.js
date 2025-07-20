const mergeConfig = require('./merge-config');

describe('mergeConfig function', () => {

  const DefaultTestConfigFile = './test-cfg.json5';

  test('should correctly parse existing environment with regional overrides', () => {
    const result = mergeConfig({
      configFile: DefaultTestConfigFile,
      env: 'dev',
      region: 'usw2',
      output: 'flatten',
      delimiter: '.'
    });

    // Verify specific values that should be present for dev/usw2
    expect(result.env_name).toBe('dev');
    expect(result.region).toBe('us-west-2');
    expect(result.region_short).toBe('usw2');
    expect(result.accountId).toBe('123456789012');
    expect(result.otherField).toBe('some-value');
    expect(result['tags.Project']).toBe('project-name');
    expect(result['tags.ManagedBy']).toBe('terraform');
    expect(result['network.vpc_cidr']).toBe('10.1.0.0/21');
    expect(result['network.nat_instance_type']).toBe('t4g.nano');
    expect(result['network.availability_zones']).toEqual(['us-west-2a', 'us-west-2b', 'us-west-2c']);
    expect(result['network.public_subnet_cidrs']).toEqual(['10.1.0.0/24', '10.1.1.0/24', '10.1.2.0/24']);
    expect(result['network.private_subnet_cidrs']).toEqual(['10.1.4.0/24', '10.1.5.0/24', '10.1.6.0/24']);
  });

  test('should correctly parse prod environment (defaults only)', () => {
    const result = mergeConfig({
      configFile: DefaultTestConfigFile,
      env: 'prod',
      region: '',
      output: 'flatten',
      delimiter: '.'
    });

    // Verify only defaults are present for prod
    expect(result.env_name).toBe('prod');
    expect(result.region).toBe('');
    expect(result['tags.Project']).toBe('project-name');
    expect(result['tags.ManagedBy']).toBe('terraform');
    expect(result['tfState.bucketName']).toBe('tf-state-bucket');
    expect(result['tfState.region']).toBe('us-west-2');
    expect(result['network.vpc_cidr']).toBe('10.0.0.0/8');

    // These should not be present since prod has no specific config
    expect(result.accountId).toBeUndefined();
    expect(result.otherField).toBeUndefined();
    expect(result['network.nat_instance_type']).toBeUndefined();
  });

  test('should use custom delimiter', () => {
    const result = mergeConfig({
      configFile: DefaultTestConfigFile,
      env: 'dev',
      region: 'usw2',
      output: 'flatten',
      delimiter: '_'
    });

    // Verify custom delimiter is used
    expect(result.env_name).toBe('dev');
    expect(result.region).toBe('us-west-2');
    expect(result.region_short).toBe('usw2');
    expect(result['tags_Project']).toBe('project-name');
    expect(result['tags_ManagedBy']).toBe('terraform');
    expect(result['network_vpc_cidr']).toBe('10.1.0.0/21');
    expect(result['network_nat_instance_type']).toBe('t4g.nano');

    // Verify dot-delimited keys don't exist
    expect(result['tags.Project']).toBeUndefined();
    expect(result['network.vpc_cidr']).toBeUndefined();
  });

  test('should return non-flattened object when output is not "flatten"', () => {
    const result = mergeConfig({
      configFile: DefaultTestConfigFile,
      env: 'dev',
      region: 'usw2',
      output: 'object',
      delimiter: '.'
    });

    // Verify nested structure is preserved
    expect(result.env_name).toBe('dev');
    expect(result.region).toBe('us-west-2');
    expect(result.region_short).toBe('usw2');
    expect(result.accountId).toBe('123456789012');
    expect(result.tags).toEqual({
      Project: 'project-name',
      ManagedBy: 'terraform'
    });
    expect(result.network.vpc_cidr).toBe('10.1.0.0/21');
    expect(result.network.nat_instance_type).toBe('t4g.nano');

    // Verify flattened keys don't exist
    expect(result['tags.Project']).toBeUndefined();
    expect(result['network.vpc_cidr']).toBeUndefined();
  });

  test('should throw error for invalid environment', () => {
    expect(() => {
      mergeConfig({
        configFile: DefaultTestConfigFile,
        env: 'nonexistent',
        region: '',
        output: 'flatten',
        delimiter: '.'
      });
    }).toThrow("Environment 'nonexistent' not found in config file");
  });

  test('should throw error for invalid region code', () => {
    expect(() => {
      mergeConfig({
        configFile: DefaultTestConfigFile,
        env: 'dev',
        region: 'invalid-region',
        output: 'flatten',
        delimiter: '.'
      });
    }).toThrow("Region 'invalid-region' is not a valid region code or name");
  });

  test('should not throw error if region is valid but does not exist in config file', () => {
    expect(() => {
      mergeConfig({
        configFile: DefaultTestConfigFile,
        env: 'dev',
        region: 'us-east-1', // Valid region code but not in config
        output: 'flatten',
        delimiter: '.'
      });
    }).not.toThrow();

    // Should return environment defaults when region doesn't exist
    const result = mergeConfig({
      configFile: DefaultTestConfigFile,
      env: 'dev',
      region: 'use1',
      output: 'flatten',
      delimiter: '.'
    });

    expect(result.env_name).toBe('dev');
    expect(result.region).toBe('us-east-1'); // Should convert short code to full name
    expect(result.region_short).toBe('use1');
    expect(result.accountId).toBe('123456789012'); // From environment config
    expect(result['network.vpc_cidr']).toBe('10.0.0.0/8'); // From defaults (no region-specific override)
  });

  test('should throw error for non-existent config file', () => {
    expect(() => {
      mergeConfig({
        configFile: './non-existent-file.json',
        env: 'dev',
        region: 'usw2',
        output: 'flatten',
        delimiter: '.'
      });
    }).toThrow();
  });

  test('should handle valid environment with empty region', () => {
    const result = mergeConfig({
      configFile: DefaultTestConfigFile,
      env: 'dev',
      region: '',
      output: 'flatten',
      delimiter: '.'
    });

    // Should work fine with valid environment and empty region
    expect(result.env_name).toBe('dev');
    expect(result.region).toBe('');
    expect(result.region_short).toBe('');
    expect(result.accountId).toBe('123456789012');
    expect(result.otherField).toBe('some-value');
  });

  test('should support short region codes and convert to full names', () => {
    const result = mergeConfig({
      configFile: DefaultTestConfigFile,
      env: 'dev',
      region: 'usw2',  // Short code
      output: 'flatten',
      delimiter: '.'
    });

    // Should convert short code to full region name
    expect(result.env_name).toBe('dev');
    expect(result.region).toBe('us-west-2');  // Full name
    expect(result.region_short).toBe('usw2');  // Short code
    expect(result.accountId).toBe('123456789012');
    expect(result['network.vpc_cidr']).toBe('10.1.0.0/21');
  });

  test('should support full region names and derive short codes', () => {
    const result = mergeConfig({
      configFile: DefaultTestConfigFile,
      env: 'dev',
      region: 'us-west-2',  // Full name
      output: 'flatten',
      delimiter: '.'
    });

    // Should keep full region name and derive short code
    expect(result.env_name).toBe('dev');
    expect(result.region).toBe('us-west-2');  // Full name
    expect(result.region_short).toBe('usw2');  // Derived short code
    expect(result.accountId).toBe('123456789012');
    expect(result['network.vpc_cidr']).toBe('10.1.0.0/21');
  });

  test('should produce consistent output for repeated calls', () => {
    const result1 = mergeConfig({
      configFile: DefaultTestConfigFile,
      env: 'dev',
      region: 'usw2',
      output: 'flatten',
      delimiter: '.'
    });

    const result2 = mergeConfig({
      configFile: DefaultTestConfigFile,
      env: 'dev',
      region: 'usw2',
      output: 'flatten',
      delimiter: '.'
    });

    expect(result1).toEqual(result2);
  });

  test('should handle dev environment without region correctly', () => {
    const result = mergeConfig({
      configFile: DefaultTestConfigFile,
      env: 'dev',
      region: '',
      output: 'flatten',
      delimiter: '.'
    });

    // Should have environment-level configs
    expect(result.env_name).toBe('dev');
    expect(result.region).toBe('');
    expect(result.region_short).toBe('');
    expect(result.accountId).toBe('123456789012');
    expect(result.otherField).toBe('some-value');

    // Should use default network config (no region-specific override)
    expect(result['network.vpc_cidr']).toBe('10.0.0.0/8');

    // Should not have region-specific network configs
    expect(result['network.availability_zones']).toBeUndefined();
    expect(result['network.public_subnet_cidrs']).toBeUndefined();
    expect(result['network.private_subnet_cidrs']).toBeUndefined();
    expect(result['network.nat_instance_type']).toBeUndefined();
  });

  test('should ensure no undefined values in dev/usw2 output', () => {
    const result = mergeConfig({
      configFile: DefaultTestConfigFile,
      env: 'dev',
      region: 'usw2',
      output: 'flatten',
      delimiter: '.'
    });

    // Ensure no undefined values in the output
    Object.values(result).forEach(value => {
      expect(value).not.toBeUndefined();
    });
  });

  test('should handle terraform mode via CLI', () => {
    const { execSync } = require('child_process');
    const result = execSync('node merge-config.js --config ./test-cfg.json5 --env dev --region usw2 --output flatten --terraform',
      { encoding: 'utf8' });

    const parsed = JSON.parse(result.trim());

    // Should have the terraform wrapper format
    expect(parsed).toHaveProperty('mergedConfig');
    expect(typeof parsed.mergedConfig).toBe('string');

    // The mergedConfig should be a JSON string that parses to our expected structure
    const innerConfig = JSON.parse(parsed.mergedConfig);
    expect(innerConfig.env_name).toBe('dev');
    expect(innerConfig.region).toBe('us-west-2');
    expect(innerConfig.region_short).toBe('usw2');
    expect(innerConfig.accountId).toBe('123456789012');
    expect(innerConfig['tags.Project']).toBe('project-name');
    expect(innerConfig['network.vpc_cidr']).toBe('10.1.0.0/21');
  });

  test('should handle normal CLI mode without terraform flag', () => {
    const { execSync } = require('child_process');
    const result = execSync('node merge-config.js --config ./test-cfg.json5 --env dev --region usw2 --output flatten',
      { encoding: 'utf8' });

    const parsed = JSON.parse(result.trim());

    // Should directly return the config without terraform wrapper
    expect(parsed.env_name).toBe('dev');
    expect(parsed.region).toBe('us-west-2');
    expect(parsed.region_short).toBe('usw2');
    expect(parsed.accountId).toBe('123456789012');
    expect(parsed['tags.Project']).toBe('project-name');
    expect(parsed['network.vpc_cidr']).toBe('10.1.0.0/21');
    expect(parsed).not.toHaveProperty('mergedConfig');
  });

});

describe('ephemeral environment functionality', () => {
  const DefaultTestConfigFile = './test-cfg.json5';

  test('should return normal environment when ephemeral prefix is not specified', () => {
    const result = mergeConfig({
      configFile: DefaultTestConfigFile,
      env: 'dev',
      region: 'usw2',
      output: 'flatten',
      delimiter: '.',
      ephemeralBranchPrefix: undefined,
      branchName: 'ephemeral/test-branch'
    });

    expect(result.env_name).toBe('dev');
    expect(result.env_config_name).toBe('dev');
    expect(result.is_ephemeral).toBe(false);
  });

  test('should return normal environment when ephemeral prefix is empty', () => {
    const result = mergeConfig({
      configFile: DefaultTestConfigFile,
      env: 'dev',
      region: 'usw2',
      output: 'flatten',
      delimiter: '.',
      ephemeralBranchPrefix: '',
      branchName: 'ephemeral/test-branch'
    });

    expect(result.env_name).toBe('dev');
    expect(result.env_config_name).toBe('dev');
    expect(result.is_ephemeral).toBe(false);
  });

  test('should return normal environment when ephemeral prefix is only whitespace', () => {
    const result = mergeConfig({
      configFile: DefaultTestConfigFile,
      env: 'dev',
      region: 'usw2',
      output: 'flatten',
      delimiter: '.',
      ephemeralBranchPrefix: '   ',
      branchName: 'ephemeral/test-branch'
    });

    expect(result.env_name).toBe('dev');
    expect(result.env_config_name).toBe('dev');
    expect(result.is_ephemeral).toBe(false);
  });

  test('should return normal environment when known environment exists even if branch name matches ephemeral prefix', () => {
    const result = mergeConfig({
      configFile: DefaultTestConfigFile,
      env: 'dev',
      region: 'usw2',
      output: 'flatten',
      delimiter: '.',
      ephemeralBranchPrefix: 'ephemeral/',
      branchName: 'ephemeral/test-branch'
    });

    expect(result.env_name).toBe('dev');
    expect(result.env_config_name).toBe('dev');
    expect(result.is_ephemeral).toBe(false);
  });

  test('should throw error if input unprefixed ephemeral env does not match branchName', () => {
    expect(() => mergeConfig({
      configFile: DefaultTestConfigFile,
      env: 'nonexistent',
      region: 'usw2',
      output: 'flatten',
      delimiter: '.',
      ephemeralBranchPrefix: 'ephemeral/',
      branchName: 'ephemeral/test-feature'
    })).toThrow("Ephemeral environment name 'nonexistent' does not match the branch name 'ephemeral/test-feature'");
  });

  test('should throw error if input prefixed ephemeral env prefix does not match branchName', () => {
    expect(() => mergeConfig({
      configFile: DefaultTestConfigFile,
      env: 'feature/test-feature',
      region: 'usw2',
      output: 'flatten',
      delimiter: '.',
      ephemeralBranchPrefix: 'ephemeral/',
      branchName: 'ephemeral/test-feature'
    })).toThrow("Ephemeral environment name 'feature/test-feature' does not match the branch name 'ephemeral/test-feature'");
  });

  test('should throw error if input prefixed ephemeral env suffix does not match branchName', () => {
    expect(() => mergeConfig({
      configFile: DefaultTestConfigFile,
      env: 'ephemeral/other-feature',
      region: 'usw2',
      output: 'flatten',
      delimiter: '.',
      ephemeralBranchPrefix: 'ephemeral/',
      branchName: 'ephemeral/test-feature'
    })).toThrow("Ephemeral environment name 'ephemeral/other-feature' does not match the branch name 'ephemeral/test-feature'");
  });

  test('should handle ephemeral environment with valid branch name matching input env without prefix', () => {
    const result = mergeConfig({
      configFile: DefaultTestConfigFile,
      env: 'test-feature',
      region: 'usw2',
      output: 'flatten',
      delimiter: '.',
      ephemeralBranchPrefix: 'ephemeral/',
      branchName: 'ephemeral/test-feature'
    });

    expect(result.env_name).toBe('test-feature');
    expect(result.env_config_name).toBe('ephemeral');
    expect(result.is_ephemeral).toBe(true);
    expect(result.accountId).toBe('999999999999');
  });

  test('should handle ephemeral environment with valid branch name matching input env with prefix', () => {
    const result = mergeConfig({
      configFile: DefaultTestConfigFile,
      env: 'ephemeral/test-feature',
      region: 'usw2',
      output: 'flatten',
      delimiter: '.',
      ephemeralBranchPrefix: 'ephemeral/',
      branchName: 'ephemeral/test-feature'
    });

    expect(result.env_name).toBe('test-feature');
    expect(result.env_config_name).toBe('ephemeral');
    expect(result.is_ephemeral).toBe(true);
    expect(result.accountId).toBe('999999999999');
  });

  test('should handle ephemeral environment with complex branch name', () => {
    const result = mergeConfig({
      configFile: DefaultTestConfigFile,
      env: 'feature-123-test',
      region: 'usw2',
      output: 'flatten',
      delimiter: '.',
      ephemeralBranchPrefix: 'ephemeral/',
      branchName: 'ephemeral/feature-123-test'
    });

    expect(result.env_name).toBe('feature-123-test');
    expect(result.env_config_name).toBe('ephemeral');
    expect(result.is_ephemeral).toBe(true);
  });

  test('should handle custom ephemeral prefix', () => {
    const result = mergeConfig({
      configFile: DefaultTestConfigFile,
      env: 'my-feature',
      region: 'usw2',
      output: 'flatten',
      delimiter: '.',
      ephemeralBranchPrefix: 'preview/',
      branchName: 'preview/my-feature'
    });

    expect(result.env_name).toBe('my-feature');
    expect(result.env_config_name).toBe('ephemeral');
    expect(result.is_ephemeral).toBe(true);
  });

  test('should throw error when environment not found and no branch name', () => {
    expect(() => {
      mergeConfig({
        configFile: DefaultTestConfigFile,
        env: 'nonexistent',
        region: 'usw2',
        output: 'flatten',
        delimiter: '.',
        ephemeralBranchPrefix: 'ephemeral/',
        branchName: undefined
      });
    }).toThrow("Environment 'nonexistent' not found in config file");
  });

  test('should throw error when environment not found and branch name is null', () => {
    expect(() => {
      mergeConfig({
        configFile: DefaultTestConfigFile,
        env: 'nonexistent',
        region: 'usw2',
        output: 'flatten',
        delimiter: '.',
        ephemeralBranchPrefix: 'ephemeral/',
        branchName: null
      });
    }).toThrow("Environment 'nonexistent' not found in config file");
  });

  test('should throw error when branch name does not match ephemeral pattern', () => {
    expect(() => {
      mergeConfig({
        configFile: DefaultTestConfigFile,
        env: 'nonexistent',
        region: 'usw2',
        output: 'flatten',
        delimiter: '.',
        ephemeralBranchPrefix: 'ephemeral/',
        branchName: 'main'
      });
    }).toThrow("Ephemeral environment branches must follow the format 'ephemeral/<name>' where <name> contains only lowercase letters, numbers, hyphens, and underscores. Current branch: main");
  });

  test('should handle ephemeral environment with underscores in branch name', () => {
    const result = mergeConfig({
      configFile: DefaultTestConfigFile,
      env: 'feature_with_underscores',
      region: 'usw2',
      output: 'flatten',
      delimiter: '.',
      ephemeralBranchPrefix: 'ephemeral/',
      branchName: 'ephemeral/feature_with_underscores'
    });

    expect(result.env_name).toBe('feature_with_underscores');
    expect(result.env_config_name).toBe('ephemeral');
    expect(result.is_ephemeral).toBe(true);
  });

  test('should throw error when branch name has uppercase characters', () => {
    expect(() => {
      mergeConfig({
        configFile: DefaultTestConfigFile,
        env: 'nonexistent',
        region: 'usw2',
        output: 'flatten',
        delimiter: '.',
        ephemeralBranchPrefix: 'ephemeral/',
        branchName: 'ephemeral/FeatureTest'
      });
    }).toThrow("Ephemeral environment branches must follow the format 'ephemeral/<name>' where <name> contains only lowercase letters, numbers, hyphens, and underscores. Current branch: ephemeral/FeatureTest");
  });

  test('should handle prefix with special regex characters', () => {
    const result = mergeConfig({
      configFile: DefaultTestConfigFile,
      env: 'test-branch',
      region: 'usw2',
      output: 'flatten',
      delimiter: '.',
      ephemeralBranchPrefix: 'preview.',
      branchName: 'preview.test-branch'
    });

    expect(result.env_name).toBe('test-branch');
    expect(result.env_config_name).toBe('ephemeral');
    expect(result.is_ephemeral).toBe(true);
  });

  test('should handle prefix with multiple special characters', () => {
    const result = mergeConfig({
      configFile: DefaultTestConfigFile,
      env: 'my-feature',
      region: 'usw2',
      output: 'flatten',
      delimiter: '.',
      ephemeralBranchPrefix: 'test[branch]/',
      branchName: 'test[branch]/my-feature'
    });

    expect(result.env_name).toBe('my-feature');
    expect(result.env_config_name).toBe('ephemeral');
    expect(result.is_ephemeral).toBe(true);
  });

});

describe('component functionality', () => {
  const DefaultTestConfigFile = './test-cfg.json5';

  test('should handle component hoisting for tfState', () => {
    const result = mergeConfig({
      configFile: DefaultTestConfigFile,
      env: 'dev',
      region: 'usw2',
      output: 'flatten',
      delimiter: '.',
      component: 'tfState'
    });

    // Should only have tfState values at root level plus metadata
    expect(result.bucketName).toBe('tf-state-bucket');
    expect(result.region).toBe('us-west-2');
    expect(result.env_name).toBe('dev');
    expect(result.env_config_name).toBe('dev');
    expect(result.region_short).toBe('usw2');
    expect(result.is_ephemeral).toBe(false);

    // Should not have other components
    expect(result['network.vpc_cidr']).toBeUndefined();
    expect(result['tags.Project']).toBeUndefined();
    expect(result.accountId).toBeUndefined();
  });

  test('should handle component hoisting for network', () => {
    const result = mergeConfig({
      configFile: DefaultTestConfigFile,
      env: 'dev',
      region: 'usw2',
      output: 'flatten',
      delimiter: '.',
      component: 'network'
    });

    // Should only have network values at root level plus metadata
    expect(result.vpc_cidr).toBe('10.1.0.0/21');
    expect(result.nat_instance_type).toBe('t4g.nano');
    expect(result.availability_zones).toEqual(['us-west-2a', 'us-west-2b', 'us-west-2c']);
    expect(result.env_name).toBe('dev');
    expect(result.env_config_name).toBe('dev');
    expect(result.region).toBe('us-west-2');
    expect(result.region_short).toBe('usw2');
    expect(result.is_ephemeral).toBe(false);

    // Should not have other components
    expect(result['tfState.bucketName']).toBeUndefined();
    expect(result['tags.Project']).toBeUndefined();
    expect(result.accountId).toBeUndefined();
  });

  test('should throw error for invalid component', () => {
    expect(() => {
      mergeConfig({
        configFile: DefaultTestConfigFile,
        env: 'dev',
        region: 'usw2',
        output: 'flatten',
        delimiter: '.',
        component: 'invalidComponent'
      });
    }).toThrow("Component 'invalidComponent' not found or is not a valid component in the merged configuration");
  });

  test('should work normally when component is not specified', () => {
    const result = mergeConfig({
      configFile: DefaultTestConfigFile,
      env: 'dev',
      region: 'usw2',
      output: 'flatten',
      delimiter: '.'
      // component not specified
    });

    // Should have all components flattened
    expect(result['tfState.bucketName']).toBe('tf-state-bucket');
    expect(result['network.vpc_cidr']).toBe('10.1.0.0/21');
    expect(result['tags.Project']).toBe('project-name');
    expect(result.accountId).toBe('123456789012');
  });

});
