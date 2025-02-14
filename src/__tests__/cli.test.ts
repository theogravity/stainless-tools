import { EventEmitter } from "node:events";
import type * as path from "node:path";
import mock from "mock-fs";
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { StainlessError } from "../StainlessError";
import { generateAction } from "../cli";
import { loadConfig } from "../config";
import { generateAndWatchSDK } from "../lib";

// Mock dependencies
vi.mock("../config");
vi.mock("../lib", () => ({
  generateAndWatchSDK: vi.fn().mockImplementation(async (options) => {
    // Mock successful implementation that returns a cleanup function
    const cleanup = async () => {
      // Mock cleanup implementation
      return Promise.resolve();
    };
    return Promise.resolve(cleanup);
  }),
}));
vi.mock("chalk", () => ({
  default: {
    blue: vi.fn((text) => text),
    green: vi.fn((text) => text),
    red: vi.fn((text) => `\u001b[31m${text}\u001b[39m`),
    yellow: vi.fn((text) => text),
  },
}));

const mockSpinner = {
  start: vi.fn(() => mockSpinner),
  succeed: vi.fn(() => mockSpinner),
  fail: vi.fn(() => mockSpinner),
  stop: vi.fn(() => mockSpinner),
};

vi.mock("ora", () => ({
  default: vi.fn(() => mockSpinner),
}));

// Create a mock process using EventEmitter
class MockProcess extends EventEmitter {
  cwd: any;
  on: any;
  off: any;
  exit: any;
  constructor() {
    super();
    this.cwd = vi.fn(() => "/mock/test/dir");
    this.on = vi.fn((event, handler) => {
      // Call the real EventEmitter's on method
      return super.on(event, handler);
    });
    this.off = vi.fn((event, handler) => {
      // Call the real EventEmitter's off method
      return super.off(event, handler);
    });
    this.exit = vi.fn();
  }
}

const mockProcess = new MockProcess() as any;
const realProcess = process;

// Mock process.cwd and event handlers
vi.stubGlobal("process", {
  ...realProcess,
  ...mockProcess,
  exit: mockProcess.exit,
});

// Mock path.resolve to use our mock directory
vi.mock("node:path", async () => {
  const actual = await vi.importActual<typeof path>("node:path");
  return {
    ...actual,
    resolve: vi.fn((...parts: string[]) => {
      // Always use mockCwd() as base for relative paths
      const base = parts[0].startsWith("/") ? "" : mockProcess.cwd();
      // Use actual.join but ensure we're using the mock directory
      const resolvedPath = actual.join(base, ...parts);
      // Replace any workspace path with our mock path
      return resolvedPath.replace(process.cwd(), "/mock/test/dir");
    }),
  };
});

// Mock console.log and console.error to capture output
const originalConsoleLog = console.log;
const originalConsoleError = console.error;
let consoleOutput: string[] = [];
console.log = vi.fn((...args) => {
  consoleOutput.push(args.join(" "));
});
console.error = vi.fn((...args) => {
  // Handle chalk formatting by joining with empty string instead of space
  consoleOutput.push(args.join(""));
});

describe("CLI", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockProcess.cwd.mockReturnValue("/mock/test/dir");
    consoleOutput = [];

    // Setup mock filesystem with all necessary files and directories
    mock.restore(); // Ensure clean state
    mock({
      "/mock/test/dir": {
        "test-api.json": '{"openapi": "3.0.0"}',
        "stainless-tools.config.json": '{"config": true}',
        specs: {
          "openapi.json": '{"openapi": "3.0.0"}',
        },
        sdks: {
          "test-sdk": {
            ".git": {}, // Mock .git directory to simulate a git repository
            "package.json": '{"name": "test-sdk"}',
          },
        },
        node_modules: {}, // Mock node_modules directory
      },
    });
  });

  afterEach(() => {
    mock.restore();
    vi.clearAllMocks();
  });

  afterAll(() => {
    console.log = originalConsoleLog;
    console.error = originalConsoleError;
  });

  describe("generate command", () => {
    it("uses CLI options when provided", async () => {
      const mockConfig = {
        stainlessSdkRepos: {
          "test-sdk": "test-sdk-repo",
        },
        defaults: {
          branch: "main",
          targetDir: "./sdks/{sdk}",
          openApiFile: "./specs/openapi.json",
          stainlessConfigFile: "./stainless-tools.config.json",
          projectName: "test-project",
          guessConfig: true,
        },
      };

      vi.mocked(loadConfig).mockResolvedValue(mockConfig);

      const exitCode = await generateAction("test-sdk", {});
      expect(exitCode).toBe(0);

      // Verify repository output
      expect(consoleOutput).toContain("\nRepositories:");
      expect(consoleOutput).toContain("SDK: test-sdk-repo");
      expect(consoleOutput).toContain("Project name: test-project");

      expect(generateAndWatchSDK).toHaveBeenCalledWith(
        expect.objectContaining({
          sdkName: "test-sdk",
          sdkRepo: "test-sdk-repo",
          branch: "main",
          targetDir: "/mock/test/dir/sdks/{sdk}",
          openApiFile: "/mock/test/dir/specs/openapi.json",
          stainlessConfigFile: "/mock/test/dir/stainless-tools.config.json",
          spinner: expect.any(Object),
          stainlessApiOptions: {
            projectName: "test-project",
            guessConfig: true,
          },
        }),
      );
    });

    it("uses config defaults when CLI options not provided", async () => {
      const mockConfig = {
        stainlessSdkRepos: {
          "test-sdk": "test-sdk-repo",
        },
        defaults: {
          branch: "main",
          targetDir: "./sdks/{sdk}",
          openApiFile: "./specs/openapi.json",
          stainlessConfigFile: "./stainless-tools.config.json",
          projectName: "test-project",
          guessConfig: true,
        },
      };

      vi.mocked(loadConfig).mockResolvedValue(mockConfig);

      const exitCode = await generateAction("test-sdk", {});
      expect(exitCode).toBe(0);

      // Verify repository output
      expect(consoleOutput).toContain("\nRepositories:");
      expect(consoleOutput).toContain("SDK: test-sdk-repo");
      expect(consoleOutput).toContain("Project name: test-project");

      expect(generateAndWatchSDK).toHaveBeenCalledWith(
        expect.objectContaining({
          sdkName: "test-sdk",
          sdkRepo: "test-sdk-repo",
          branch: "main",
          targetDir: "/mock/test/dir/sdks/{sdk}",
          openApiFile: "/mock/test/dir/specs/openapi.json",
          stainlessConfigFile: "/mock/test/dir/stainless-tools.config.json",
          spinner: expect.any(Object),
          stainlessApiOptions: {
            projectName: "test-project",
            guessConfig: true,
          },
        }),
      );
    });

    it("handles error when SDK name not found in config", async () => {
      const mockConfig = {
        stainlessSdkRepos: {
          "other-sdk": "test-sdk-repo",
        },
      };

      vi.mocked(loadConfig).mockResolvedValue(mockConfig);

      const exitCode = await generateAction("test-sdk", {});
      expect(exitCode).toBe(1);
      expect(mockSpinner.fail).toHaveBeenCalled();
      // Check for key parts of the error message
      expect(
        consoleOutput.some(
          (line) => line.includes("test-sdk") && line.includes('not found in the configuration "stainlessSdkRepos"'),
        ),
      ).toBe(true);
    });

    it("handles error when directory contains different repository", async () => {
      const mockConfig = {
        stainlessSdkRepos: {
          "test-sdk": "test-sdk-repo",
        },
        defaults: {
          branch: "main",
          targetDir: "./sdks/{sdk}",
          openApiFile: "./specs/openapi.json",
          projectName: "test-project",
        },
      };

      vi.mocked(loadConfig).mockResolvedValue(mockConfig);

      // Mock the error from StainlessTools for a different repository
      const error = new StainlessError(
        "Directory /mock/test/dir/sdks/test-sdk contains a different repository (https://github.com/other/repo.git). " +
          "Expected test-sdk-repo. Please remove the directory manually and try again.",
      );
      vi.mocked(generateAndWatchSDK).mockRejectedValue(error);

      const exitCode = await generateAction("test-sdk", {});
      expect(exitCode).toBe(1);
      expect(mockSpinner.fail).toHaveBeenCalled();
      console.log("Console output:", JSON.stringify(consoleOutput, null, 2));
      // Check for key parts of the error message separately
      expect(consoleOutput.some((line) => line.includes("different repository"))).toBe(true);
      expect(consoleOutput.some((line) => line.includes("https://github.com/other/repo.git"))).toBe(true);
      expect(consoleOutput.some((line) => line.includes("test-sdk-repo"))).toBe(true);
      expect(consoleOutput.some((line) => line.includes("remove the directory manually"))).toBe(true);
    });

    it("uses environment variable for branch when CLI and config options not provided", async () => {
      process.env.STAINLESS_SDK_BRANCH = "env-branch";

      const mockConfig = {
        stainlessSdkRepos: {
          "test-sdk": "test-sdk-repo",
        },
        defaults: {
          targetDir: "./sdks/test-sdk",
          openApiFile: "./specs/openapi.json",
          stainlessConfigFile: "./stainless-tools.config.json",
          projectName: "test-project",
          guessConfig: true,
        },
      };

      vi.mocked(loadConfig).mockResolvedValue(mockConfig);
      vi.mocked(generateAndWatchSDK).mockResolvedValue(async () => {
        // Mock cleanup function
        return Promise.resolve();
      });

      try {
        const exitCode = await generateAction("test-sdk", {
          "open-api-file": "./specs/openapi.json",
          projectName: "test-project",
          targetDir: "./sdks/test-sdk",
        });

        expect(exitCode).toBe(0);

        expect(generateAndWatchSDK).toHaveBeenCalledWith({
          sdkName: "test-sdk",
          sdkRepo: "test-sdk-repo",
          branch: "env-branch",
          targetDir: "/mock/test/dir/sdks/test-sdk",
          openApiFile: "/mock/test/dir/specs/openapi.json",
          stainlessConfigFile: "/mock/test/dir/stainless-tools.config.json",
          spinner: expect.any(Object),
          stainlessApiOptions: {
            projectName: "test-project",
            guessConfig: true,
          },
        });
      } catch (error) {
        console.error("Test error:", error);
        throw error;
      } finally {
        // Clean up
        delete process.env.STAINLESS_SDK_BRANCH;
      }
    });

    it("prioritizes CLI option over environment variable for branch", async () => {
      process.env.STAINLESS_SDK_BRANCH = "env-branch";

      const mockConfig = {
        stainlessSdkRepos: {
          "test-sdk": "test-sdk-repo",
        },
        defaults: {
          targetDir: "./sdks/test-sdk",
          openApiFile: "./specs/openapi.json",
          stainlessConfigFile: "./stainless-tools.config.json",
          projectName: "test-project",
          guessConfig: true,
        },
      };

      vi.mocked(loadConfig).mockResolvedValue(mockConfig);
      vi.mocked(generateAndWatchSDK).mockResolvedValue(async () => {
        // Mock cleanup function
        return Promise.resolve();
      });

      try {
        const exitCode = await generateAction("test-sdk", {
          branch: "cli-branch",
          "open-api-file": "./specs/openapi.json",
          projectName: "test-project",
          targetDir: "./sdks/test-sdk",
        });
   
        expect(exitCode).toBe(0);

        expect(generateAndWatchSDK).toHaveBeenCalledWith({
          sdkName: "test-sdk",
          sdkRepo: "test-sdk-repo",
          branch: "cli-branch",
          targetDir: "/mock/test/dir/sdks/test-sdk",
          openApiFile: "/mock/test/dir/specs/openapi.json",
          stainlessConfigFile: "/mock/test/dir/stainless-tools.config.json",
          spinner: expect.any(Object),
          stainlessApiOptions: {
            projectName: "test-project",
            guessConfig: true,
          },
        });
      } catch (error) {
        console.error("Test error:", error);
        throw error;
      } finally {
        // Clean up
        delete process.env.STAINLESS_SDK_BRANCH;
      }
    });
  });
});
