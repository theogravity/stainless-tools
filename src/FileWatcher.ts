import * as fs from "node:fs/promises";
import { watch } from "chokidar";
import type { FSWatcher } from "chokidar";
import type { Ora } from "ora";
import type { LifecycleManager } from "./LifecycleManager.js";
import type { StainlessApi } from "./StainlessApi.js";
import { StainlessError } from "./StainlessError.js";

interface FileWatcherOptions {
  openApiFile?: string;
  stainlessConfigFile?: string;
  spinner?: Ora;
  branch: string;
  stainlessApi: StainlessApi;
  stainlessApiOptions?: {
    projectName?: string;
    guessConfig?: boolean;
  };
  lifecycleManager?: LifecycleManager;
  sdkName?: string;
}

export class FileWatcher {
  private watcher: FSWatcher | undefined;
  private publishTimeout: NodeJS.Timeout | undefined;
  private isPublishing = false;
  private isWatching = false;

  constructor(private options: FileWatcherOptions) {}

  /**
   * Starts watching for changes in the OpenAPI and config files.
   * When changes are detected, the files are published to the Stainless API.
   */
  start(): void {
    if (!this.options.openApiFile && !this.options.stainlessConfigFile) {
      return;
    }

    // Prevent multiple start calls
    if (this.isWatching) {
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
        stabilityThreshold: 5000,
        pollInterval: 100,
      },
    });

    this.isWatching = true;

    this.watcher.on("change", async (filePath) => {
      try {
        // Clear any existing timeout
        if (this.publishTimeout) {
          clearTimeout(this.publishTimeout);
          this.publishTimeout = undefined;
        }

        // If already publishing, don't schedule another publish
        if (this.isPublishing) {
          return;
        }

        this.publishTimeout = setTimeout(async () => {
          try {
            if (this.isPublishing) {
              // Clear the timeout if we're already publishing
              if (this.publishTimeout) {
                clearTimeout(this.publishTimeout);
                this.publishTimeout = undefined;
              }
              return;
            }

            this.isPublishing = true;
            this.options.spinner?.stop();
            console.log(`\nDetected changes in ${filePath}, publishing to Stainless API...`);

            try {
              await this.publishFiles();
              console.log(
                "\n✓ Successfully published changes to Stainless API. Please wait up to a minute for new SDK updates.",
              );
            } finally {
              this.isPublishing = false;
              this.options.spinner?.start("Listening for new SDK updates...");
            }
          } catch (error) {
            console.error("Failed to publish changes:", error);
            this.isPublishing = false;
            this.options.spinner?.start("Listening for new SDK updates...");
          }
        }, 1000);
      } catch (error) {
        console.error("Failed to handle file change:", error);
        this.isPublishing = false;
        this.options.spinner?.start("Listening for new SDK updates...");
      }
    });
  }

  /**
   * Stops watching for file changes.
   */
  stop(): void {
    if (this.publishTimeout) {
      clearTimeout(this.publishTimeout);
      this.publishTimeout = undefined;
    }
    if (this.watcher) {
      this.watcher.close();
      this.watcher = undefined;
    }
    this.isWatching = false;
  }

  /**
   * Publishes the OpenAPI and config files to the Stainless API.
   */
  async publishFiles(): Promise<void> {
    try {
      if (!this.options.openApiFile) {
        throw new StainlessError("OpenAPI specification file is required");
      }

      if (this.options.lifecycleManager && this.options.sdkName) {
        await this.options.lifecycleManager.executePrePublishSpec({
          sdkPath: process.cwd(),
          branch: this.options.branch,
          sdkName: this.options.sdkName,
        });
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
        await this.options.stainlessApi.publish({
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

        if (error instanceof StainlessError) {
          throw error;
        }

        throw new StainlessError(`Failed to publish ${files} to Stainless API`, error);
      }
    } catch (error) {
      if (error instanceof StainlessError) {
        throw error;
      }
      throw new StainlessError("Failed to publish files to Stainless API", error);
    }
  }
}
