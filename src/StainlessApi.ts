import { StainlessError } from "./StainlessError.js";

interface StainlessApiOptions {
  apiKey?: string;
  baseUrl?: string;
  projectName?: string;
  guessConfig?: boolean;
}

interface PublishOptions {
  spec: string | Buffer;
  config?: string | Buffer;
  branch?: string;
  projectName?: string;
  guessConfig?: boolean;
}

export class StainlessApi {
  private apiKey: string;
  private baseUrl: string;

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
   * Publishes OpenAPI specification and optional Stainless configuration to the API
   * @param options - Options for publishing
   * @param options.spec - Optional OpenAPI specification content
   * @param options.config - Optional Stainless configuration content
   * @param options.branch - Optional branch name
   * @param options.projectName - Optional project name
   * @param options.guessConfig - Optional flag to guess config
   * @returns Promise that resolves when the upload is complete
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
    } catch (err: unknown) {
      if (err instanceof StainlessError) {
        throw err;
      }
      // For non-Error objects (shouldn't happen, but just in case)
      throw new StainlessError(`Failed to publish to Stainless API: ${String(err)}`);
    }
  }
}
