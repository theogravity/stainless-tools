import type { Ora } from "ora";
import { StainlessError } from "./StainlessError.js";
import { StainlessTools } from "./StainlessTools.js";

/**
 * Configuration options for generating and watching an SDK.
 */
interface GenerateAndWatchSDKOptions {
  /** Name of the SDK to generate */
  sdkName: string;
  /** Repository URL or path of the SDK */
  sdkRepo: string;
  /** Branch to clone and watch for changes */
  branch: string;
  /** Local directory where the SDK will be generated */
  targetDir: string;
  /** Path to OpenAPI specification file (optional) */
  openApiFile?: string;
  /** Path to Stainless configuration file (optional) */
  stainlessConfigFile?: string;
  /** Interval in milliseconds between checking for updates (default: 5000) */
  pollIntervalMs?: number;
  /** Ora spinner instance for displaying progress (optional) */
  spinner?: Ora;
  /** Additional configuration options for Stainless API */
  stainlessApiOptions?: {
    /** API key for authentication */
    apiKey?: string;
    /** Custom API base URL */
    baseUrl?: string;
    /** Name of the Stainless project */
    projectName?: string;
    /** Whether to attempt automatic configuration detection */
    guessConfig?: boolean;
  };
  /** The environment (staging/prod) being used */
  env?: string;
  /** Optional lifecycle hooks for each SDK */
  lifecycle?: {
    [key: string]: {
      postClone?: string;
      postUpdate?: string;
    };
  };
}

/**
 * Generates an SDK and continuously watches for changes in the source repository.
 * This function clones the SDK repository, sets up a polling mechanism to detect changes,
 * and automatically pulls updates when they are available.
 *
 * @param options - Configuration options for SDK generation and watching
 * @returns A cleanup function that stops the polling and performs necessary cleanup
 * @throws {StainlessError} If there are issues with cloning or updating the SDK
 */
export async function generateAndWatchSDK(options: GenerateAndWatchSDKOptions): Promise<() => Promise<void>> {
  // Initialize the SDK tools with provided options
  const sdk = new StainlessTools(options);

  try {
    // Attempt to clone the SDK repository
    await sdk.clone();
  } catch (error) {
    // Rethrow StainlessError directly
    if (error instanceof StainlessError) {
      throw error;
    }
    // Wrap other errors in StainlessError for consistent error handling
    throw new StainlessError("Failed to clone SDK repository", error);
  }

  let isPolling = true;
  let timeoutId: NodeJS.Timeout;

  /**
   * Polls for changes in the SDK repository and updates when necessary.
   * This function runs recursively at the specified interval as long as isPolling is true.
   */
  const pollForChanges = async () => {
    if (!isPolling) return;

    try {
      // Check for new changes in the repository
      if (await sdk.hasNewChanges()) {
        options.spinner?.stop();
        console.log("\nDetected new changes in SDK repository, pulling updates...");
        await sdk.pullChanges();
        console.log("✓ Successfully pulled latest SDK changes.");
        options.spinner?.start("Listening for new SDK updates...");
      }
    } catch (error) {
      // Handle errors during polling
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

    // Schedule next poll using the specified interval or default to 5 seconds
    timeoutId = setTimeout(pollForChanges, options.pollIntervalMs || 5000);
  };

  // Start the initial polling cycle
  pollForChanges();

  /**
   * Returns a cleanup function that:
   * 1. Stops the polling mechanism
   * 2. Clears any pending timeouts
   * 3. Performs necessary SDK cleanup
   */
  return async () => {
    isPolling = false;
    clearTimeout(timeoutId);
    sdk.cleanup();
  };
}
