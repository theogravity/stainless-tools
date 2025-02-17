#!/usr/bin/env node

/**
 * CLI tool for Stainless SDK generation and management
 * This module provides command-line interface functionality for generating and watching SDKs
 * using the Stainless platform.
 */

import * as path from "node:path";
import { config } from "@dotenvx/dotenvx";
import { Command } from "commander";
import ora from "ora";
import { loadConfig } from "./config.js";
import { generateAndWatchSDK } from "./lib.js";
import { getTargetDir } from "./utils.js";

config({
  quiet: true,
  path: [".env", ".env.override"],
  ignore: ["MISSING_ENV_FILE"],
});

/**
 * Interface defining the options available for SDK generation
 */
interface GenerateOptions {
  branch?: string; // Git branch to use
  targetDir?: string; // Directory where the SDK will be generated
  "open-api-file"?: string; // Path to OpenAPI specification file
  config?: string; // Path to configuration file
  "stainless-config-file"?: string; // Path to Stainless-specific configuration
  projectName?: string; // Name of the project in Stainless
  "guess-config"?: boolean; // Whether to use AI to guess configuration
  prod?: boolean; // Whether to use production URLs
}

// Initialize the command-line program
const program = new Command();

// Set up basic program information
program
  .name("stainless-tools")
  .description("Stainless SDK tools for generating and managing SDKs")
  .version(process.env.npm_package_version || "0.0.0");

/**
 * Main function to handle SDK generation
 * @param sdkName - Name of the SDK to generate
 * @param options - Configuration options for generation
 * @returns Promise<number> - Exit code (0 for success, 1 for failure)
 */
export async function generateAction(sdkName: string, options: GenerateOptions): Promise<number> {
  const spinner = ora("Loading configuration...").start();
  let cleanup: (() => Promise<void>) | undefined;

  /**
   * Handler for graceful shutdown
   * Ensures proper cleanup when the process is terminated
   */
  async function handleExit() {
    spinner.stop();
    if (cleanup) {
      await cleanup();
      // Give time for any remaining operations to complete
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    process.exit(0);
  }

  // Setup signal handlers for graceful shutdown
  process.on("SIGINT", handleExit);
  process.on("SIGTERM", handleExit);

  try {
    const config = await loadConfig(options.config);
    const sdkConfig = config.stainlessSdkRepos[sdkName];

    if (!sdkConfig) {
      throw new Error(`SDK "${sdkName}" not found in configuration`);
    }

    const mode = options.prod ? "prod" : "staging";
    const sdkRepo = sdkConfig[mode];

    if (!sdkRepo) {
      throw new Error(
        `${mode === "prod" ? "Production" : "Staging"} URL not defined for SDK "${sdkName}". ` +
          `Please add a "${mode}" URL to the configuration.`,
      );
    }

    // Determine branch to use
    const branch = options.branch || process.env.STAINLESS_SDK_BRANCH || config.defaults?.branch;
    if (!branch) {
      throw new Error(
        "Branch name is required. Provide it via --branch option, STAINLESS_SDK_BRANCH environment variable, or in the configuration defaults.",
      );
    }

    // Resolve target directory path
    const baseDir = process.cwd();
    let targetDir: string;
    if (options.targetDir || config.defaults?.targetDir) {
      targetDir = path.resolve(baseDir, ".", options.targetDir || config.defaults?.targetDir || "");
    } else {
      // Extract repository name from Git URL for default target directory
      const gitUrlMatch = sdkRepo.match(/[:/]([^/]+?)(?:\.git)?$/);
      const repoName = gitUrlMatch ? gitUrlMatch[1] : sdkName;
      targetDir = path.resolve(baseDir, repoName);
    }

    // Resolve OpenAPI specification file path
    let openApiFile: string;
    if (options["open-api-file"] || config.defaults?.openApiFile) {
      openApiFile = path.resolve(baseDir, ".", options["open-api-file"] || config.defaults?.openApiFile || "");
    } else {
      throw new Error(
        "OpenAPI specification file is required. Provide it via --open-api-file option or in the configuration defaults.",
      );
    }

    // Resolve Stainless configuration file path if provided
    let stainlessConfigFile: string | undefined;
    if (options["stainless-config-file"] || config.defaults?.stainlessConfigFile) {
      stainlessConfigFile = path.resolve(
        baseDir,
        ".",
        options["stainless-config-file"] || config.defaults?.stainlessConfigFile || "",
      );
      console.log(`Stainless config file: ${stainlessConfigFile}`);
    }

    // Validate project name
    const projectName = options.projectName || config.defaults?.projectName;
    if (!projectName) {
      throw new Error(
        "Project name is required when using OpenAPI file. Provide it via --project-name option or in the configuration defaults.",
      );
    }

    // Log configuration details
    console.log(`\nSDK Repository (${mode}): ${sdkRepo}`);
    if (openApiFile || stainlessConfigFile) {
      console.log(`Project name: ${projectName}`);
    }

    console.log("\nWatching for changes in the SDK repository...");
    console.log(`Branch: ${branch}`);
    console.log(`Target directory: ${getTargetDir({ targetDir, sdkName, env: mode, branch })}`);
    if (openApiFile) {
      console.log(`OpenAPI file: ${openApiFile}`);
    }
    if (stainlessConfigFile) {
      console.log(`Stainless config file: ${stainlessConfigFile}`);
    }
    console.log();

    // Start watching for changes
    spinner.text = "Listening for changes...";
    cleanup = await generateAndWatchSDK({
      sdkName,
      sdkRepo,
      branch,
      targetDir,
      openApiFile,
      stainlessConfigFile,
      spinner,
      stainlessApiOptions: {
        projectName,
        guessConfig: options["guess-config"] || config.defaults?.guessConfig,
      },
      env: mode,
      lifecycle: config.lifecycle
    });

    spinner.succeed(`SDK "${sdkName}" is ready and watching for changes`);
    return 0;
  } catch (error) {
    spinner.fail((error as Error).message);
    return 1;
  } finally {
    // Cleanup: remove signal handlers
    process.off("SIGINT", handleExit);
    process.off("SIGTERM", handleExit);
  }
}

// Set up the generate command with all available options
program
  .command("generate")
  .description("Generate an SDK")
  .argument("<sdk-name>", "Name of the SDK to generate")
  .option("-b, --branch <branch>", "Git branch to use")
  .option("-t, --target-dir <dir>", "Directory where the SDK will be generated")
  .option("-o, --open-api-file <file>", "Path to OpenAPI specification file")
  .option("-c, --config <file>", "Path to configuration file")
  .option("-s, --stainless-config-file <file>", "Path to Stainless-specific configuration")
  .option("-p, --project-name <name>", "Name of the project in Stainless")
  .option("-g, --guess-config", "Use AI to guess configuration")
  .option("--prod", "Use production URLs instead of staging")
  .action(async (sdkName: string, options: GenerateOptions) => {
    const exitCode = await generateAction(sdkName, options);
    if (exitCode !== 0) {
      process.exit(exitCode);
    }
  });

// Only parse arguments when running as the main module
if (require.main === module) {
  program.parse();
}

export { program };
