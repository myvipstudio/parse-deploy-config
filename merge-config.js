#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const JSON5 = require('json5');

// Region mapping: short code -> full name
const AwsRegionMapping = {
    'use1': 'us-east-1',
    'use2': 'us-east-2',
    'usw1': 'us-west-1',
    'usw2': 'us-west-2',
    'cac1': 'ca-central-1',
    'euw1': 'eu-west-1',
    'euw2': 'eu-west-2',
    'euw3': 'eu-west-3',
    'euc1': 'eu-central-1',
    'eun1': 'eu-north-1',
    'aps1': 'ap-south-1',
    'apne1': 'ap-northeast-1',
    'apne2': 'ap-northeast-2',
    'apne3': 'ap-northeast-3',
    'apse1': 'ap-southeast-1',
    'apse2': 'ap-southeast-2',
    'apse3': 'ap-southeast-3',
    'ape1': 'ap-east-1',
    'sae1': 'sa-east-1'
};

function mergeConfig({ configFile, env, region, output, delimiter, ephemeralBranchPrefix, branchName, component }) {
    const config = typeof configFile === 'string'
        ? JSON5.parse(fs.readFileSync(path.resolve(configFile), 'utf8'))
        : configFile;

    const envSource = config.accounts || config.environments;

    // Handle ephemeral environments
    let { envName, envConfigName, isEphemeral } = determineEnvironment();

    // Convert region to full name if it's a short code
    const fullRegion = region ? (AwsRegionMapping[region] || region) : region;
    const shortRegion = region ? (Object.keys(AwsRegionMapping).find(key => AwsRegionMapping[key] === fullRegion) || region) : region;

    // Validate environment exists (using envConfigName to support ephemeral cases)
    if (!envSource || !envSource[envConfigName]) {
        throw new Error(`Environment '${envConfigName}' not found in config file`);
    }

    // Validate region exists in mapping if provided (can use either full region name or short code)
    if (region && !AwsRegionMapping[region] && !Object.values(AwsRegionMapping).includes(region)) {
        throw new Error(`Region '${region}' is not a valid region code or name`);
    }

    function determineEnvironment() {
        let envName = env;
        let envConfigName = env;
        let isEphemeral = false;

        // Only process ephemeral logic if ephemeralBranchPrefix is specified and not empty
        if (ephemeralBranchPrefix && ephemeralBranchPrefix.trim() !== '') {
            // Check if this is a known environment
            if (!envSource || !envSource[env]) {
                // Environment not found, check if this could be ephemeral
                if (branchName) {
                    // Create regex pattern for ephemeral branch format
                    const ephemeralPattern = new RegExp(`^${ephemeralBranchPrefix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}[a-z0-9_-]+$`);

                    if (ephemeralPattern.test(branchName)) {
                        // This is an ephemeral environment
                        const branchEnvName = branchName.substring(ephemeralBranchPrefix.length);

                        // Verify that the input envName matches the branch name with or without the prefix
                        if (envName !== branchEnvName && envName !== branchName) {
                            throw new Error(`Ephemeral environment name '${envName}' does not match the branch name '${branchName}'`);
                        }

                        envName = branchEnvName;
                        envConfigName = 'ephemeral';
                        isEphemeral = true;
                    } else {
                        throw new Error(`Ephemeral environment branches must follow the format '${ephemeralBranchPrefix}<name>' where <name> contains only lowercase letters, numbers, hyphens, and underscores. Current branch: ${branchName}`);
                    }
                } else {
                    // No branch name available, fail with original error
                    throw new Error(`Environment '${env}' not found in config file`);
                }
            }
        }
        return { envName, envConfigName, isEphemeral };
    }

    function deepMerge(...objects) {
        const result = {};
        for (const obj of objects) {
            if (!obj || typeof obj !== 'object') continue;
            for (const key of Object.keys(obj)) {
                if (
                    obj[key] &&
                    typeof obj[key] === 'object' &&
                    !Array.isArray(obj[key]) &&
                    result[key] &&
                    typeof result[key] === 'object' &&
                    !Array.isArray(result[key])
                ) {
                    result[key] = deepMerge(result[key], obj[key]);
                } else {
                    result[key] = obj[key];
                }
            }
        }
        return result;
    }

    function getMergedComponentConfig(componentName) {
        const defaultComp = config.defaults?.[componentName] || {};
        const envComp = envSource?.[envConfigName]?.[componentName] || {};
        const regionComp = fullRegion
            ? envSource?.[envConfigName]?.regions?.[fullRegion]?.[componentName] || {}
            : {};
        return deepMerge(defaultComp, envComp, regionComp);
    }

    function getAllComponentKeys() {
        const keys = new Set();
        function isComponent(configObj, key) {
            const value = configObj[key];
            return value && typeof value === 'object' && !Array.isArray(value);
        }

        if (config.defaults) {
            Object.keys(config.defaults).filter(k => isComponent(config.defaults, k)).forEach(k => keys.add(k));
        }
        if (envSource?.[envConfigName]) {
            Object.keys(envSource[envConfigName]).filter(k => isComponent(envSource[envConfigName], k) && k !== 'regions').forEach(k => keys.add(k));
            if (fullRegion && envSource[envConfigName].regions?.[fullRegion]) {
                Object.keys(envSource[envConfigName].regions[fullRegion]).filter(k => isComponent(envSource[envConfigName].regions[fullRegion], k)).forEach(k => keys.add(k));
            }
        }
        return Array.from(keys);
    }

    function getGlobalMerged() {
        function isNonComponent([k, v]) {
            return typeof v !== 'object' || v === null || Array.isArray(v);
        }
        const d = Object.fromEntries(Object.entries(config.defaults || {}).filter(isNonComponent));
        const e = Object.fromEntries(Object.entries(envSource?.[envConfigName] || {}).filter(isNonComponent));
        const r = fullRegion
            ? Object.fromEntries(Object.entries(envSource?.[envConfigName]?.regions?.[fullRegion] || {}).filter(isNonComponent))
            : {};
        return deepMerge(d, e, r);
    }

    const merged = {
        ...getGlobalMerged(),
        ...Object.fromEntries(getAllComponentKeys().map(k => [k, getMergedComponentConfig(k)])),
    };

    // Handle component hoisting if specified
    let finalResult = merged;
    if (component) {
        // Check if the component exists in the merged config
        if (merged[component] && typeof merged[component] === 'object' && !Array.isArray(merged[component])) {
            // Hoist the specified component to root level
            finalResult = {
                ...merged[component],
            };
        } else {
            throw new Error(`Component '${component}' not found or is not a valid component in the merged configuration`);
        }
    }

    // Add common dynamic metadata to the merged result (environment, region, etc)
    finalResult.env_name = envName;
    finalResult.env_config_name = envConfigName;
    finalResult.region = fullRegion || '';
    finalResult.region_short = shortRegion || '';
    finalResult.is_ephemeral = isEphemeral;

    if (output === 'flatten') {
        return flatten(finalResult, '', delimiter || '.');
    }
    return finalResult;
}

function flatten(obj, prefix = '', delimiter = '.') {
    let result = {};
    for (const [k, v] of Object.entries(obj)) {
        const key = prefix ? `${prefix}${delimiter}${k}` : k;
        if (v && typeof v === 'object' && !Array.isArray(v)) {
            Object.assign(result, flatten(v, key, delimiter));
        } else {
            result[key] = v;
        }
    }
    return result;
}


if (require.main === module) {
    // CLI: --config <path> --env <env> [--region <region>] [--output json|flatten] [--delimiter <char>] [--terraform] [--ephemeral-branch-prefix <prefix>] [--branch-name <name>] [--debug]
    const args = process.argv.slice(2);
    let configFile, env, region, output = 'json', delimiter = '.', tfMode = false, ephemeralBranchPrefix, branchName, component, debugMode = false;

    for (let i = 0; i < args.length; i++) {
        switch (args[i]) {
            case '--config':
                configFile = args[++i];
                break;
            case '--env':
                env = args[++i];
                break;
            case '--region':
                region = args[++i];
                break;
            case '--output':
                output = args[++i].toLowerCase();
                if (!['json', 'flatten'].includes(output)) {
                    console.error(`Invalid value for --output: ${output}. Must be 'json' or 'flatten'.`);
                    process.exit(1);
                }
                break;
            case '--delimiter':
                delimiter = args[++i];
                break;
            case '--terraform':
                tfMode = true;
                break;
            case '--ephemeral-branch-prefix':
                ephemeralBranchPrefix = args[++i];
                break;
            case '--branch-name':
                branchName = args[++i];
                break;
            case '--component':
                component = args[++i];
                break;
            case '--debug':
                debugMode = true;
                break;
            default:
                console.error(`Unrecognized argument: ${args[i]}`);
                process.exit(1);
        }
    }

    if (!configFile || !env) {
        console.error('Usage: merge-config.js --config <configFile> --env <env> [--region <region>] [--output json|flatten] [--delimiter <char>] [--terraform] [--ephemeral-branch-prefix <prefix>] [--branch-name <name>] [--debug]');
        process.exit(1);
    }

    const result = mergeConfig({ configFile, env, region, output, delimiter, ephemeralBranchPrefix, branchName, component });

    if (tfMode) {
        // If debug mode is enabled, output human-readable config to stderr for visibility
        if (debugMode) {
            console.error('=== DEBUG: Merged Configuration ===');
            console.error(JSON.stringify(result, null, 2));
            console.error('=== END DEBUG ===');

            // Write to a debug file in /tmp with random suffix for easier viewing when called from Terraform
            try {
                const timestamp = Date.now();
                const randomSuffix = Math.random().toString(36).substring(2, 8);
                const debugFile = path.join('/tmp', `merge-config-debug-${timestamp}-${randomSuffix}.json`);
                fs.writeFileSync(debugFile, JSON.stringify(result, null, 2));
                console.error(`=== DEBUG: Debug file written to ${debugFile} ===`);
            } catch (e) {
                console.error(`=== DEBUG: Could not write debug file: ${e.message} ===`);
            }
        }

        // For Terraform, output as { "mergedConfig": <object> }
        // Terraform needs the mergedConfig value to be a string, which it will then parse as JSON
        console.log(JSON.stringify({ mergedConfig: JSON.stringify(result) }));

    } else {
        // Pretty JSON to stdout
        console.log(JSON.stringify(result, null, 2));
    }
}
module.exports = mergeConfig;
