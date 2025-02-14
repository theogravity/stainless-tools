import type { Ora } from "ora";
import { StainlessError } from "./StainlessError.js";
import { StainlessTools } from "./StainlessTools.js";

interface GenerateAndWatchSDKOptions {
  sdkName: string;
  sdkRepo: string;
  branch: string;
  targetDir: string;
  openApiFile?: string;
  stainlessConfigFile?: string;
  pollIntervalMs?: number;
  spinner?: Ora;
  stainlessApiOptions?: {
    apiKey?: string;
    baseUrl?: string;
    projectName?: string;
    guessConfig?: boolean;
  };
}

export async function generateAndWatchSDK(options: GenerateAndWatchSDKOptions): Promise<() => Promise<void>> {
  const sdk = new StainlessTools(options);

  try {
    await sdk.clone();
  } catch (error) {
    // Rethrow StainlessError directly
    if (error instanceof StainlessError) {
      throw error;
    }
    // Wrap other errors
    throw new StainlessError("Failed to clone SDK repository", error);
  }

  let isPolling = true;
  let timeoutId: NodeJS.Timeout;

  // Start polling for changes
  const pollForChanges = async () => {
    if (!isPolling) return;

    try {
      if (await sdk.hasNewChanges()) {
        options.spinner?.stop();
        console.log("\nDetected new changes in SDK repository, pulling updates...");
        await sdk.pullChanges();
        console.log("✓ Successfully pulled latest SDK changes.");
        options.spinner?.start("Listening for new SDK updates...");
      }
    } catch (error) {
      options.spinner?.stop();
      if (error instanceof StainlessError) {
        console.error(`Error: ${error.message}`);
        if (error.cause) {
          console.error("Caused by:", error.cause);
        }
      } else {
        console.error("An unexpected error occurred:", error);
      }
      options.spinner?.start("Listening for new SDK updates...");
    }

    // Schedule next poll
    timeoutId = setTimeout(pollForChanges, options.pollIntervalMs || 5000);
  };

  // Start initial poll
  pollForChanges();

  // Return cleanup function
  return async () => {
    isPolling = false;
    clearTimeout(timeoutId);
    sdk.cleanup();
  };
}
