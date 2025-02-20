import type { Ora } from "ora";
import { FileWatcher } from "./FileWatcher.js";
import { LifecycleManager } from "./LifecycleManager.js";
import { RepoManager } from "./RepoManager.js";
import { StainlessApi } from "./StainlessApi.js";
import { StainlessError } from "./StainlessError.js";
import { isValidGitUrl } from "./utils.js";

/**
 * Options for configuring a StainlessTools instance.
 */
export interface StainlessToolsOptions {
  /**
   * Git repository URL for the SDK.
   */
  sdkRepo: string;
  /**
   * Git branch to use for the SDK.
   */
  branch: string;
  /**
   * Local directory where the SDK repository will be cloned/managed.
   */
  targetDir: string;
  /**
   * Path to the OpenAPI specification file.
   * Required for all operations.
   */
  openApiFile: string;
  /**
   * Path to the Stainless configuration file.
   */
  stainlessConfigFile?: string;
  /**
   * Name of the project in Stainless.
   */
  projectName: string;
  /**
   * Name of the SDK (e.g., 'typescript', 'python').
   */
  sdkName?: string;
  /**
   * Current environment (staging/prod).
   */
  env?: string;
  /**
   * Whether to use AI to guess the configuration.
   */
  guessConfig?: boolean;
  /**
   * Lifecycle manager for executing hooks at various stages.
   */
  lifecycleManager: LifecycleManager;
  /**
   * Progress spinner for CLI output.
   */
  spinner?: Ora;
  /**
   * Options for configuring the Stainless API client.
   */
  stainlessApiOptions?: {
    /**
     * Stainless API key for authentication.
     */
    apiKey?: string;
    /**
     * Base URL for the Stainless API.
     */
    baseUrl?: string;
    /**
     * Project name in Stainless.
     */
    projectName?: string;
  };
  /**
   * Lifecycle hooks configuration.
   */
  lifecycle?: {
    [key: string]: {
      /**
       * Command to run after cloning the repository.
       */
      postClone?: string;
      /**
       * Command to run after updating the repository.
       */
      postUpdate?: string;
    };
  };
}

/**
 * Main class for managing Stainless SDK generation and updates.
 *
 * StainlessTools orchestrates the entire SDK management process by:
 * - Coordinating between different components (API, repo manager, file watcher)
 * - Managing SDK repository cloning and updates
 * - Publishing OpenAPI and configuration files
 * - Monitoring files for changes
 * - Executing lifecycle hooks at appropriate times
 * - Providing status updates and error handling
 *
 * It serves as the high-level interface for the Stainless Tools CLI
 * and can also be used programmatically.
 *
 * Example usage:
 * ```typescript
 * const tools = new StainlessTools({
 *   sdkRepo: 'git@github.com:org/sdk.git',
 *   branch: 'main',
 *   targetDir: './sdks/typescript',
 *   openApiFile: './openapi.yaml',
 *   stainlessConfigFile: './stainless.config.yaml',
 *   projectName: 'my-project',
 *   sdkName: 'typescript',
 *   env: 'staging',
 *   guessConfig: false,
 *   lifecycleManager: new LifecycleManager()
 * });
 *
 * // Initialize and start monitoring
 * await tools.init();
 * await tools.watch();
 * ```
 */
export class StainlessTools {
  private repoManager: RepoManager;
  private fileWatcher: FileWatcher;
  private stainlessApi: StainlessApi;
  private lifecycleManager: LifecycleManager;

  /**
   * Creates a new instance of StainlessTools.
   * @param options - Configuration options for StainlessTools
   * @throws {StainlessError} If any of the required parameters are invalid or missing
   */
  constructor(private options: StainlessToolsOptions) {
    this.validateInputs();
    this.stainlessApi = new StainlessApi(options.stainlessApiOptions);
    this.lifecycleManager = new LifecycleManager(options.lifecycle);

    this.repoManager = new RepoManager({
      sdkRepo: options.sdkRepo,
      branch: options.branch,
      targetDir: options.targetDir,
      sdkName: options.sdkName,
      env: options.env,
      lifecycleManager: this.lifecycleManager,
    });

    this.fileWatcher = new FileWatcher({
      openApiFile: options.openApiFile,
      stainlessConfigFile: options.stainlessConfigFile,
      spinner: options.spinner,
      branch: options.branch,
      stainlessApi: this.stainlessApi,
      stainlessApiOptions: {
        projectName: options.stainlessApiOptions?.projectName,
        guessConfig: options.guessConfig,
      },
      lifecycleManager: this.lifecycleManager,
      sdkName: options.sdkName,
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
    if (!this.options.openApiFile) {
      throw new StainlessError("OpenAPI specification file is required");
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
      // Always publish files since openApiFile is required
      await this.fileWatcher.publishFiles();
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
