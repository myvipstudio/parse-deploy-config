#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

function mergeConfig({ configFile, env, region, output, delimiter }) {
    const config = typeof configFile === 'string'
        ? JSON.parse(fs.readFileSync(path.resolve(configFile), 'utf8'))
        : configFile;

    const envSource = config.accounts || config.environments;

    // Region mapping: short code -> full name
    const regionMapping = {
        'use1': 'us-east-1',
        'use2': 'us-east-2',
        'usw1': 'us-west-1',
        'uswe2': 'us-west-2',
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

    // Convert region to full name if it's a short code
    const fullRegion = region ? (regionMapping[region] || region) : region;
    const shortRegion = region ? (Object.keys(regionMapping).find(key => regionMapping[key] === fullRegion) || region) : region;

    // Validate environment exists
    if (!envSource || !envSource[env]) {
        throw new Error(`Environment '${env}' not found in config file`);
    }

    // Validate region exists in mapping if provided
    if (region && !regionMapping[region] && !Object.values(regionMapping).includes(region)) {
        throw new Error(`Region '${region}' is not a valid region code or name`);
    }

    // Validate region exists in config file if specified
    if (fullRegion && (!envSource[env].regions || !envSource[env].regions[fullRegion])) {
        throw new Error(`Region '${fullRegion}' not found in environment '${env}'`);
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
        const envComp = envSource?.[env]?.[componentName] || {};
        const regionComp = fullRegion
            ? envSource?.[env]?.regions?.[fullRegion]?.[componentName] || {}
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
        if (envSource?.[env]) {
            Object.keys(envSource[env]).filter(k => isComponent(envSource[env], k) && k !== 'regions').forEach(k => keys.add(k));
            if (fullRegion && envSource[env].regions?.[fullRegion]) {
                Object.keys(envSource[env].regions[fullRegion]).filter(k => isComponent(envSource[env].regions[fullRegion], k)).forEach(k => keys.add(k));
            }
        }
        return Array.from(keys);
    }

    function getGlobalMerged() {
        function isNonComponent([k, v]) {
            return typeof v !== 'object' || v === null || Array.isArray(v);
        }
        const d = Object.fromEntries(Object.entries(config.defaults || {}).filter(isNonComponent));
        const e = Object.fromEntries(Object.entries(envSource?.[env] || {}).filter(isNonComponent));
        const r = fullRegion
            ? Object.fromEntries(Object.entries(envSource?.[env]?.regions?.[fullRegion] || {}).filter(isNonComponent))
            : {};
        return deepMerge(d, e, r);
    }

    const merged = {
        ...getGlobalMerged(),
        ...Object.fromEntries(getAllComponentKeys().map(k => [k, getMergedComponentConfig(k)])),
    };

    // Add environment and region to the merged result
    merged.env = env;
    merged.region = fullRegion || '';
    merged.region_short = shortRegion || '';

    if (output === 'flatten') {
        return flatten(merged, '', delimiter || '.');
    }
    return merged;
}

// --- Flattening logic
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
    // CLI: --config <path> --env <env> [--region <region>] [--output json|flatten] [--delimiter <char>] [--terraform]
    const args = process.argv.slice(2);
    let configFile, env, region, output = 'json', delimiter = '.', tfMode = false;

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
            default:
                console.error(`Unrecognized argument: ${args[i]}`);
                process.exit(1);
        }
    }

    if (!configFile || !env) {
        console.error('Usage: merge-config.js --config <configFile> --env <env> [--region <region>] [--output json|flatten] [--delimiter <char>] [--terraform]');
        process.exit(1);
    }

    const result = mergeConfig({ configFile, env, region, output, delimiter });

    if (tfMode) {
        // For Terraform, output as { "mergedConfig": <object> }
        // Terraform needs the mergedConfig value to be a string, which it will then parse as JSON
        console.log(JSON.stringify({ mergedConfig: JSON.stringify(result) }));

    } else {
        // Pretty JSON to stdout
        console.log(JSON.stringify(result, null, 2));
    }
}
module.exports = mergeConfig;
