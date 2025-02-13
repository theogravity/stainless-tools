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
          typescript: "git@github.com:org/typescript-sdk.git",
          python: "https://github.com/org/python-sdk.git",
        },
        defaults: {
          branch: "main",
          targetDir: "./sdks/{sdk}",
          openApiFile: "./specs/openapi.json",
          stainlessConfigFile: "./stainless.config.json",
        },
      };

      const result = configSchema.safeParse(validConfig);
      expect(result.success).toBe(true);
    });

    it("validates correct config without defaults", () => {
      const validConfig = {
        stainlessSdkRepos: {
          typescript: "git@github.com:org/typescript-sdk.git",
        },
      };

      const result = configSchema.safeParse(validConfig);
      expect(result.success).toBe(true);
    });

    it("validates config with partial defaults", () => {
      const validConfig = {
        stainlessSdkRepos: {
          typescript: "git@github.com:org/typescript-sdk.git",
        },
        defaults: {
          branch: "main",
          // Other defaults are optional
        },
      };

      const result = configSchema.safeParse(validConfig);
      expect(result.success).toBe(true);
    });

    it("rejects invalid repo URLs", () => {
      const invalidConfig = {
        stainlessSdkRepos: {
          typescript: "not-a-valid-url",
        },
      };

      const result = configSchema.safeParse(invalidConfig);
      expect(result.success).toBe(false);
    });

    it("requires stainlessSdkRepos", () => {
      const missingRepos = {
        defaults: {
          branch: "main",
        },
      };

      const result = configSchema.safeParse(missingRepos);
      expect(result.success).toBe(false);
    });
  });

  describe("loadConfig", () => {
    it("loads config with defaults from specified path", async () => {
      const mockConfig = {
        stainlessSdkRepos: {
          typescript: "git@github.com:org/typescript-sdk.git",
        },
        defaults: {
          branch: "main",
          targetDir: "./sdks/{sdk}",
        },
      };

      mock({
        "path/to/config.js": `module.exports = ${JSON.stringify(mockConfig, null, 2)}`,
      });

      vi.mocked(cosmiconfig).mockReturnValue({
        load: vi.fn().mockResolvedValue({ config: mockConfig }),
        search: vi.fn(),
      } as any);

      const config = await loadConfig("path/to/config.js");
      expect(config).toEqual(mockConfig);
      expect(config.defaults?.branch).toBe("main");
      expect(config.defaults?.targetDir).toBe("./sdks/{sdk}");
    });

    it("loads config without defaults", async () => {
      const mockConfig = {
        stainlessSdkRepos: {
          typescript: "git@github.com:org/typescript-sdk.git",
        },
      };

      mock({
        "path/to/config.js": `module.exports = ${JSON.stringify(mockConfig, null, 2)}`,
      });

      vi.mocked(cosmiconfig).mockReturnValue({
        load: vi.fn().mockResolvedValue({ config: mockConfig }),
        search: vi.fn(),
      } as any);

      const config = await loadConfig("path/to/config.js");
      expect(config).toEqual(mockConfig);
      expect(config.defaults).toBeUndefined();
    });

    it("throws error when no config is found", async () => {
      mock({
        // Empty file system
      });

      vi.mocked(cosmiconfig).mockReturnValue({
        load: vi.fn().mockResolvedValue(null),
        search: vi.fn().mockResolvedValue(null),
      } as any);

      await expect(loadConfig()).rejects.toThrow("No configuration file found");
    });

    it("throws error for invalid config", async () => {
      const invalidConfig = {
        stainlessSdkRepos: {},
      };

      mock({
        "path/to/config.js": `module.exports = ${JSON.stringify(invalidConfig, null, 2)}`,
      });

      vi.mocked(cosmiconfig).mockReturnValue({
        load: vi.fn().mockResolvedValue({ config: invalidConfig }),
        search: vi.fn(),
      } as any);

      await expect(loadConfig()).rejects.toThrow();
    });
  });
});
