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
const { execSync } = require('child_process');
const mergeConfig = require('./merge-config');
const { join } = require('path');

const fs = require('fs');
const JSON5 = require('json5');

// Check for --parse <file> argument. If it's present, just parse the specified file with JSON5 and exit
const args = process.argv.slice(2);
const parseIndex = args.indexOf('--parse');
if (parseIndex !== -1 && parseIndex + 1 < args.length) {
    const filePath = args[parseIndex + 1];
    try {
        const fileContent = fs.readFileSync(filePath, 'utf8');
        const parsed = JSON5.parse(fileContent);
        console.log(JSON.stringify(parsed, null, 2));
        process.exit(0);
    } catch (error) {
        console.error(`Error parsing file ${filePath}:`, error.message);
        process.exit(1);
    }
}

function exposeJqJson5() {
  const tempBin = join(process.env.RUNNER_TEMP || '/tmp', 'parse-deploy-config-bin');
  fs.mkdirSync(tempBin, { recursive: true });

  const wrapper = join(tempBin, 'jq-json5');
  const actionRoot = process.env.GITHUB_ACTION_PATH || __dirname;

  fs.writeFileSync(wrapper,
`#!/usr/bin/env bash
set -eo pipefail
file="$1"; shift
node "${actionRoot}/index.js" --parse "$file" | jq "$@"
`);
  fs.chmodSync(wrapper, 0o755);
  core.addPath(tempBin);
}

// GitHub Action code:
try {
    const githubToken = core.getInput('github-token');
    if (githubToken && process.env.GITHUB_ACTION_REPOSITORY) {
        const serverUrl = process.env.GITHUB_SERVER_URL || 'https://github.com';
        const repoUrl = `${serverUrl}/${process.env.GITHUB_ACTION_REPOSITORY}.git`;
        const insteadOfUrl = `ssh://git@${new URL(serverUrl).hostname}/${process.env.GITHUB_ACTION_REPOSITORY}.git`;

        core.info(`Configuring git for private repository access to '${process.env.GITHUB_ACTION_REPOSITORY}' for URLs using '${insteadOfUrl}'`);
        execSync(`git config --global url."https://oauth2:${githubToken}@${new URL(repoUrl).hostname}${new URL(repoUrl).pathname}".insteadOf "${insteadOfUrl}"`);
    }

    const configFile = core.getInput('config', { required: true });
    const env = core.getInput('env', { required: true });
    const region = core.getInput('region', { required: true });
    const delimiter = core.getInput('delimiter') || '.';
    const ephemeralBranchPrefix = core.getInput('ephemeral-branch-prefix');
    const disableEphemeralBranchCheck = core.getInput('disable-ephemeral-branch-check') === 'true';
    const displayOutputs = core.getInput('display-outputs') === 'true';
    const component = core.getInput('component') || null;

    const flat = mergeConfig({
        configFile,
        env,
        region,
        output: 'flatten',
        delimiter,
        ephemeralBranchPrefix,
        disableEphemeralBranchCheck,
        branchName: process.env.GITHUB_REF_NAME,
        component
    });

    // Display outputs if requested
    if (displayOutputs) {
        console.log('=== Merged Configuration ===');
        console.log(JSON.stringify(flat, null, 2));
        console.log('============================');
    }

    for (const [k, v] of Object.entries(flat)) {
        core.setOutput(k, v);
    }

    exposeJqJson5();
} catch (error) {
    core.setFailed(error.message || error);
}
