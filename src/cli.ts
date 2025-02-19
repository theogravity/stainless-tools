#!/usr/bin/env node

/**
 * CLI tool for Stainless SDK generation and management
 * This module provides command-line interface functionality for generating and watching SDKs
 * using the Stainless platform.
 */

import { config } from "@dotenvx/dotenvx";
import { Command } from "commander";
import { createGenerateCommand } from "./cli/commands/generate.js";

config({
  quiet: true,
  path: [".env", ".env.override"],
  ignore: ["MISSING_ENV_FILE"],
});

// Initialize the command-line program
export const program = new Command();

// Set up basic program information
program
  .name("stainless-tools")
  .description("Stainless SDK tools for generating and managing SDKs")
  .version(process.env.npm_package_version || "0.0.0");

// Add the generate command
program.addCommand(createGenerateCommand());

// Only parse arguments when running as the main module
if (require.main === module) {
  program.parse();
}
