import * as fs from "node:fs/promises";
import * as path from "node:path";
import { StainlessError } from "../StainlessError.js";
import { type StainlessConfig, loadConfig } from "../config.js";
import type { SdkCommandOptions } from "./types.js";

/**
 * Validates and processes command options, loading configuration and checking required fields
 */
export async function validateAndProcessOptions(
  sdkName: string,
  options: SdkCommandOptions,
): Promise<{
  branch: string;
  openApiFile: string;
  stainlessConfigFile?: string;
  projectName: string;
  guessConfig: boolean;
  sdkRepo: string;
  config: StainlessConfig;
}> {
  const config = await loadConfig(options.config);
  const sdkConfig = config.stainlessSdkRepos[sdkName];

  if (!sdkConfig) {
    throw new StainlessError(`SDK "${sdkName}" not found in configuration`);
  }

  const mode = options.prod ? "prod" : "staging";
  const sdkRepo = sdkConfig[mode];

  if (!sdkRepo) {
    throw new StainlessError(
      `${mode === "prod" ? "Production" : "Staging"} URL not defined for SDK "${sdkName}". ` +
        `Please add a "${mode}" URL to the configuration.`,
    );
  }

  // Determine branch to use
  const branch = options.branch || process.env.STAINLESS_SDK_BRANCH || config.defaults?.branch;
  if (!branch) {
    throw new StainlessError(
      "Branch name is required. Provide it via --branch option, STAINLESS_SDK_BRANCH environment variable, or in the configuration defaults.",
    );
  }

  // Resolve OpenAPI specification file path
  const baseDir = process.cwd();
  if (!options["open-api-file"] && !config.defaults?.openApiFile) {
    throw new StainlessError(
      "OpenAPI specification file is required. Provide it via --open-api-file option or in the configuration defaults.",
    );
  }

  const openApiFile = path.resolve(baseDir, ".", options["open-api-file"] || config.defaults?.openApiFile || "");

  // Resolve Stainless configuration file path if provided
  let stainlessConfigFile: string | undefined;
  if (options["stainless-config-file"] || config.defaults?.stainlessConfigFile) {
    stainlessConfigFile = path.resolve(
      baseDir,
      ".",
      options["stainless-config-file"] || config.defaults?.stainlessConfigFile || "",
    );
  }

  // Validate project name
  const projectName = options.projectName || config.defaults?.projectName;
  if (!projectName) {
    throw new StainlessError(
      "Project name is required when using OpenAPI file. Provide it via --project-name option or in the configuration defaults.",
    );
  }

  return {
    branch,
    openApiFile,
    stainlessConfigFile,
    projectName,
    guessConfig: options["guess-config"] || config.defaults?.guessConfig || false,
    sdkRepo,
    config,
  };
}

/**
 * Reads a file and returns its contents as a string
 */
export async function readFileContents(filePath: string): Promise<string> {
  try {
    return await fs.readFile(filePath, "utf-8");
  } catch (error) {
    throw new StainlessError(`Failed to read file ${filePath}: ${error}`);
  }
}
