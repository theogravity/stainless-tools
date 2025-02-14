import { config } from "@dotenvx/dotenvx";
import { cosmiconfig } from "cosmiconfig";
import { isValidGitUrl } from "./utils.js";
import { z } from "zod";

config({
  quiet: true,
  path: [".env", ".env.override"],
});

const gitUrlSchema = z.string().refine(isValidGitUrl, "Invalid git URL");

export const configSchema = z.object({
  // Required fields
  stainlessSdkRepos: z.record(z.string().min(1), gitUrlSchema),

  // Optional default configurations
  defaults: z
    .object({
      stainlessConfigFile: z.string().optional(),
      openApiFile: z.string().optional(),
      branch: z.string().optional(),
      targetDir: z.string().optional(),
      projectName: z.string().optional(),
      guessConfig: z.boolean().optional(),
    })
    .optional(),
});

export type StainlessConfig = z.infer<typeof configSchema>;

export const loadConfig = async (configPath?: string) => {
  const explorer = cosmiconfig("stainless");
  const result = configPath ? await explorer.load(configPath) : await explorer.search();

  if (!result) {
    throw new Error("No configuration file found");
  }

  return configSchema.parse(result.config);
};
