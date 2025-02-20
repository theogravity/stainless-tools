import * as path from "node:path";
import { Command } from "commander";
import ora from "ora";
import { StainlessError } from "../../StainlessError.js";
import { generateAndWatchSDK } from "../../generate-and-watch-sdk";
import { getTargetDir } from "../../utils.js";
import type { SdkCommandOptions } from "../types.js";
import { validateAndProcessOptions } from "../utils.js";

/**
 * Creates and configures the generate command
 * @returns The configured generate command
 */
export function createGenerateCommand(): Command {
  return new Command("generate")
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
    .action(async (sdkName: string, options: SdkCommandOptions) => {
      const exitCode = await generateAction(sdkName, options);
      if (exitCode !== 0) {
        process.exit(exitCode);
      }
    });
}

/**
 * Main function to handle SDK generation
 * @param sdkName - Name of the SDK to generate
 * @param options - Configuration options for generation
 * @returns Promise<number> - Exit code (0 for success, 1 for failure)
 */
export async function generateAction(sdkName: string, options: SdkCommandOptions): Promise<number> {
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
    // Validate and process options
    const { branch, openApiFile, stainlessConfigFile, projectName, guessConfig, sdkRepo, config } =
      await validateAndProcessOptions(sdkName, options);

    // Resolve target directory path
    const baseDir = process.cwd();
    const targetDir = path.resolve(
      baseDir,
      getTargetDir({
        targetDir: options.targetDir || config.defaults?.targetDir || "./sdks/{sdk}",
        sdkName,
        env: options.prod ? "prod" : "staging",
        branch,
      }),
    );

    // Log configuration details
    console.log(`\nSDK Repository (${options.prod ? "prod" : "staging"}): ${sdkRepo}`);
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
        guessConfig,
      },
      env: options.prod ? "prod" : "staging",
      lifecycle: config.lifecycle,
    });

    return 0;
  } catch (error) {
    if (error instanceof StainlessError) {
      spinner.fail(error.message);
    } else if (error instanceof Error) {
      spinner.fail(error.message);
    } else {
      spinner.fail(`Unexpected error: ${error}`);
    }
    return 1;
  } finally {
    // Cleanup: remove signal handlers
    process.off("SIGINT", handleExit);
    process.off("SIGTERM", handleExit);
  }
}
