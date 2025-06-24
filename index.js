// This is packaged into a single file using the 'ncc' tool; this is required to include our code along with all of the
// dependencies (eg: 'actions/core') in a single file which can be invoked from GitHub Actions
// To package this file, run the following commands:
//
//      npm install -g @vercel/ncc # only required once on your machine
//      npm install # install the dependencies for this project
//      ncc build index.js -m --no-source-map-register
//
// After this is done, the output will be in the 'dist' directory which is where the GitHub Action will look for the
// code to run.

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
