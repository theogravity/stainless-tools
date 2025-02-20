import chalk from "chalk";
import { StainlessError } from "./StainlessError.js";

/**
 * Interface defining the configuration options for the StainlessApi client
 */
interface StainlessApiOptions {
  /** Optional API key for authentication. Can be provided here or via STAINLESS_API_KEY environment variable */
  apiKey?: string;
  /** Optional base URL for the API. Defaults to https://api.stainlessapi.com */
  baseUrl?: string;
  /** Optional project name to associate with API calls */
  projectName?: string;
  /** Optional flag to enable automatic configuration guessing */
  guessConfig?: boolean;
}

/**
 * Interface defining the options for publishing OpenAPI specifications
 */
interface PublishOptions {
  /** OpenAPI specification content as a string or Buffer */
  spec: string | Buffer;
  /** Optional Stainless configuration content as a string or Buffer */
  config?: string | Buffer;
  /** Optional branch name to associate with the publication */
  branch?: string;
  /** Optional project name to associate with the publication */
  projectName?: string;
  /** Optional flag to enable automatic configuration guessing */
  guessConfig?: boolean;
}

/**
 * Client for interacting with the Stainless API.
 *
 * The StainlessApi class provides methods for:
 * - Publishing OpenAPI specifications
 * - Publishing Stainless configuration files
 * - Managing SDK generation settings
 * - Handling API authentication
 * - Error handling and retries
 *
 * It requires a Stainless API key for authentication, which can be
 * provided via environment variable STAINLESS_API_KEY.
 *
 * Example usage:
 * ```typescript
 * const api = new StainlessApi();
 *
 * await api.publishSpecs({
 *   openApiFile: './openapi.yaml',
 *   stainlessConfigFile: './stainless.config.yaml',
 *   projectName: 'my-project',
 *   branch: 'main'
 * });
 * ```
 */
export class StainlessApi {
  private apiKey: string;
  private baseUrl: string;

  /**
   * Creates a new instance of the StainlessApi client
   * @param options - Configuration options for the API client
   * @throws {StainlessError} If no API key is provided via options or environment variable
   */
  constructor(options: StainlessApiOptions = {}) {
    this.apiKey = options.apiKey || process.env.STAINLESS_API_KEY || "";
    this.baseUrl = options.baseUrl || "https://api.stainlessapi.com";

    if (!this.apiKey) {
      throw new StainlessError(
        "Stainless API key is required. Set STAINLESS_API_KEY environment variable or pass it in options.",
      );
    }
  }

  /**
   * Publishes an OpenAPI specification and optional Stainless configuration to the API.
   * This method handles the upload of specification files and associated metadata to the Stainless platform.
   *
   * @param options - Options for publishing
   * @param options.spec - OpenAPI specification content as a string or Buffer
   * @param options.config - Optional Stainless configuration content as a string or Buffer
   * @param options.branch - Optional branch name to associate with the publication
   * @param options.projectName - Optional project name to associate with the publication
   * @param options.guessConfig - Optional flag to enable automatic configuration guessing
   * @returns Promise that resolves when the upload is complete
   * @throws {StainlessError} If the spec is missing or if there's an error during upload
   */
  async publish(options: PublishOptions): Promise<void> {
    try {
      if (!options.spec) {
        throw new StainlessError("OpenAPI specification is required");
      }

      const formData = new FormData();

      // Add spec file
      formData.append(
        "oasSpec",
        new Blob([typeof options.spec === "string" ? options.spec : options.spec.toString("utf-8")], {
          type: "text/plain",
        }),
      );

      // Add optional config file
      if (options.config) {
        formData.append(
          "stainlessConfig",
          new Blob([typeof options.config === "string" ? options.config : options.config.toString("utf-8")], {
            type: "text/plain",
          }),
        );
      }

      // Add optional parameters
      if (options.projectName) {
        formData.append("projectName", options.projectName);
      }
      if (options.branch) {
        formData.append("branch", options.branch);
      }
      if (options.guessConfig) {
        formData.append("guessConfig", "true");
      }

      console.info(chalk.blue("\n🚀 Publishing specifications to Stainless..."));

      const response = await fetch(`${this.baseUrl}/api/spec`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
        },
        body: formData,
      });

      if (!response.ok) {
        const responseText = await response.text();
        let errorInfo: any;
        try {
          errorInfo = JSON.parse(responseText);
        } catch {
          errorInfo = { message: responseText || "Unknown error" };
        }

        const details = errorInfo.details ? `\nDetails: ${errorInfo.details}` : "";
        const errorMessage = `API Error (HTTP ${response.status}): ${errorInfo.message}${details}\nResponse: ${responseText}`;
        throw new StainlessError(errorMessage);
      }

      console.info(
        chalk.green(
          "\n✓ Successfully published specifications to Stainless. This will not generate a new SDK if there are no actual changes.",
        ),
      );
    } catch (err: unknown) {
      if (err instanceof StainlessError) {
        throw err;
      }
      // For non-Error objects (shouldn't happen, but just in case)
      throw new StainlessError(`Failed to publish to Stainless API: ${String(err)}`);
    }
  }
}
