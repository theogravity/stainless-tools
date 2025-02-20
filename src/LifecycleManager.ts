import chalk from "chalk";
import { execa } from "execa";
import { StainlessError } from "./StainlessError.js";

/**
 * Configuration for lifecycle hooks that can be executed at various stages
 * of the SDK management process.
 */
export interface LifecycleConfig {
  [key: string]: {
    /**
     * Command to execute after cloning the SDK repository.
     * Useful for initial setup like installing dependencies.
     */
    postClone?: string;
    /**
     * Command to execute after pulling updates from the SDK repository.
     * Useful for rebuilding or updating dependencies.
     */
    postUpdate?: string;
    /**
     * Command to execute before publishing OpenAPI specs to Stainless.
     * Useful for validation and transformation of specs.
     */
    prePublishSpec?: string;
  };
}

/**
 * Context information provided to lifecycle hooks when they are executed.
 */
export interface LifecycleContext {
  /**
   * Absolute path to the SDK repository directory.
   */
  sdkPath: string;
  /**
   * Current git branch name.
   */
  branch: string;
  /**
   * Name of the SDK (e.g., 'typescript', 'python').
   */
  sdkName: string;
}

/**
 * Manages the execution of lifecycle hooks for SDK repositories.
 *
 * The LifecycleManager is responsible for executing commands at specific points
 * in the SDK management process, such as after cloning, after updates, or before
 * publishing specs. It provides:
 *
 * - Real-time command output streaming
 * - Environment variable injection for hooks
 * - Error handling and reporting
 * - Interactive input support
 *
 * Each hook runs in the context of the SDK repository and has access to
 * environment variables containing information about the SDK path, branch,
 * and name.
 */
export class LifecycleManager {
  constructor(private config: LifecycleConfig = {}) {}

  /**
   * Executes a lifecycle command with real-time output streaming and interactive input support
   */
  private async executeCommand(
    command: string,
    context: LifecycleContext,
    type: "postClone" | "postUpdate" | "prePublishSpec",
  ): Promise<void> {
    try {
      console.log(chalk.magenta(`\n🚀 Executing ${type} command: ${chalk.yellow(command)}`));
      const subprocess = execa(command, {
        shell: true,
        env: {
          FORCE_COLOR: "true",
          STAINLESS_TOOLS_SDK_PATH: context.sdkPath,
          STAINLESS_TOOLS_SDK_BRANCH: context.branch,
          STAINLESS_TOOLS_SDK_REPO_NAME: context.sdkName,
        },
        stdio: ["inherit", "pipe", "pipe"],
      });

      // Stream output in real-time
      if (subprocess.stdout) {
        subprocess.stdout.on("data", (data) => {
          process.stdout.write(data);
        });
      }
      if (subprocess.stderr) {
        subprocess.stderr.on("data", (data) => {
          process.stderr.write(data);
        });
      }

      const { exitCode } = await subprocess;
      if (exitCode === 0) {
        console.log(chalk.green(`\n✓ Successfully executed ${type} command`));
      } else {
        throw new Error(chalk.red(`Command ${type} exited with code ${exitCode}`));
      }
    } catch (error) {
      throw new StainlessError(`Failed to execute ${type} command: ${command}`, error);
    }
  }

  /**
   * Executes the postClone lifecycle hook for a given SDK
   */
  async executePostClone(context: LifecycleContext): Promise<void> {
    const command = this.config[context.sdkName]?.postClone;
    if (command) {
      await this.executeCommand(command, context, "postClone");
    }
  }

  /**
   * Executes the postUpdate lifecycle hook for a given SDK
   */
  async executePostUpdate(context: LifecycleContext): Promise<void> {
    const command = this.config[context.sdkName]?.postUpdate;
    if (command) {
      await this.executeCommand(command, context, "postUpdate");
    }
  }

  /**
   * Executes the prePublishSpec lifecycle hook for a given SDK
   */
  async executePrePublishSpec(context: LifecycleContext): Promise<void> {
    const command = this.config[context.sdkName]?.prePublishSpec;
    if (command) {
      await this.executeCommand(command, context, "prePublishSpec");
    }
  }
}
