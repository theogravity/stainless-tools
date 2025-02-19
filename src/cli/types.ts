/**
 * Interface defining the options available for SDK commands
 */
export interface SdkCommandOptions {
  branch?: string; // Git branch to use
  targetDir?: string; // Directory where the SDK will be generated
  "open-api-file"?: string; // Path to OpenAPI specification file
  config?: string; // Path to configuration file
  "stainless-config-file"?: string; // Path to Stainless-specific configuration
  projectName?: string; // Name of the project in Stainless
  "guess-config"?: boolean; // Whether to use AI to guess configuration
  prod?: boolean; // Whether to use production URLs
}
