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

  const defaultMockConfig = {
    stainlessSdkRepos: {
      "test-sdk": {
        staging: "git@github.com:org/test-sdk-staging.git",
        prod: "git@github.com:org/test-sdk.git",
      },
    },
    defaults: {
      branch: "main",
      targetDir: "./sdks/{sdk}",
      openApiFile: "./specs/openapi.json",
      stainlessConfigFile: "./stainless-tools.config.json",
      projectName: "test-project",
      guessConfig: false,
    },
  };

  const mockConfigWithoutDefaults = {
    stainlessSdkRepos: {
      "other-sdk": {
        staging: "git@github.com:org/other-sdk-staging.git",
        prod: "git@github.com:org/other-sdk.git",
      },
    },
  };

  const mockConfigWithPartialDefaults = {
    stainlessSdkRepos: {
      "test-sdk": {
        staging: "git@github.com:org/test-sdk-staging.git",
        prod: "git@github.com:org/test-sdk.git",
      },
    },
    defaults: {
      branch: "main",
      targetDir: "./sdks/{sdk}",
      openApiFile: "./specs/openapi.json",
      projectName: "test-project",
    },
  };

  describe("generate command", () => {
    beforeEach(() => {
      vi.resetAllMocks();
      vi.mocked(loadConfig).mockResolvedValue(defaultMockConfig);
    });

    it("generates SDK with default configuration", async () => {
      const exitCode = await generateAction("test-sdk", {
        "open-api-file": "./specs/openapi.json",
        projectName: "test-project",
      });

      expect(generateAndWatchSDK).toHaveBeenCalledWith(
        expect.objectContaining({
          sdkName: "test-sdk",
          sdkRepo: defaultMockConfig.stainlessSdkRepos["test-sdk"].staging,
          branch: defaultMockConfig.defaults.branch,
          openApiFile: expect.stringContaining("/specs/openapi.json"),
          stainlessConfigFile: expect.stringContaining("/stainless-tools.config.json"),
          targetDir: expect.stringContaining("/sdks/{sdk}"),
        }),
      );
      expect(exitCode).toBe(0);
    });

    it("generates SDK with custom configuration", async () => {
      vi.mocked(loadConfig).mockResolvedValue(mockConfigWithoutDefaults);

      const exitCode = await generateAction("other-sdk", {
        branch: "custom-branch",
        targetDir: "./custom-dir",
        "open-api-file": "./custom-openapi.json",
        projectName: "custom-project",
      });

      expect(generateAndWatchSDK).toHaveBeenCalledWith(
        expect.objectContaining({
          sdkName: "other-sdk",
          sdkRepo: mockConfigWithoutDefaults.stainlessSdkRepos["other-sdk"].staging,
          branch: "custom-branch",
          targetDir: expect.stringContaining("/custom-dir"),
          openApiFile: expect.stringContaining("/custom-openapi.json"),
        }),
      );
      expect(exitCode).toBe(0);
    });

    it("generates SDK with partial defaults", async () => {
      vi.mocked(loadConfig).mockResolvedValue(mockConfigWithPartialDefaults);

      const exitCode = await generateAction("test-sdk", {
        "open-api-file": "./specs/openapi.json",
        projectName: "test-project",
      });

      expect(generateAndWatchSDK).toHaveBeenCalledWith(
        expect.objectContaining({
          sdkName: "test-sdk",
          sdkRepo: mockConfigWithPartialDefaults.stainlessSdkRepos["test-sdk"].staging,
          branch: mockConfigWithPartialDefaults.defaults.branch,
          openApiFile: expect.stringContaining("/specs/openapi.json"),
          targetDir: expect.stringContaining("/sdks/{sdk}"),
        }),
      );
      expect(exitCode).toBe(0);
    });

    it("handles errors gracefully", async () => {
      vi.mocked(generateAndWatchSDK).mockRejectedValue(new Error("Test error"));

      const exitCode = await generateAction("test-sdk", {
        "open-api-file": "./specs/openapi.json",
        projectName: "test-project",
      });

      expect(mockSpinner.fail).toHaveBeenCalledWith("Test error");
      expect(exitCode).toBe(1);
    });

    it("handles cleanup on process signals", async () => {
      const mockCleanup = vi.fn();
      vi.mocked(generateAndWatchSDK).mockResolvedValue(mockCleanup);

      const exitSpy = vi.spyOn(process, "exit").mockImplementation(() => undefined as never);
      const mockEmit = vi.fn();
      const originalEmit = process.emit;
      process.emit = mockEmit;

      await generateAction("test-sdk", {
        "open-api-file": "./specs/openapi.json",
        projectName: "test-project",
      });

      // Get the SIGINT handler that was registered
      const sigintHandler = mockProcess.on.mock.calls.find(call => call[0] === "SIGINT")?.[1];
      if (!sigintHandler) {
        throw new Error("SIGINT handler not found");
      }

      // Call the handler directly
      await sigintHandler();

      expect(mockSpinner.stop).toHaveBeenCalled();
      expect(mockCleanup).toHaveBeenCalled();
      expect(exitSpy).toHaveBeenCalledWith(0);

      // Cleanup
      process.emit = originalEmit;
      exitSpy.mockRestore();
    });
  });

  describe("generateAction", () => {
    const mockConfig = {
      stainlessSdkRepos: {
        typescript: {
          staging: "git@github.com:org/typescript-sdk-staging.git",
          prod: "git@github.com:org/typescript-sdk.git",
        },
        staging_only: {
          staging: "git@github.com:org/staging-only-sdk.git",
        },
        prod_only: {
          prod: "git@github.com:org/prod-only-sdk.git",
        },
      },
      defaults: {
        branch: "main",
        openApiFile: "./specs/openapi.json",
        projectName: "test-project",
      },
    };

    beforeEach(() => {
      vi.resetAllMocks();
      vi.mocked(loadConfig).mockResolvedValue(mockConfig);
    });

    it("uses staging URL by default", async () => {
      const exitCode = await generateAction("typescript", {
        "open-api-file": "./specs/openapi.json",
        projectName: "test-project",
      });

      expect(generateAndWatchSDK).toHaveBeenCalledWith(
        expect.objectContaining({
          sdkRepo: mockConfig.stainlessSdkRepos.typescript.staging,
        }),
      );
      expect(exitCode).toBe(0);
    });

    it("uses production URL when prod flag is set", async () => {
      const exitCode = await generateAction("typescript", {
        "open-api-file": "./specs/openapi.json",
        projectName: "test-project",
        prod: true,
      });

      expect(generateAndWatchSDK).toHaveBeenCalledWith(
        expect.objectContaining({
          sdkRepo: mockConfig.stainlessSdkRepos.typescript.prod,
        }),
      );
      expect(exitCode).toBe(0);
    });

    it("fails when staging URL is not defined", async () => {
      const exitCode = await generateAction("prod_only", {
        "open-api-file": "./specs/openapi.json",
        projectName: "test-project",
      });

      expect(generateAndWatchSDK).not.toHaveBeenCalled();
      expect(exitCode).toBe(1);
      expect(mockSpinner.fail).toHaveBeenCalledWith(
        expect.stringContaining('Staging URL not defined for SDK "prod_only"'),
      );
    });

    it("fails when production URL is not defined", async () => {
      const exitCode = await generateAction("staging_only", {
        "open-api-file": "./specs/openapi.json",
        projectName: "test-project",
        prod: true,
      });

      expect(generateAndWatchSDK).not.toHaveBeenCalled();
      expect(exitCode).toBe(1);
      expect(mockSpinner.fail).toHaveBeenCalledWith(
        expect.stringContaining('Production URL not defined for SDK "staging_only"'),
      );
    });

    it("fails when SDK is not found in config", async () => {
      const exitCode = await generateAction("nonexistent", {
        "open-api-file": "./specs/openapi.json",
        projectName: "test-project",
      });

      expect(generateAndWatchSDK).not.toHaveBeenCalled();
      expect(exitCode).toBe(1);
      expect(mockSpinner.fail).toHaveBeenCalledWith(
        expect.stringContaining('SDK "nonexistent" not found in configuration'),
      );
    });
  });
});
