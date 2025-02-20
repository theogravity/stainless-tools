import { execa } from "execa";
import { StainlessError } from "./StainlessError.js";

export interface LifecycleConfig {
  [key: string]: {
    postClone?: string;
    postUpdate?: string;
  };
}

export interface LifecycleContext {
  sdkPath: string;
  branch: string;
  sdkName: string;
}

export class LifecycleManager {
  constructor(private config: LifecycleConfig = {}) {}

  /**
   * Executes a lifecycle command with real-time output streaming and interactive input support
   */
  private async executeCommand(command: string, context: LifecycleContext, type: 'postClone' | 'postUpdate'): Promise<void> {
    try {
      console.log(`\nExecuting ${type} command: ${command}`);
      const subprocess = execa(command, {
        shell: true,
        env: {
          STAINLESS_TOOLS_SDK_PATH: context.sdkPath,
          STAINLESS_TOOLS_SDK_BRANCH: context.branch,
          STAINLESS_TOOLS_SDK_REPO_NAME: context.sdkName,
        },
        stdio: ['inherit', 'pipe', 'pipe']
      });

      // Stream output in real-time
      if (subprocess.stdout) {
        subprocess.stdout.on('data', (data) => {
          process.stdout.write(data);
        });
      }
      if (subprocess.stderr) {
        subprocess.stderr.on('data', (data) => {
          process.stderr.write(data);
        });
      }

      const { exitCode } = await subprocess;
      if (exitCode === 0) {
        console.log(`✓ Successfully executed ${type} command`);
      } else {
        throw new Error(`Command exited with code ${exitCode}`);
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
      await this.executeCommand(command, context, 'postClone');
    }
  }

  /**
   * Executes the postUpdate lifecycle hook for a given SDK
   */
  async executePostUpdate(context: LifecycleContext): Promise<void> {
    const command = this.config[context.sdkName]?.postUpdate;
    if (command) {
      await this.executeCommand(command, context, 'postUpdate');
    }
  }
} 