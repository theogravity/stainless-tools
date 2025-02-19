import type { Ora } from "ora";
import { StainlessApi } from "./StainlessApi.js";
import { StainlessError } from "./StainlessError.js";
import { isValidGitUrl } from "./utils.js";
import { FileWatcher } from "./FileWatcher.js";
import { RepoManager } from "./RepoManager.js";

interface StainlessToolsOptions {
  sdkRepo: string;
  branch: string;
  targetDir: string;
  openApiFile?: string;
  stainlessConfigFile?: string;
  spinner?: Ora;
  stainlessApiOptions?: {
    apiKey?: string;
    baseUrl?: string;
    projectName?: string;
    guessConfig?: boolean;
  };
  sdkName?: string;
  env?: string; // The environment (e.g. "staging" or "prod")
  lifecycle?: {
    [key: string]: {
      postClone?: string;
      postUpdate?: string;
    };
  };
}

/**
 * StainlessTools manages SDK repositories for the Stainless SDK service.
 * It handles cloning, updating, and synchronizing repositories, as well as managing OpenAPI
 * and configuration files.
 */
export class StainlessTools {
  private repoManager: RepoManager;
  private fileWatcher: FileWatcher;
  private stainlessApi: StainlessApi;

  /**
   * Creates a new instance of StainlessTools.
   * @param options - Configuration options for StainlessTools
   * @throws {StainlessError} If any of the required parameters are invalid or missing
   */
  constructor(private options: StainlessToolsOptions) {
    this.validateInputs();
    this.stainlessApi = new StainlessApi(options.stainlessApiOptions);
    
    this.repoManager = new RepoManager({
      sdkRepo: options.sdkRepo,
      branch: options.branch,
      targetDir: options.targetDir,
      sdkName: options.sdkName,
      env: options.env,
      lifecycle: options.lifecycle,
    });

    this.fileWatcher = new FileWatcher({
      openApiFile: options.openApiFile,
      stainlessConfigFile: options.stainlessConfigFile,
      spinner: options.spinner,
      branch: options.branch,
      stainlessApi: this.stainlessApi,
      stainlessApiOptions: {
        projectName: options.stainlessApiOptions?.projectName,
        guessConfig: options.stainlessApiOptions?.guessConfig,
      },
    });
  }

  /**
   * Validates all constructor inputs to ensure they meet requirements.
   * @private
   * @throws {StainlessError} If any validation fails
   */
  private validateInputs(): void {
    if (!this.options.sdkRepo) {
      throw new StainlessError("SDK repository URL is required");
    }
    if (!this.options.branch) {
      throw new StainlessError("Branch name is required");
    }
    if (!this.options.targetDir) {
      throw new StainlessError("Target directory is required");
    }

    if (!isValidGitUrl(this.options.sdkRepo)) {
      throw new StainlessError(`Invalid SDK repository URL: ${this.options.sdkRepo}`);
    }
  }

  /**
   * Clones the SDK repository and sets up the initial state.
   * If OpenAPI or config files are specified, they will be published to the Stainless API.
   * @throws {StainlessError} If cloning fails or if there are issues publishing files
   */
  async clone(): Promise<void> {
    try {
      // Validate OpenAPI file requirement first
      if (this.options.stainlessConfigFile && !this.options.openApiFile) {
        throw new StainlessError("OpenAPI specification file is required");
      }

      // Publish files if provided
      if (this.options.openApiFile || this.options.stainlessConfigFile) {
        await this.fileWatcher.publishFiles();
      }

      await this.repoManager.initializeRepo();

      // Start watching for file changes after successful clone
      this.fileWatcher.start();
    } catch (error) {
      if (error instanceof StainlessError) throw error;
      throw new StainlessError("Failed to clone or update SDK repository", error);
    }
  }

  /**
   * Checks if there are new changes in the SDK repository.
   * @returns True if there are new changes, false otherwise
   * @throws {StainlessError} If Git commands fail
   */
  async hasNewChanges(): Promise<boolean> {
    return this.repoManager.hasNewChanges();
  }

  /**
   * Pulls changes from the SDK repository.
   * If there are local changes, they will be stashed before pulling and restored after.
   * @throws {StainlessError} If Git commands fail
   */
  async pullChanges(): Promise<void> {
    await this.repoManager.pullChanges();
  }

  /**
   * Cleans up resources used by the tools.
   */
  cleanup(): void {
    this.fileWatcher.stop();
  }
}
