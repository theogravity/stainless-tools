import * as fs from "node:fs/promises";
import * as path from "node:path";
import { StainlessError } from "../StainlessError.js";
import { type StainlessConfig, loadConfig } from "../config.js";
import type { SdkCommandOptions } from "./types.js";
import * as crypto from "node:crypto";
import simpleGit from "simple-git";
import { getTargetDir } from "../utils.js";

/**
 * Generates a random branch name for the CLI
 */
function generateRandomBranchName(): string {
  return `cli/${crypto.randomBytes(4).toString('hex')}`;
}

/**
 * Gets the current branch name from a git repository
 */
async function getCurrentBranch(targetDir: string): Promise<string | undefined> {
  try {
    const git = simpleGit(targetDir);
    const branchSummary = await git.branch();
    return branchSummary.current;
  } catch {
    return undefined;
  }
}

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

  const baseDir = process.cwd();
  const targetDir = path.resolve(
    baseDir,
    getTargetDir({
      targetDir: options.targetDir || config.defaults?.targetDir || "./sdks/{sdk}",
      sdkName,
      env: mode,
      branch: "temp", // Temporary value since we don't have the branch yet
    }),
  );

  // Determine branch to use in this order:
  // 1. User-specified branch flag
  // 2. Environment variable
  // 3. Config default
  // 4. Current branch in target directory if it exists
  // 5. Generate a new cli/ branch
  let branch = options.branch || process.env.STAINLESS_SDK_BRANCH || config.defaults?.branch;
  
  if (!branch) {
    const currentBranch = await getCurrentBranch(targetDir);
    branch = currentBranch || generateRandomBranchName();
  }

  // Resolve OpenAPI specification file path
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
