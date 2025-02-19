import { Command } from "commander";
import ora from "ora";
import { StainlessApi } from "../../StainlessApi.js";
import { StainlessError } from "../../StainlessError.js";
import type { SdkCommandOptions } from "../types.js";
import { readFileContents, validateAndProcessOptions } from "../utils.js";

/**
 * Creates and configures the publish-specs command
 * @returns The configured publish-specs command
 */
export function createPublishSpecsCommand(): Command {
  return new Command("publish-specs")
    .description("Publish SDK specifications to Stainless")
    .argument("<sdk-name>", "Name of the SDK to publish specifications for")
    .option("-b, --branch <branch>", "Git branch to use")
    .option("-t, --target-dir <dir>", "Directory where the SDK will be generated")
    .option("-o, --open-api-file <file>", "Path to OpenAPI specification file")
    .option("-c, --config <file>", "Path to configuration file")
    .option("-s, --stainless-config-file <file>", "Path to Stainless-specific configuration")
    .option("-p, --project-name <name>", "Name of the project in Stainless")
    .option("-g, --guess-config", "Use AI to guess configuration")
    .option("--prod", "Use production URLs instead of staging")
    .action(async (sdkName: string, options: SdkCommandOptions) => {
      const exitCode = await publishSpecsAction(sdkName, options);
      if (exitCode !== 0) {
        process.exit(exitCode);
      }
    });
}

/**
 * Main function to handle SDK specification publication
 * @param sdkName - Name of the SDK to publish specifications for
 * @param options - Configuration options for publication
 * @returns Promise<number> - Exit code (0 for success, 1 for failure)
 */
export async function publishSpecsAction(sdkName: string, options: SdkCommandOptions): Promise<number> {
  const spinner = ora("Loading configuration...").start();

  try {
    // Validate and process options first
    let validatedOptions;
    try {
      validatedOptions = await validateAndProcessOptions(sdkName, options);
    } catch (error) {
      if (error instanceof StainlessError) {
        spinner.fail(error.message);
        return 1;
      }
      throw error;
    }

    const { branch, openApiFile, stainlessConfigFile, projectName, guessConfig } = validatedOptions;

    // Read OpenAPI spec
    spinner.text = "Reading OpenAPI specification...";
    let spec: string;
    try {
      spec = await readFileContents(openApiFile);
    } catch (error) {
      spinner.fail(`Failed to read OpenAPI specification: ${error}`);
      return 1;
    }

    // Read Stainless config if provided
    let config: string | undefined;
    if (stainlessConfigFile) {
      spinner.text = "Reading Stainless configuration...";
      try {
        config = await readFileContents(stainlessConfigFile);
      } catch (error) {
        spinner.fail(`Failed to read Stainless configuration: ${error}`);
        return 1;
      }
    }

    // Initialize StainlessApi client
    const api = new StainlessApi();

    // Publish to Stainless
    spinner.text = "Publishing specifications to Stainless...";
    await api.publish({
      spec,
      config,
      branch,
      projectName,
      guessConfig,
    });

    spinner.succeed("Successfully published specifications to Stainless");
    return 0;
  } catch (error) {
    if (error instanceof StainlessError) {
      spinner.fail(error.message);
    } else {
      spinner.fail(`Unexpected error: ${error}`);
    }
    return 1;
  }
}
