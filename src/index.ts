import { config } from "@dotenvx/dotenvx";

config({
  quiet: true,
  path: [".env", ".env.override"],
  ignore: ["MISSING_ENV_FILE"],
});

export { generateAndWatchSDK } from "./lib.js";
export { loadConfig } from "./config.js";
export type { StainlessConfig } from "./config.js";
export * from "./StainlessTools.js";
export * from "./StainlessError.js";
