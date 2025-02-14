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
  // Each SDK has a staging and production repository URL
  // Use --prod flag to use production URLs, otherwise staging URLs are used by default
  stainlessSdkRepos: {
    typescript: {
      staging: 'git@github.com:stainless-sdks/test-typescript.git',
      prod: 'git@github.com:test-org/test-typescript.git',
    },
    python: {
      staging: 'git@github.com:stainless-sdks/test-python.git',
      prod: 'git@github.com:test-org/test-python.git',
    },
  },

  // Optional default configurations
  // These values will be used if not provided via CLI options
  defaults: {
    // Default branch name for all SDKs
    // Typically use 'main' for production and '<username>/dev' for staging
    // See: https://app.stainlessapi.com/docs/guides/branches
    branch: 'main',

    // Default target directory pattern (can use {sdk}, {env}, and {branch} placeholders)
    // - {sdk}: The name of the SDK being generated
    // - {env}: The environment (staging/prod) being used
    // - {branch}: The git branch name
    targetDir: './sdks/{env}/{sdk}/{branch}',

    // Default OpenAPI specification file location
    openApiFile: './specs/openapi.yml',

    // Default Stainless configuration file
    stainlessConfigFile: './stainless-tools.config.yml',

    // Whether to use the "Guess with AI" command from the Stainless Studio for the Stainless Config
    guessConfig: false,

    projectName: 'my-project'
  }
}; 