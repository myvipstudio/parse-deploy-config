const core = require('@actions/core');
const mergeConfig = require('./merge-config');

try {
    const configFile = core.getInput('config', { required: true });
    const env = core.getInput('env', { required: true });
    const region = core.getInput('region', { required: true });
    const delimiter = core.getInput('delimiter') || '.';

    const flat = mergeConfig({ configFile, env, region, output: 'flatten', delimiter });

    for (const [k, v] of Object.entries(flat)) {
        core.setOutput(k, v);
    }
} catch (error) {
    core.setFailed(error.message || error);
}
