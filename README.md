# Stainless Tools

[![NPM version](https://img.shields.io/npm/v/stainless-tools.svg?style=flat-square)](https://www.npmjs.com/package/stainless-tools)
![NPM Downloads](https://img.shields.io/npm/dm/stainless-tools)
[![TypeScript](https://img.shields.io/badge/%3C%2F%3E-TypeScript-%230074c1.svg)](http://www.typescriptlang.org/)

A TypeScript library and CLI tool for managing [Stainless](https://www.stainless.com/) config and generated SDKs. This tool helps you generate, monitor, and sync SDK repositories as you update your OpenAPI / Stainless config files.

## Table of Contents

- [Features](#features)
- [About this project](#about-this-project)
- [Installation](#installation)
- [Configuration](#configuration)
  - [Configuration Schema](#configuration-schema)
  - [Target Directory Templates](#target-directory-templates)
  - [Example Configuration](#example-configuration)
- [Generate Command](#generate-command)
  - [Usage](#usage)
  - [Branch Configuration and Environments](#branch-configuration-and-environments)
  - [How It Works](#how-it-works)

## Features

- 🔄 Clone and monitor SDK repositories for changes
- 📄 Automatic OpenAPI specification file handling
- ⚙️ Flexible configuration using cosmiconfig
- 🔒 Support for both HTTPS and SSH git URLs
- 🚀 Easy-to-use CLI interface
- 📦 Can be used as a library in your own projects
- 🎯 Default configurations for easier usage
- 🔑 Integration with Stainless API for publishing changes

## About this project

This `src` files were entirely built using [Cursor](https://www.cursor.com/). It took an entire day with careful prompting to cover various use-cases and write the appropriate tests and documentation. No human wrote any part of the `src` code, although the README has been hand-polished.

It has only been tested on MacOS under Node 22 (although built for 18). Other platforms may not be supported.

## Installation

You must have at least Node 18 installed to use this tool.

```bash
npm install stainless-tools -g
```

### Prerequisites

Ensure you have:
- Write access to the SDK repository you want to generate
- A Stainless API key. This is the same API key used for automating updates via [GitHub Action](https://app.stainlessapi.com/docs/guides/automate-updates#option-1-github-action-recommended)
- Have access to the generated SDK Repo as it will be checked out: `https://github.com/stainless-sdks/<project_name>-<language>`

#### Environment Setup

Before using the tool, you need to set up your environment variables. You can do this in two ways:

1. Create a `.env` file (or `.env.override` if you auto-generate your `.env` file) in your project root:
```bash
STAINLESS_API_KEY=your_api_key_here
```

2. Or export them in your shell:
```bash
export STAINLESS_API_KEY=your_api_key_here
```

## Configuration

The tool uses [cosmiconfig](https://github.com/davidtheclark/cosmiconfig) for configuration management. You can define your configuration in any of these ways:

- A `stainless-tools` property in package.json
- A `.stainless-toolsrc` file in JSON or YAML format
- A `.stainless-toolsrc.json`, `.stainless-toolsrc.yaml`, `.stainless-toolsrc.yml`, `.stainless-toolsrc.js`, or `.stainless-toolsrc.cjs` file
- A `stainless-tools.config.js` or `stainless-tools.config.cjs` CommonJS module

### Configuration Schema

```typescript
interface StainlessConfig {
  // Map of SDK names to their repository URLs
  // Each SDK can have a staging and/or production URL
  // By default, the staging URL is used, but you can use --prod to use the production URL
  stainlessSdkRepos: {
    [key: string]: {
      // The staging URL is used by default
      staging?: string;
      // The production URL is used when --prod is specified
      prod?: string;
    };
  };

  defaults?: {
    // Default branch name for all SDKs (required if not using cli flag or the STAINLESS_SDK_BRANCH environment variable)
    // Typically use 'main' for production and '<username>/dev' for staging
    // See: https://app.stainlessapi.com/docs/guides/branches
    branch?: string;

    // Default target directory for generated SDKs. Supports the following template variables:
    // - {sdk}: The name of the SDK being generated
    // - {env}: The environment (staging/prod) being used
    // - {branch}: The git branch name
    targetDir?: string;

    // OpenAPI specification file path (required if not using cli flag)
    openApiFile: string;

    // Optional: Stainless config file path
    stainlessConfigFile?: string;

    // Stainless project name (required if not using cli flag)
    projectName?: string;

    // Whether to use the "Guess with AI" command from the Stainless Studio for the Stainless Config. Default is false.
    guessConfig?: boolean;
  };
}
```

### Target Directory Templates

The `targetDir` configuration supports template variables that are dynamically replaced when generating SDKs:

- `{sdk}`: Replaced with the name of the SDK being generated
- `{env}`: Replaced with the current environment (`staging` or `prod`)
- `{branch}`: Replaced with the git branch name (forward slashes are converted to hyphens for filesystem compatibility)

This allows you to organize your SDKs in a structured way. For example:

```javascript
{
  defaults: {
    targetDir: './sdks/{env}/{sdk}/{branch}'
  }
}
```

Would generate directories like:
- `./sdks/staging/typescript/main`
- `./sdks/prod/typescript/main`
- `./sdks/staging/python/theogravity-dev` (from branch `theogravity/dev`)

This is particularly useful when working with multiple SDKs, environments, and branches simultaneously. Note that forward slashes in branch names are automatically converted to hyphens to ensure filesystem compatibility across different platforms.

### Example Configuration

```javascript
// stainless-tools.config.js
module.exports = {
  stainlessSdkRepos: {
    typescript: {
      // Used by default
      staging: 'git@github.com:stainless-sdks/yourproject-typescript-staging.git',
      // Used when --prod is specified
      prod: 'git@github.com:stainless-sdks/yourproject-typescript.git',
    },
  },
  defaults: {
    branch: 'main',
    // Organize SDKs by environment, name, and branch
    targetDir: './sdks/{env}/{sdk}/{branch}',
    openApiFile: './specs/openapi.yml',
    stainlessConfigFile: './stainless-tools.config.yml',
    projectName: 'my-project',
    guessConfig: false
  }
};
```

## Generate Command

The `generate` command is the primary feature of Stainless Tools. It will clone (or update if exists) an SDK repository to a target directory, publish the OpenAPI file and Stainless Config file to the Stainless Config repo, and continuously monitor for changes to the SDK repository, pulling in new changes when detected.

### Usage

```bash
stainless-tools generate [options] <sdk-name>

Arguments:
  sdk-name     Name of the SDK to generate

Options:
  -b, --branch <n>                Branch name to use (required if not in config)
  -t, --target-dir <dir>          Target directory for the SDK (required if not in config)
  -o, --open-api-file <file>      Required: OpenAPI specification file
  -c, --config <file>             Configuration file path
  -s, --stainless-config-file <file> Optional: Stainless configuration file
  -p, --project-name <n>          Project name for Stainless API (required when using --open-api-file)
  -g, --guess-config              Uses the "Guess with AI" command from the Stainless Studio for the Stainless Config if enabled
  --prod                          Use production URLs instead of staging URLs
  -h, --help                      Display help for command

### Examples

```bash
# Using staging URL (default) with config file fully defined
stainless-tools generate typescript

# Using production URL (typically with main branch)
stainless-tools generate typescript \
  --prod \
  --branch main

# Minimal required options (when no defaults defined in config file)
stainless-tools generate \
  --branch yourusername/dev \
  --open-api-file ./api-spec.json \
  --project-name my-project \
  typescript

# Using all CLI options with production URL
stainless-tools generate \
  --prod \
  --branch main \
  --target-dir ./sdks/typescript \
  --open-api-file ./api-spec.json \
  --project-name my-project \
  --config ./stainless-tools.config.js \
  --guess-config \
  typescript
```

### Branch Configuration and Environments

Each SDK supports two environments with separate repositories:
- `staging`: For development and testing, typically using `yourusername/dev` branch
- `prod`: For production releases, typically using `main` branch

The branch name must be specified through one of these methods (in order of precedence):
1. Command line: `--branch yourusername/dev`
2. Environment: `STAINLESS_SDK_BRANCH=yourusername/dev`
3. Config defaults: `defaults.branch` in your config file

Example configuration:
```javascript
{
  "stainlessSdkRepos": {
    "typescript": {
      "staging": "git@github.com:stainless-sdks/my-api-typescript.git",
      "prod": "git@github.com:my-org/my-api-typescript.git"
    }
  },
  "defaults": {
    "branch": "yourusername/dev"  // Default branch if not specified via CLI or env
  }
}
```

Basic usage:
```bash
# Development: Uses staging URL (default)
stainless-tools generate typescript \
  --branch yourusername/dev

# Production: Uses prod URL with main branch
stainless-tools generate typescript \
  --prod \
  --branch main
```

### How It Works

When you run `generate`:
1. It checks if the SDK repository exists in your target directory:
    - If the directory doesn't exist, it clones the repository fresh against the specified `branch`
    - If the directory exists and contains the correct repository, it updates it
    - If the directory exists but contains a different repository, it fails with an error asking you to remove it manually

2. If you provide an OpenAPI file (`--open-api-file`) or Stainless config file (`--stainless-config-file`):
    - It publishes these files to the Stainless Config repo via the Stainless API
    - The API processes the files and generates the SDK in the *staging* branch of the SDK repo

3. Continuously monitors for changes:
    - Pulls new SDK generation changes when detected
    - If you have local changes in your SDK clone:
        - Your changes are automatically stashed before pulling
        - After pulling, your changes are reapplied
        - If there are conflicts during reapply:
            - Your changes are preserved in the stash
            - You'll get instructions for resolving conflicts manually
    - When the OpenAPI or Stainless config files are updated:
        - Changes are automatically published to the Stainless Config repo
        - The API regenerates the SDK
        - New changes are pulled into your local clone (with stashing if needed)

4. Handles interruptions gracefully:
    - Ctrl+C stops the monitoring process
    - Any stashed changes are restored before exit
    - Cleanup is performed to ensure no watchers are left running
