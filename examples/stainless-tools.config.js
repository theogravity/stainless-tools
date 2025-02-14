/**
 * Example Stainless Tools configuration file
 * This file can be named:
 * - stainless-tools.config.js
 * - .stainless-toolsrc.js
 * - Or any other format supported by cosmiconfig
 */

/** @type {import('../dist/config').StainlessConfig} */
module.exports = {
  // Map of SDK names to their repository URLs
  // If using the main branch, then you will want to use the production SDK repo
  // If using non-main, eg <username>/dev, then you will want to use the staging SDK repo
  // e.g. git@github.com:stainless-sdks/<project>-typescript.git
  // The key is used as the <sdk-name> in the CLI
  stainlessSdkRepos: {
    typescript: 'git@github.com:stainless-sdks/test-typescript.git',
    python: 'git@github.com:stainless-sdks/test-python.git',
  },

  // Optional default configurations
  // These values will be used if not provided via CLI options
  defaults: {
    // Default branch name for all SDKs
    // If using the production SDK repo, then you will want to use the main branch
    // If using the staging SDK repo, then you will want to use the <username>/dev branch
    // See: https://app.stainlessapi.com/docs/guides/branches
    branch: 'main',

    // Default target directory pattern (can use {sdk} placeholder)
    targetDir: './sdks/{sdk}',

    // Default OpenAPI specification file location
    openApiFile: './specs/openapi.yml',

    // Default Stainless configuration file
    stainlessConfigFile: './stainless-tools.config.yml',

    // Whether to use the "Guess with AI" command from the Stainless Studio for the Stainless Config
    guessConfig: false,

    projectName: 'my-project'
  }
}; 