import { cosmiconfig } from "cosmiconfig";
import { z } from "zod";
import { isValidGitUrl } from "./utils.js";

const gitUrlSchema = z.string().refine(isValidGitUrl, "Invalid git URL");

const repoConfigSchema = z
  .object({
    staging: gitUrlSchema.optional(),
    prod: gitUrlSchema.optional(),
  })
  .refine(
    (data) => data.staging !== undefined || data.prod !== undefined,
    "At least one of staging or prod must be defined",
  );

export const configSchema = z.object({
  // Required fields
  stainlessSdkRepos: z.record(z.string().min(1), repoConfigSchema),

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
  const explorer = cosmiconfig("stainless-tools");
  const result = configPath ? await explorer.load(configPath) : await explorer.search();

  if (!result) {
    throw new Error("No configuration file found");
  }

  return configSchema.parse(result.config);
};
