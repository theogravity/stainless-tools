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
  - [Lifecycle Hooks](#lifecycle-hooks)
- [Generate Command](#generate-command)
  - [Usage](#usage)
  - [Branch Configuration and Environments](#branch-configuration-and-environments)
  - [How It Works](#how-it-works)
- [Publish Specs Command](#publish-specs-command)
  - [Usage](#usage-1)
  - [How It Works](#how-it-works-1)

## Features

- 🔄 Clone and monitor SDK repositories for changes
- 📄 Automatic OpenAPI specification file handling
- ⚙️ Flexible configuration using cosmiconfig
- 🔒 Support for both HTTPS and SSH git URLs
- 🚀 Easy-to-use CLI interface
- 📦 Can be used as a library in your own projects
- 🎯 Default configurations for easier usage
- 🔑 Integration with Stainless API for publishing changes
- 🔄 Lifecycle hooks for post-clone automation

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

  // Optional lifecycle hooks for each SDK
  // These commands are executed at specific points in the SDK lifecycle
  lifecycle?: {
    [key: string]: {
      postClone: string;
      postUpdate: string;
      prePublishSpec: string;
    };
  };

  defaults?: {
    // Default branch name for all SDKs (optional)
    // If not specified, will use existing branch in target directory or generate a new cli/ branch
    // Typically use 'main' for production and '<username>/dev' for staging
    // See: https://app.stainlessapi.com/docs/guides/branches
    branch?: string;

    // Default target directory for generated SDKs. Supports the following template variables:
    // - {sdk}: The name of the SDK being generated
    // - {env}: The environment (staging/prod) being used
    // - {branch}: The git branch name (forward slashes converted to hyphens)
    targetDir?: string;

    // Default OpenAPI specification file location
    openApiFile?: string;

    // Default Stainless configuration file
    stainlessConfigFile?: string;

    // Whether to use the "Guess with AI" command from the Stainless Studio for the Stainless Config
    guessConfig?: boolean;

    // Default project name
    projectName?: string;
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

### Lifecycle Hooks

The tool supports lifecycle hooks that allow you to automate tasks after certain operations. Currently supported hooks:

#### prePublishSpec

The `prePublishSpec` hook runs before:
- Publishing OpenAPI and Stainless configuration files to Stainless

This hook is useful for:
- Validating OpenAPI specifications
- Running linters
- Transforming specifications
- Running pre-publish checks

#### postClone

The `postClone` hook runs after:
- Initial clone of an SDK repository

This hook is useful for:
- Installing dependencies
- Running initial build scripts
- Setting up the development environment

#### postUpdate

The `postUpdate` hook runs after:
- Pulling new changes from the remote repository
- And after restoring any stashed local changes (if there were any)

This hook is useful for:
- Rebuilding after updates
- Running database migrations
- Updating dependencies
- Running tests against new changes

### Lifecycle Hook Configuration

Hooks are configured in the `lifecycle` section of your configuration file:

```javascript
module.exports = {
  stainlessSdkRepos: {
    typescript: {
      staging: 'git@github.com:stainless-sdks/test-typescript.git',
      prod: 'git@github.com:test-org/test-typescript.git',
    },
  },

  // Lifecycle hooks allow you to automate tasks at specific points in the SDK lifecycle
  // Each SDK can have its own set of hooks with different commands
  // All hooks have access to these environment variables:
  // - STAINLESS_TOOLS_SDK_PATH: Full path to the SDK repository
  // - STAINLESS_TOOLS_SDK_BRANCH: Current branch name
  // - STAINLESS_TOOLS_SDK_REPO_NAME: Name of the SDK (e.g., 'typescript')
  lifecycle: {
    typescript: {
      // Runs before publishing specs to Stainless
      // Use this to validate or transform your OpenAPI spec
      // Example: Run OpenAPI linter, validate against schema, etc.
      prePublishSpec: 'npm run validate-spec',

      // Runs after initial clone of the SDK repository
      // Use this to set up the development environment
      // Example: Install dependencies, configure git hooks, etc.
      postClone: 'cd $STAINLESS_TOOLS_SDK_PATH && npm install && npm run build',

      // Runs after pulling new changes from remote
      // Use this to ensure the SDK is ready after updates
      // Example: Rebuild, update dependencies, run migrations, etc.
      postUpdate: 'npm run build',
    },
    python: {
      // Run Python-specific validation before publishing
      // Example: Validate against custom rules, check formatting, etc.
      prePublishSpec: 'python scripts/validate_spec.py',

      // Set up Python virtual environment and install package
      // Example: Create venv, install dependencies, etc.
      postClone: 'python -m venv venv && source venv/bin/activate && pip install -e .',

      // Update dependencies and reinstall package after changes
      // Example: Update pip packages, rebuild extensions, etc.
      postUpdate: 'source venv/bin/activate && pip install -e .',
    },
  },

  // Optional default configurations
  defaults: {
    branch: 'main',
    targetDir: './sdks/{env}/{sdk}/{branch}',
    openApiFile: './specs/openapi.yml',
    stainlessConfigFile: './stainless-tools.config.yml',
    guessConfig: false,
    projectName: 'my-project'
  }
};
```

The hook commands:
- Run from the SDK repository directory
- Have access to a shell (so you can use &&, ||, etc.)
- Will cause the tool to exit with an error if the command fails
- Have access to the following environment variables:
  - `STAINLESS_TOOLS_SDK_PATH`: Full path to the cloned SDK repository
  - `STAINLESS_TOOLS_SDK_BRANCH`: Name of the current branch
  - `STAINLESS_TOOLS_SDK_REPO_NAME`: Name of the SDK repository (e.g., "typescript", "python")

Example using environment variables:

```javascript
module.exports = {
  lifecycle: {
    typescript: {
      // Use environment variables to avoid hardcoding paths
      postClone: 'cd $STAINLESS_TOOLS_SDK_PATH && npm install && npm run build',
      // Log the current branch during updates
      postUpdate: 'echo "Updating SDK on branch $STAINLESS_TOOLS_SDK_BRANCH" && npm run build'
    }
  }
};
```

You can also use external scripts:

```javascript
module.exports = {
  lifecycle: {
    typescript: {
      postClone: './scripts/setup-sdk.sh',  // Script has access to env vars
      postUpdate: './scripts/update-sdk.sh'
    }
  }
};
```

Example setup script (`setup-sdk.sh`):
```bash
#!/bin/bash
echo "Setting up $STAINLESS_TOOLS_SDK_REPO_NAME SDK in $STAINLESS_TOOLS_SDK_PATH"
cd "$STAINLESS_TOOLS_SDK_PATH"

# Install dependencies
npm install

# Run build
npm run build

# Additional setup steps...
```

## Generate Command

The `generate` command is the primary feature of Stainless Tools. It will clone (or update if exists) an SDK repository to a target directory, publish the OpenAPI file and Stainless Config file to the Stainless Config repo, and continuously monitor for changes to the SDK repository, pulling in new changes when detected.

### Usage

```bash
stainless-tools generate [options] <sdk-name>

Arguments:
  sdk-name     Name of the SDK to generate

Options:
  -b, --branch <name>                Branch name to use (optional)
  -t, --target-dir <dir>             Target directory for the SDK (required if not in config)
  -o, --open-api-file <file>         OpenAPI specification file (required if not in config)
  -c, --config <file>                Configuration file path
  -s, --stainless-config-file <file> Stainless configuration file (required if not in config)
  -p, --project-name <name>          Project name for Stainless API (required if not in config)
  -g, --guess-config                 Uses the "Guess with AI" command from the Stainless Studio for the Stainless Config if enabled
  --prod                             Use production URLs instead of staging URLs
  -h, --help                         Display help for command

### Examples

```bash
# Using staging URL (default) with config file fully defined
# Will use branch from config, env var, existing directory, or generate new cli/ branch
stainless-tools generate typescript

# Using production URL with main branch
stainless-tools generate typescript \
  --prod \
  --branch main

# Minimal required options (when no defaults defined in config file)
stainless-tools generate \
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

The branch name is completely optional and will be determined in this order:
1. Command line: `--branch yourusername/dev`
2. Environment: `STAINLESS_SDK_BRANCH=yourusername/dev`
3. Config defaults: `defaults.branch` in your config file
4. Current branch in target directory (if it exists)
5. Generate a new random `cli/<random-hex>` branch

Example configuration:
```json5
{
  "stainlessSdkRepos": {
    "typescript": {
      "staging": "git@github.com:stainless-sdks/my-api-typescript.git",
      "prod": "git@github.com:my-org/my-api-typescript.git"
    }
  },
  "defaults": {
    "branch": "yourusername/dev"  // Optional default branch
  }
}
```

Basic usage:
```bash
# Development: Uses staging URL (default)
# Will use branch from config, env var, or generate a new cli/ branch
stainless-tools generate typescript

# Production: Uses prod URL with explicit branch
stainless-tools generate typescript \
  --prod \
  --branch main

# Using existing branch from target directory
# If ./sdks/typescript exists and is on branch 'feature/new-api',
# this will continue using that branch
stainless-tools generate typescript
```

### How It Works

When you run `generate`:

1. Branch discovery:
   - Checks for branch name in this order:
     1. Command-line flag (`--branch`)
     2. Environment variable (`STAINLESS_SDK_BRANCH`)
     3. Configuration default (`defaults.branch`)
     4. Current branch in target directory (if it exists)
     5. Generates a new random `cli/<random-hex>` branch

2. If you provide an OpenAPI file (`--open-api-file`) or Stainless config file (`--stainless-config-file`):
   - Publishes these files to the Stainless Config repo via the Stainless API
   - The API processes the files and generates the SDK in the specified branch

3. Repository initialization:
   - If the directory doesn't exist:
     - Creates and initializes a new git repository
     - Waits for the branch to exist if it doesn't yet
     - Once the branch exists, checks it out fresh
   - If the directory exists:
     - Verifies it's the correct repository
     - If on a different branch:
       - Stashes any local changes
       - Waits for the target branch if it doesn't exist
       - Switches to the branch once it exists
       - Restores any stashed changes
     - Pulls latest changes

4. Continuous monitoring:
   - Watches for OpenAPI and config file changes:
     - Automatically publishes changes to Stainless
     - Waits for SDK regeneration
   - Monitors SDK repository for updates:
     - Pulls new changes when detected
     - Handles local changes by:
       - Stashing before updates
       - Reapplying after updates
       - Providing clear instructions if conflicts occur
   - Executes lifecycle hooks:
     - Runs `postClone` after initial setup
     - Runs `postUpdate` after pulling changes

5. Handles interruptions gracefully:
   - Ctrl+C stops the monitoring process
   - Restores any stashed changes before exit
   - Cleans up watchers and temporary state

This workflow ensures:
- Seamless coordination with CI/CD systems that create branches
- Safe handling of local changes during updates
- Proper sequencing of publish and branch operations
- Clear feedback during long-running operations
- Graceful handling of all error cases

## Publish Specs Command

The `publish-specs` command allows you to publish your OpenAPI specification and Stainless configuration directly to Stainless, making it easy to update your SDK configuration without using the web interface.

### Usage

```bash
stainless-tools publish-specs [options] <sdk-name>

Arguments:
  sdk-name     Name of the SDK to publish specifications for

Options:
  -b, --branch <branch>                Git branch to use (optional)
  -t, --target-dir <dir>               Directory where the SDK will be generated
  -o, --open-api-file <file>           Path to OpenAPI specification file
  -c, --config <file>                  Path to configuration file
  -s, --stainless-config-file <file>   Path to Stainless-specific configuration
  -p, --project-name <name>            Name of the project in Stainless
  -g, --guess-config                   Use AI to guess configuration
  --prod                               Use production URLs instead of staging
```

### Examples

```bash
# Basic usage - will use branch from config, env var, or generate new cli/ branch
stainless-tools publish-specs typescript

# With custom configuration and explicit branch
stainless-tools publish-specs typescript \
  --branch main \
  --open-api-file openapi.json \
  --config config.json

# Minimal required options
stainless-tools publish-specs \
  --project-name my-project \
  --open-api-file openapi.json \
  typescript

# With Stainless-specific configuration
stainless-tools publish-specs \
  --stainless-config-file stainless.config.json \
  --open-api-file openapi.json \
  typescript

# Production use with explicit branch
stainless-tools publish-specs typescript \
  --prod \
  --branch main \
  --open-api-file openapi.json
```

When you run `publish-specs`:

1. The command validates your input and configuration
2. Reads the OpenAPI specification file
3. Reads the Stainless configuration file (if provided)
4. Validates the configuration format
5. Publishes the files to Stainless using your API key

The publish-specs command is particularly useful for:
- CI/CD pipelines where you want to automate SDK updates
- Local development when you want to quickly update your SDK configuration
- Testing new API changes before committing them to production
