import * as fs from "node:fs/promises";
import { watch } from "chokidar";
import type { FSWatcher } from "chokidar";
import type { Ora } from "ora";
import simpleGit, { type SimpleGit } from "simple-git";
import { StainlessApi } from "./StainlessApi.js";
import { StainlessError } from "./StainlessError.js";
import { isValidGitUrl } from "./utils.js";

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
}

/**
 * StainlessTools manages SDK repositories for the Stainless SDK service.
 * It handles cloning, updating, and synchronizing repositories, as well as managing OpenAPI
 * and configuration files.
 */
export class StainlessTools {
  private sdkGit: SimpleGit;
  private lastSdkCommitHash: string | null = null;
  private watcher: FSWatcher | null = null;
  private stainlessApi: StainlessApi;
  private stainlessApiOptions?: { apiKey?: string; baseUrl?: string; projectName?: string };

  /**
   * Creates a new instance of StainlessTools.
   * @param options - Configuration options for StainlessTools
   * @throws {StainlessError} If any of the required parameters are invalid or missing
   */
  constructor(private options: StainlessToolsOptions) {
    this.validateInputs();
    this.sdkGit = simpleGit();
    this.stainlessApiOptions = options.stainlessApiOptions;
    this.stainlessApi = new StainlessApi(options.stainlessApiOptions);
  }

  /**
   * Gets the actual target directory path, replacing {sdk} with the SDK name if provided.
   * @private
   * @returns The resolved target directory path
   */
  private getTargetDir(): string {
    if (this.options.sdkName) {
      return this.options.targetDir.replace("{sdk}", this.options.sdkName);
    }
    return this.options.targetDir;
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
   * Starts watching for changes in the OpenAPI and config files.
   * When changes are detected, the files are published to the Stainless API.
   * @private
   */
  private startFileWatcher(): void {
    if (!this.options.openApiFile && !this.options.stainlessConfigFile) {
      return;
    }

    const watchPaths: string[] = [];
    if (this.options.openApiFile) {
      watchPaths.push(this.options.openApiFile);
    }
    if (this.options.stainlessConfigFile) {
      watchPaths.push(this.options.stainlessConfigFile);
    }

    this.watcher = watch(watchPaths, {
      ignoreInitial: true,
      awaitWriteFinish: {
        stabilityThreshold: 2000,
        pollInterval: 100,
      },
    });

    this.watcher.on("change", async (filePath) => {
      try {
        this.options.spinner?.stop();
        console.log(`\nDetected changes in ${filePath}, publishing to Stainless API...`);

        await this.publishFiles();

        console.log(
          "\n✓ Successfully published changes to Stainless API. Please wait up to a minute for new SDK updates.",
        );
        this.options.spinner?.start("Listening for new SDK updates...");
      } catch (error) {
        console.error("Failed to publish changes:", error);
      }
    });
  }

  /**
   * Stops watching for file changes.
   * @private
   */
  private stopFileWatcher(): void {
    if (this.watcher) {
      this.watcher.close();
      this.watcher = null;
    }
  }

  /**
   * Publishes the OpenAPI and config files to the Stainless API.
   * @private
   */
  private async publishFiles(): Promise<void> {
    try {
      if (!this.options.openApiFile) {
        throw new StainlessError("OpenAPI specification file is required");
      }

      let spec: Buffer;
      let config: Buffer | undefined;

      try {
        spec = await fs.readFile(this.options.openApiFile);
      } catch (error) {
        throw new StainlessError(`Failed to read OpenAPI file (${this.options.openApiFile})`, error);
      }

      if (this.options.stainlessConfigFile) {
        try {
          config = await fs.readFile(this.options.stainlessConfigFile);
        } catch (error) {
          throw new StainlessError(`Failed to read Stainless config file (${this.options.stainlessConfigFile})`, error);
        }
      }

      try {
        await this.stainlessApi.publish({
          spec,
          config,
          branch: this.options.branch,
          projectName: this.options.stainlessApiOptions?.projectName,
          guessConfig: this.options.stainlessApiOptions?.guessConfig,
        });

        this.options.spinner?.start("Listening for new SDK updates...");
      } catch (error) {
        const files = [
          `OpenAPI (${this.options.openApiFile})`,
          this.options.stainlessConfigFile && `Stainless config (${this.options.stainlessConfigFile})`,
        ]
          .filter(Boolean)
          .join(" and ");

        // If the error is already a StainlessError, preserve its message and cause
        if (error instanceof StainlessError) {
          throw error;
        }

        // For other errors, wrap them with more context
        throw new StainlessError(`Failed to publish ${files} to Stainless API`, error);
      }
    } catch (error) {
      if (error instanceof StainlessError) {
        throw error;
      }
      throw new StainlessError("Failed to publish files to Stainless API", error);
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

      const resolvedTargetDir = this.getTargetDir();
      let isExistingRepo = false;

      try {
        // Check if directory exists and is a git repository
        await fs.access(resolvedTargetDir);
        const tempGit = simpleGit(resolvedTargetDir);
        await tempGit.revparse(["--git-dir"]);
        isExistingRepo = true;
      } catch {
        // Directory doesn't exist or is not a git repo, we'll clone fresh
      }

      if (isExistingRepo) {
        // Directory exists and is a git repo, try to update it
        try {
          await this.sdkGit.cwd(resolvedTargetDir);

          // Verify it's the correct repository
          const remotes = await this.sdkGit.getRemotes(true);
          const originUrl = remotes?.[0]?.refs?.fetch;
          if (!originUrl || !this.isSameRepository(originUrl, this.options.sdkRepo)) {
            throw new StainlessError(
              `Directory ${resolvedTargetDir} contains a different repository (${originUrl || "unknown"}). ` +
                `Expected ${this.options.sdkRepo}. Please remove the directory manually and try again.`,
            );
          }
          // Same repository, try to update it
          console.log("\nExisting SDK repository found, checking for updates...");
          await this.sdkGit.fetch();
          await this.sdkGit.checkout(this.options.branch);
          await this.pullChanges();
          this.lastSdkCommitHash = await this.getCurrentSdkCommitHash();
        } catch (error) {
          if (error instanceof StainlessError) throw error;
          throw new StainlessError("Failed to update existing repository", error);
        }
      } else {
        // Fresh clone needed
        try {
          await fs.mkdir(resolvedTargetDir, { recursive: true });
          await this.sdkGit.clone(this.options.sdkRepo, resolvedTargetDir);
          await this.sdkGit.cwd(resolvedTargetDir);
          await this.sdkGit.checkout(this.options.branch);
          this.lastSdkCommitHash = await this.getCurrentSdkCommitHash();
        } catch (error) {
          throw new StainlessError(`Failed to clone SDK repository (${this.options.sdkRepo})`, error);
        }
      }

      // Publish files if provided
      if (this.options.openApiFile || this.options.stainlessConfigFile) {
        await this.publishFiles();
      }

      // Start watching for file changes after successful clone
      this.startFileWatcher();
    } catch (error) {
      if (error instanceof StainlessError) throw error;
      throw new StainlessError("Failed to clone or update SDK repository", error);
    }
  }

  /**
   * Checks if two git repository URLs point to the same repository.
   * Handles both HTTPS and SSH URLs.
   * @private
   */
  private isSameRepository(url1: string, url2: string): boolean {
    // Extract org/repo-name from Git URLs, ignoring protocol, domain, and .git suffix
    const getRepoPath = (url: string): string => {
      const match = url.match(/(?:^|\/|:)([\w-]+\/[\w-]+)(?:\.git)?$/);
      return match?.[1] || "";
    };

    const repo1 = getRepoPath(url1);
    const repo2 = getRepoPath(url2);
    return repo1 !== "" && repo2 !== "" && repo1 === repo2;
  }

  /**
   * Gets the current commit hash of the SDK repository.
   * @private
   * @returns The latest commit hash
   * @throws {StainlessError} If Git commands fail
   */
  private async getCurrentSdkCommitHash(): Promise<string> {
    try {
      const log = await this.sdkGit.log();
      return log.latest?.hash ?? "";
    } catch (error) {
      throw new StainlessError("Failed to get SDK commit hash", error);
    }
  }

  /**
   * Checks if there are new changes in the SDK repository.
   * @returns True if there are new changes, false otherwise
   * @throws {StainlessError} If Git commands fail
   */
  async hasNewChanges(): Promise<boolean> {
    try {
      await this.sdkGit.fetch();
      // Get the current branch's HEAD
      const localHash = await this.getCurrentSdkCommitHash();
      // Get the remote branch's HEAD
      const remoteLog = await this.sdkGit.log([`origin/${this.options.branch}`]);
      const remoteHash = remoteLog.latest?.hash ?? "";

      return localHash !== remoteHash;
    } catch (error) {
      throw new StainlessError("Failed to check for new changes", error);
    }
  }

  /**
   * Pulls changes from the SDK repository.
   * If there are local changes, they will be stashed before pulling and restored after.
   * @throws {StainlessError} If Git commands fail
   */
  async pullChanges(): Promise<void> {
    try {
      // Check for local changes
      const status = await this.sdkGit.status();
      const hasLocalChanges = !status.isClean();

      if (hasLocalChanges) {
        console.log("\nLocal changes detected in SDK repository.");
        console.log("Stashing your local changes before pulling updates...");
        await this.sdkGit.stash(["push", "-u", "-m", "Stashing changes before SDK update"]);
      }

      try {
        await this.sdkGit.pull("origin", this.options.branch);
        this.lastSdkCommitHash = await this.getCurrentSdkCommitHash();

        if (hasLocalChanges) {
          console.log("\nReapplying your local changes...");
          try {
            await this.sdkGit.stash(["pop"]);
            console.log("✓ Successfully reapplied your local changes.");
          } catch (stashError) {
            // If stash pop fails, try to get the stash reference
            const stashList = await this.sdkGit.stash(["list"]);
            const stashRef = stashList.split("\n")[0]?.match(/stash@\{0\}/)?.[0];

            if (stashRef) {
              // Try to apply the stash without dropping it
              try {
                await this.sdkGit.stash(["apply", stashRef]);
                console.log("✓ Successfully reapplied your local changes (with potential conflicts).");
                console.log("\n⚠️  There were conflicts while reapplying your changes.");
                console.log("Your changes are preserved in the stash. To resolve:");
                console.log("1. Resolve any conflicts in your working directory");
                console.log("2. Run: git stash drop");
                process.exit(1);
              } catch (applyError) {
                // If apply also fails, restore to the previous commit
                console.log("\n⚠️  Could not reapply your local changes due to conflicts.");
                console.log("Your changes are preserved in the stash. To resolve:");
                console.log("1. Run: git stash pop");
                console.log("2. Resolve the conflicts manually");
                console.log("3. Commit your changes");
                process.exit(1);
              }
            } else {
              throw new StainlessError(
                "Failed to reapply local changes and could not find stash reference",
                stashError,
              );
            }
          }
        }
      } catch (error) {
        // If pull fails and we stashed changes, try to restore them
        if (hasLocalChanges) {
          try {
            console.log("\nPull failed, attempting to restore your local changes...");
            await this.sdkGit.stash(["pop"]);
            console.log("✓ Successfully restored your local changes.");
            console.log("\n⚠️  Could not update to the latest SDK version due to conflicts.");
            console.log("To update manually:");
            console.log("1. Stash your changes: git stash");
            console.log("2. Pull latest changes: git pull");
            console.log("3. Reapply your changes: git stash pop");
            console.log("4. Resolve any conflicts");
            process.exit(1);
          } catch (stashError) {
            throw new StainlessError("Failed to restore local changes after pull failed", stashError);
          }
        }
        throw error;
      }
    } catch (error) {
      throw new StainlessError("Failed to pull changes", error);
    }
  }

  /**
   * Cleans up resources used by the tools.
   */
  cleanup(): void {
    this.stopFileWatcher();
  }
}
