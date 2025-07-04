#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

function mergeConfig({ configFile, env, region, output, delimiter }) {
    const config = typeof configFile === 'string'
        ? JSON.parse(fs.readFileSync(path.resolve(configFile), 'utf8'))
        : configFile;

    const envSource = config.accounts || config.environments;

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
        const regionComp = region
            ? envSource?.[env]?.regions?.[region]?.[componentName] || {}
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
            if (region && envSource[env].regions?.[region]) {
                Object.keys(envSource[env].regions[region]).filter(k => isComponent(envSource[env].regions[region], k)).forEach(k => keys.add(k));
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
        const r = region
            ? Object.fromEntries(Object.entries(envSource?.[env]?.regions?.[region] || {}).filter(isNonComponent))
            : {};
        return deepMerge(d, e, r);
    }

    const merged = {
        ...getGlobalMerged(),
        ...Object.fromEntries(getAllComponentKeys().map(k => [k, getMergedComponentConfig(k)])),
    };

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
