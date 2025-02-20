import * as fs from "node:fs/promises";
import simpleGit, { type SimpleGit } from "simple-git";
import type { LifecycleManager } from "./LifecycleManager.js";
import { StainlessError } from "./StainlessError.js";
import { getTargetDir } from "./utils.js";

/**
 * Options for configuring a RepoManager instance.
 */
export interface RepoManagerOptions {
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
   * Name of the SDK (e.g., 'typescript', 'python').
   * Optional - only required for lifecycle hooks.
   */
  sdkName?: string;
  /**
   * Current environment (staging/prod).
   * Optional - used for target directory templating.
   */
  env?: string;
  /**
   * Lifecycle manager for executing hooks at various stages.
   */
  lifecycleManager: LifecycleManager;
}

/**
 * Manages SDK repository operations and lifecycle events.
 *
 * The RepoManager is responsible for:
 * - Cloning and initializing SDK repositories
 * - Managing git branches and local changes
 * - Pulling updates from remote repositories
 * - Handling stashed changes during updates
 * - Executing lifecycle hooks at appropriate times
 * - Providing status updates and error handling
 *
 * It ensures that local SDK repositories are properly maintained and
 * synchronized with their remote counterparts while preserving any
 * local changes made by the user.
 *
 * Example usage:
 * ```typescript
 * const manager = new RepoManager({
 *   sdkRepo: 'git@github.com:org/sdk.git',
 *   branch: 'main',
 *   targetDir: './sdks/typescript',
 *   sdkName: 'typescript',
 *   env: 'staging',
 *   lifecycleManager: new LifecycleManager()
 * });
 *
 * await manager.init(); // Clone/setup repository
 * await manager.pull(); // Pull latest changes
 * ```
 */
export class RepoManager {
  private sdkGit: SimpleGit;
  private lastSdkCommitHash: string | null = null;
  private options: RepoManagerOptions;
  private git: SimpleGit;
  private isInitialized = false;

  constructor(options: RepoManagerOptions) {
    this.options = options;
    this.sdkGit = simpleGit();
    this.git = simpleGit();
  }

  /**
   * Gets the actual target directory path, replacing template variables
   */
  getTargetDir(): string {
    return getTargetDir({
      targetDir: this.options.targetDir,
      sdkName: this.options.sdkName,
      env: this.options.env,
      branch: this.options.branch,
    });
  }

  /**
   * Checks if two git repository URLs point to the same repository.
   * Handles both HTTPS and SSH URLs.
   */
  private isSameRepository(url1: string, url2: string): boolean {
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
   * Waits for a branch to be available on the remote repository
   */
  async waitForRemoteBranch(branch: string, delayMs = 5000): Promise<void> {
    while (true) {
      try {
        await this.sdkGit.fetch();
        const branches = await this.sdkGit.branch(["-r"]);
        if (branches.all.includes(`origin/${branch}`)) {
          return;
        }
      } catch {
        // Ignore errors and continue trying
      }

      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }

  /**
   * Checks if there are new changes in the SDK repository.
   */
  async hasNewChanges(): Promise<boolean> {
    try {
      await this.sdkGit.fetch();
      const localHash = await this.getCurrentSdkCommitHash();
      const remoteLog = await this.sdkGit.log([`origin/${this.options.branch}`]);
      const remoteHash = remoteLog.latest?.hash ?? "";

      return localHash !== remoteHash;
    } catch (error) {
      throw new StainlessError("Failed to check for new changes", error);
    }
  }

  /**
   * Initializes or updates the repository
   */
  async initializeRepo(): Promise<void> {
    const resolvedTargetDir = this.getTargetDir();
    let isExistingRepo = false;

    try {
      await fs.access(resolvedTargetDir);
      const tempGit = simpleGit(resolvedTargetDir);
      await tempGit.revparse(["--git-dir"]);
      isExistingRepo = true;
    } catch {
      // Directory doesn't exist or is not a git repo, we'll clone fresh
    }

    if (isExistingRepo) {
      await this.updateExistingRepo(resolvedTargetDir);
    } else {
      await this.cloneFreshRepo(resolvedTargetDir);
    }
  }

  private async updateExistingRepo(resolvedTargetDir: string): Promise<void> {
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

      console.log("\nExisting SDK repository found, checking for updates...");
      await this.sdkGit.fetch();

      await this.handleBranchSwitch();
      await this.pullChanges();
      this.lastSdkCommitHash = await this.getCurrentSdkCommitHash();
    } catch (error) {
      if (error instanceof StainlessError) throw error;
      throw new StainlessError("Failed to update existing repository", error);
    }
  }

  private async cloneFreshRepo(resolvedTargetDir: string): Promise<void> {
    try {
      // Create directory and initialize git
      await fs.mkdir(resolvedTargetDir, { recursive: true });
      await this.sdkGit.cwd(resolvedTargetDir);
      await this.sdkGit.init();
      await this.sdkGit.addRemote("origin", this.options.sdkRepo);

      // Check if the branch exists remotely and wait for it if needed
      await this.sdkGit.fetch();
      const branches = await this.sdkGit.branch(["-r"]);

      const branchExists = branches.all.includes(`origin/${this.options.branch}`);

      if (!branchExists) {
        console.log(`\nWaiting for branch '${this.options.branch}' to be created...`);
        await this.waitForRemoteBranch(this.options.branch);
      }

      // Now that we know the branch exists, clone it
      await this.sdkGit.fetch("origin", this.options.branch);
      await this.sdkGit.checkout(["-b", this.options.branch, `origin/${this.options.branch}`]);
      this.lastSdkCommitHash = await this.getCurrentSdkCommitHash();

      await this.executePostCloneCommand(resolvedTargetDir);
    } catch (error) {
      throw new StainlessError(`Failed to clone SDK repository (${this.options.sdkRepo})`, error);
    }
  }

  private async executePostCloneCommand(resolvedTargetDir: string): Promise<void> {
    if (this.options.sdkName) {
      await this.options.lifecycleManager.executePostClone({
        sdkPath: resolvedTargetDir,
        branch: this.options.branch,
        sdkName: this.options.sdkName,
      });
    }
  }

  private async handleBranchSwitch(): Promise<void> {
    const currentBranch = await this.sdkGit.revparse(["--abbrev-ref", "HEAD"]);

    // If we're already on the right branch, nothing to do
    if (currentBranch === this.options.branch) {
      return;
    }

    // Check if we have local changes that need to be stashed
    const status = await this.sdkGit.status();
    const hasLocalChanges = !status.isClean();
    if (hasLocalChanges) {
      console.log("\nLocal changes detected in SDK repository.");
      console.log("Stashing your local changes before switching branches...");
      await this.sdkGit.stash(["push", "-u", "-m", "Stashing changes before switching branches"]);
    }

    try {
      // Check if the target branch exists remotely
      await this.sdkGit.fetch();
      const branches = await this.sdkGit.branch(["-r"]);
      const branchExists = branches.all.includes(`origin/${this.options.branch}`);

      if (!branchExists) {
        console.log(`\nWaiting for branch '${this.options.branch}' to be created...`);
        await this.waitForRemoteBranch(this.options.branch);
      }

      // Now that we know the branch exists (or have waited for it), switch to it
      await this.sdkGit.checkout(this.options.branch);

      // Restore any stashed changes
      if (hasLocalChanges) {
        await this.restoreStashedChanges();
      }
    } catch (error) {
      // If we had local changes and something went wrong, try to restore them
      if (hasLocalChanges && !(error instanceof StainlessError)) {
        await this.handleFailedBranchSwitch();
      }
      throw error;
    }
  }

  private async restoreStashedChanges(): Promise<void> {
    console.log("\nReapplying your local changes...");
    try {
      await this.sdkGit.stash(["pop"]);
      console.log("\n✓ Successfully reapplied your local changes.");
    } catch (stashError) {
      const stashList = await this.sdkGit.stash(["list"]);
      const stashRef = stashList.split("\n")[0]?.match(/stash@\{0\}/)?.[0];

      if (stashRef) {
        try {
          await this.sdkGit.stash(["apply", stashRef]);
          console.log("\n✓ Successfully reapplied your local changes (with potential conflicts).");
          console.log("\n⚠️  There were conflicts while reapplying your changes.");
          console.log("Your changes are preserved in the stash. To resolve:");
          console.log("1. Resolve any conflicts in your working directory");
          console.log("2. Run: git stash drop");
          process.exit(1);
        } catch {
          console.log("\n⚠️  Could not reapply your local changes due to conflicts.");
          console.log("Your changes are preserved in the stash. To resolve:");
          console.log("1. Run: git stash pop");
          console.log("2. Resolve the conflicts manually");
          console.log("3. Commit your changes");
          process.exit(1);
        }
      } else {
        throw new StainlessError("Failed to reapply local changes and could not find stash reference", stashError);
      }
    }
  }

  private async handleFailedBranchSwitch(): Promise<void> {
    try {
      console.log("\nOperation failed, attempting to restore your local changes...");
      await this.sdkGit.stash(["pop"]);
      console.log("✓ Successfully restored your local changes.");
      console.log("\n⚠️  Could not switch to branch due to an error.");
      console.log("To switch manually:");
      console.log("1. Stash your changes: git stash");
      console.log(`2. Switch branch: git checkout ${this.options.branch}`);
      console.log("3. Reapply your changes: git stash pop");
      console.log("4. Resolve any conflicts");
      process.exit(1);
    } catch (stashError) {
      throw new StainlessError("Failed to restore local changes after operation failed", stashError);
    }
  }

  /**
   * Pulls changes from the SDK repository.
   */
  async pullChanges(): Promise<void> {
    try {
      const status = await this.sdkGit.status();
      const hasLocalChanges = !status.isClean();
      const oldHash = await this.getCurrentSdkCommitHash();

      if (hasLocalChanges) {
        console.log("\nLocal changes detected in SDK repository.");
        console.log("Stashing your local changes before pulling updates...");
        await this.sdkGit.stash(["push", "-u", "-m", "Stashing changes before SDK update"]);
      }

      try {
        await this.sdkGit.pull("origin", this.options.branch);
        const newHash = await this.getCurrentSdkCommitHash();
        console.log(`\nUpdated from ${oldHash.substring(0, 7)} to ${newHash.substring(0, 7)}`);
        this.lastSdkCommitHash = newHash;

        if (hasLocalChanges) {
          await this.restoreStashedChanges();
        }

        await this.executePostUpdateCommand();
      } catch (error) {
        if (hasLocalChanges && !(error instanceof StainlessError)) {
          await this.handleFailedPull();
        }
        throw error;
      }
    } catch (error) {
      if (error instanceof StainlessError) throw error;
      throw new StainlessError("Failed to pull changes", error);
    }
  }

  private async executePostUpdateCommand(): Promise<void> {
    if (this.options.sdkName) {
      await this.options.lifecycleManager.executePostUpdate({
        sdkPath: this.getTargetDir(),
        branch: this.options.branch,
        sdkName: this.options.sdkName,
      });
    }
  }

  private async handleFailedPull(): Promise<void> {
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
}
