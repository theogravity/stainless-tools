# package

[![NPM version](https://img.shields.io/npm/v/loglayer.svg?style=flat-square)](https://www.npmjs.com/package/loglayer)
![NPM Downloads](https://img.shields.io/npm/dm/loglayer)
[![TypeScript](https://img.shields.io/badge/%3C%2F%3E-TypeScript-%230074c1.svg)](http://www.typescriptlang.org/)

Boilerplate for creating a new NPM package with ESM and CJS support.

## Setup

Configure the following files:

- `package.json`
- Edit `.changeset/config.json` to your repository

In Github settings:

- `Code and Automation > Actions > Workflow permissions`
  * `Read and write permissions`
  * `Allow Github Actions to create and approve pull requests`
- `Secrets and variables > Actions`
  * `Repository Secrets > Actions > create NPM_TOKEN`

## Development workflow / Add a new CHANGELOG.md entry + package versioning

- Create a branch and make changes.
- Create a new changeset entry: `pnpm changeset`
- Commit your changes and create a pull request.
- Merge the pull request
- A new PR will be created with the changeset entry/ies.
- When the PR is merged, the package versions will be bumped and published and the changelog updated.
