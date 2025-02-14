import { cosmiconfig } from "cosmiconfig";
import mock from "mock-fs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { configSchema, loadConfig } from "../config";

vi.mock("cosmiconfig");

describe("Configuration", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  afterEach(() => {
    mock.restore();
  });

  describe("configSchema", () => {
    it("validates correct config with defaults", () => {
      const validConfig = {
        stainlessSdkRepos: {
          typescript: {
            staging: "git@github.com:org/typescript-sdk-staging.git",
            prod: "git@github.com:org/typescript-sdk.git",
          },
          python: {
            staging: "https://github.com/org/python-sdk-staging.git",
            prod: "https://github.com/org/python-sdk.git",
          },
        },
        defaults: {
          branch: "main",
          targetDir: "./sdks/{sdk}",
          openApiFile: "./specs/openapi.json",
          stainlessConfigFile: "./stainless-tools.config.json",
        },
      };

      const result = configSchema.safeParse(validConfig);
      expect(result.success).toBe(true);
    });

    it("validates correct config without defaults", () => {
      const validConfig = {
        stainlessSdkRepos: {
          typescript: {
            staging: "git@github.com:org/typescript-sdk-staging.git",
            prod: "git@github.com:org/typescript-sdk.git",
          },
        },
      };

      const result = configSchema.safeParse(validConfig);
      expect(result.success).toBe(true);
    });

    it("validates config with partial defaults", () => {
      const validConfig = {
        stainlessSdkRepos: {
          typescript: {
            staging: "git@github.com:org/typescript-sdk-staging.git",
            prod: "git@github.com:org/typescript-sdk.git",
          },
        },
        defaults: {
          branch: "main",
        },
      };

      const result = configSchema.safeParse(validConfig);
      expect(result.success).toBe(true);
    });

    it("validates config with only staging URL", () => {
      const validConfig = {
        stainlessSdkRepos: {
          typescript: {
            staging: "git@github.com:org/typescript-sdk-staging.git",
          },
        },
      };

      const result = configSchema.safeParse(validConfig);
      expect(result.success).toBe(true);
    });

    it("validates config with only prod URL", () => {
      const validConfig = {
        stainlessSdkRepos: {
          typescript: {
            prod: "git@github.com:org/typescript-sdk.git",
          },
        },
      };

      const result = configSchema.safeParse(validConfig);
      expect(result.success).toBe(true);
    });

    it("rejects config with no URLs defined", () => {
      const invalidConfig = {
        stainlessSdkRepos: {
          typescript: {},
        },
      };

      const result = configSchema.safeParse(invalidConfig);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.errors[0].message).toBe("At least one of staging or prod must be defined");
      }
    });

    it("rejects config with invalid git URLs", () => {
      const invalidConfig = {
        stainlessSdkRepos: {
          typescript: {
            staging: "not-a-git-url",
            prod: "git@github.com:org/typescript-sdk.git",
          },
        },
      };

      const result = configSchema.safeParse(invalidConfig);
      expect(result.success).toBe(false);
    });
  });

  describe("loadConfig", () => {
    it("loads and validates config file", async () => {
      const mockConfig = {
        stainlessSdkRepos: {
          typescript: {
            staging: "git@github.com:org/typescript-sdk-staging.git",
            prod: "git@github.com:org/typescript-sdk.git",
          },
        },
      };

      vi.mocked(cosmiconfig).mockReturnValue({
        search: vi.fn().mockResolvedValue({ config: mockConfig }),
        load: vi.fn().mockResolvedValue({ config: mockConfig }),
      } as any);

      const config = await loadConfig();
      expect(config).toEqual(mockConfig);
    });

    it("throws error when no config file found", async () => {
      vi.mocked(cosmiconfig).mockReturnValue({
        search: vi.fn().mockResolvedValue(null),
        load: vi.fn().mockResolvedValue(null),
      } as any);

      await expect(loadConfig()).rejects.toThrow("No configuration file found");
    });
  });
});
