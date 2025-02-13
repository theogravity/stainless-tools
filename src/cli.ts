#!/usr/bin/env node

import "dotenv/config";
import * as path from "node:path";
import chalk from "chalk";
import { Command } from "commander";
import ora from "ora";
import { loadConfig } from "./config.js";
import { generateAndWatchSDK } from "./lib.js";

interface GenerateOptions {
  branch?: string;
  targetDir?: string;
  "open-api-file"?: string;
  config?: string;
  "stainless-config-file"?: string;
  projectName?: string;
  "guess-config"?: boolean;
}

const program = new Command();

program
  .name("stainless-tools")
  .description("Stainless SDK tools for generating and managing SDKs")
  .version(process.env.npm_package_version || "0.0.0");

export async function generateAction(sdkName: string, options: GenerateOptions) {
  const spinner = ora("Loading configuration...").start();
  let cleanup: (() => Promise<void>) | undefined;

  async function handleExit() {
    spinner.stop();
    if (cleanup) {
      await cleanup();
      // Give time for any remaining operations to complete
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    process.exit(0);
  }

  // Setup signal handlers
  process.on("SIGINT", handleExit);
  process.on("SIGTERM", handleExit);

  try {
    const config = await loadConfig(options.config);
    const sdkRepo = config.stainlessSdkRepos[sdkName];
    if (!sdkRepo) {
      throw new Error(`SDK "${sdkName}" not found in the configuration "stainlessSdkRepos"`);
    }

    const branch = options.branch || config.defaults?.branch;
    if (!branch) {
      throw new Error("Branch name is required. Provide it via --branch option or in the configuration defaults.");
    }

    const baseDir = process.cwd();
    let targetDir: string;
    if (options.targetDir || config.defaults?.targetDir) {
      targetDir = path.resolve(baseDir, ".", options.targetDir || config.defaults?.targetDir || "");
    } else {
      // Try to extract repository name from Git URL
      const gitUrlMatch = sdkRepo.match(/[:/]([^/]+?)(?:\.git)?$/);
      const repoName = gitUrlMatch ? gitUrlMatch[1] : sdkName;
      targetDir = path.resolve(baseDir, repoName);
    }

    let openApiFile: string;
    if (options["open-api-file"] || config.defaults?.openApiFile) {
      openApiFile = path.resolve(baseDir, ".", options["open-api-file"] || config.defaults?.openApiFile || "");
    } else {
      throw new Error(
        "OpenAPI specification file is required. Provide it via --open-api-file option or in the configuration defaults.",
      );
    }

    let stainlessConfigFile: string | undefined;
    if (options["stainless-config-file"] || config.defaults?.stainlessConfigFile) {
      stainlessConfigFile = path.resolve(
        baseDir,
        ".",
        options["stainless-config-file"] || config.defaults?.stainlessConfigFile || "",
      );
      console.log(`Stainless config file: ${stainlessConfigFile}`);
    }

    const projectName = options.projectName || config.defaults?.projectName;
    if (!projectName) {
      throw new Error(
        "Project name is required when using OpenAPI file. Provide it via --project-name option or in the configuration defaults.",
      );
    }

    console.log("\nRepositories:");
    console.log(`SDK: ${sdkRepo}`);
    if (openApiFile || stainlessConfigFile) {
      console.log(`Project name: ${projectName}`);
    }

    console.log("\nWatching for changes in the SDK repository...");
    console.log(`Branch: ${branch}`);
    console.log(`Target directory: ${targetDir}`);
    if (openApiFile) {
      console.log(`OpenAPI file: ${openApiFile}`);
    }
    if (stainlessConfigFile) {
      console.log(`Stainless config file: ${stainlessConfigFile}`);
    }
    console.log();

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
        guessConfig: options["guess-config"] || config.defaults?.guessConfig || false,
      },
    });

    spinner.succeed(`SDK checked out for "${sdkName}"`);
    spinner.start("Listening for new SDK updates...\n");
    return 0;
  } catch (error) {
    spinner.fail("Error occurred");
    if (error instanceof Error) {
      console.error(chalk.red(`\nError: ${error.message}`));
      // Show cause if it exists (e.g. from StainlessError)
      if ("cause" in error && error.cause) {
        if (error.cause instanceof Error) {
          const causeMessage = error.cause.message;
          console.error(chalk.red(`Caused by: ${causeMessage}`));
          // Update message to match new behavior
          if (causeMessage.includes("already exists and is not an empty directory")) {
            console.error(chalk.yellow("\nPlease remove the directory manually and try again."));
          }
        } else {
          console.error(chalk.red(`Caused by: ${error.cause}`));
        }
      }
    } else {
      console.error(chalk.red("\nError: Unknown error occurred"));
    }
    return 1;
  } finally {
    // Remove signal handlers
    process.off("SIGINT", handleExit);
    process.off("SIGTERM", handleExit);
  }
}

program
  .command("generate")
  .description("Generate and watch an SDK")
  .argument("<sdk-name>", "Name of the SDK to generate")
  .option("-b, --branch <n>", "Branch name")
  .option("-t, --target-dir <dir>", "Target directory")
  .option("-o, --open-api-file <file>", "OpenAPI file path")
  .option("-c, --config <file>", "Config file path")
  .option("-s, --stainless-config-file <file>", "Stainless configuration file path")
  .option("-p, --project-name <n>", "Project name for Stainless API")
  .option(
    "-g, --guess-config",
    'Uses the "Guess with AI" command from the Stainless Studio for the Stainless Config if enabled',
  )
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
