import { EventEmitter } from "node:events";
import type * as path from "node:path";
import mock from "mock-fs";
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { loadConfig } from "../../../config";
import { generateAndWatchSDK } from "../../../lib";
import { createGenerateCommand, generateAction } from "../generate";

// Mock dependencies
vi.mock("../../../config");
vi.mock("../../../lib");

// Create a mock process using EventEmitter
class MockProcess extends EventEmitter {
  cwd: any;
  on: any;
  off: any;
  exit: any;
  env: Record<string, string>;
  constructor() {
    super();
    this.cwd = vi.fn().mockReturnValue("/mock/test/dir");
    this.on = vi.fn((event, handler) => {
      // Call the real EventEmitter's on method
      return super.on(event, handler);
    });
    this.off = vi.fn((event, handler) => {
      // Call the real EventEmitter's off method
      return super.off(event, handler);
    });
    this.exit = vi.fn();
    this.env = {};
  }
}

const mockProcess = new MockProcess();
const realProcess = process;

// Mock process.cwd and event handlers
vi.stubGlobal("process", mockProcess);

const mockSpinner = {
  start: vi.fn(() => mockSpinner),
  succeed: vi.fn(() => mockSpinner),
  fail: vi.fn(() => mockSpinner),
  stop: vi.fn(() => mockSpinner),
};

vi.mock("ora", () => ({
  default: vi.fn(() => mockSpinner),
}));

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

describe("generate command", () => {
  describe("command configuration", () => {
    it("has the correct name and description", () => {
      const command = createGenerateCommand();
      expect(command.name()).toBe("generate");
      expect(command.description()).toBe("Generate an SDK");
    });

    it("has the correct options", () => {
      const command = createGenerateCommand();
      const options = command.options;

      const expectedOptions = [
        { flags: "-b, --branch <branch>", description: "Git branch to use" },
        { flags: "-t, --target-dir <dir>", description: "Directory where the SDK will be generated" },
        { flags: "-o, --open-api-file <file>", description: "Path to OpenAPI specification file" },
        { flags: "-c, --config <file>", description: "Path to configuration file" },
        { flags: "-s, --stainless-config-file <file>", description: "Path to Stainless-specific configuration" },
        { flags: "-p, --project-name <name>", description: "Name of the project in Stainless" },
        { flags: "-g, --guess-config", description: "Use AI to guess configuration" },
        { flags: "--prod", description: "Use production URLs instead of staging" },
      ];

      expectedOptions.forEach((expected) => {
        const option = options.find((opt) => opt.flags === expected.flags);
        expect(option).toBeDefined();
        expect(option?.description).toBe(expected.description);
      });
    });

    it("has the correct argument", () => {
      const command = createGenerateCommand();
      const sdkNameArg = command.registeredArguments[0];

      expect(command.registeredArguments).toHaveLength(1);
      expect(sdkNameArg.name()).toBe("sdk-name");
      expect(sdkNameArg.description).toBe("Name of the SDK to generate");
      expect(sdkNameArg.required).toBe(true);
    });
  });

  beforeEach(() => {
    // Reset all mocks
    vi.clearAllMocks();

    // Clear console output tracking
    consoleOutput = [];

    // Setup environment
    mockProcess.env = {
      STAINLESS_API_KEY: "test-api-key",
    };

    // Restore real filesystem before setting up mock
    mock.restore();

    // Setup mock filesystem
    mock({
      "/mock/test/dir": {
        // OpenAPI files
        "test-api.json": JSON.stringify({ openapi: "3.0.0" }),
        "custom-openapi.json": JSON.stringify({ openapi: "3.0.0" }),
        specs: {
          "openapi.json": JSON.stringify({ openapi: "3.0.0" }),
        },
        // Config files
        "stainless-tools.config.json": JSON.stringify({ config: true }),
        // SDK directories
        sdks: {
          "test-sdk": {
            ".git": mock.directory(),
            "package.json": JSON.stringify({ name: "test-sdk" }),
            src: {
              "index.ts": "export const version = '1.0.0';",
            },
          },
          "other-sdk": {
            ".git": mock.directory(),
            "package.json": JSON.stringify({ name: "other-sdk" }),
          },
        },
        // Target directories that should exist
        custom: {
          "test-sdk": {
            path: mock.directory(),
          },
        },
        fixed: {
          path: {
            sdk: mock.directory(),
          },
        },
        // Node modules should exist for npm commands
        node_modules: mock.directory(),
      },
    });

    // Setup default config mock
    vi.mocked(loadConfig).mockResolvedValue({
      ...defaultMockConfig,
      lifecycle: {
        "test-sdk": {
          postClone: "npm install && npm run build",
          postUpdate: "npm run build",
        },
      },
    });
  });

  afterEach(() => {
    // Restore real filesystem
    mock.restore();
    vi.clearAllMocks();
  });

  afterAll(() => {
    // Restore console
    console.log = originalConsoleLog;
    console.error = originalConsoleError;
    // Restore process
    vi.stubGlobal("process", realProcess);
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

  it("generates SDK with default configuration", async () => {
    const exitCode = await generateAction("test-sdk", {
      "open-api-file": "./specs/openapi.json",
      projectName: "test-project",
    });

    expect(generateAndWatchSDK).toHaveBeenCalledWith({
      sdkName: "test-sdk",
      sdkRepo: defaultMockConfig.stainlessSdkRepos["test-sdk"].staging,
      branch: defaultMockConfig.defaults.branch,
      openApiFile: "/mock/test/dir/specs/openapi.json",
      stainlessConfigFile: "/mock/test/dir/stainless-tools.config.json",
      targetDir: "/mock/test/dir/sdks/test-sdk",
      env: "staging",
      lifecycle: {
        "test-sdk": {
          postClone: "npm install && npm run build",
          postUpdate: "npm run build",
        },
      },
      spinner: expect.any(Object),
      stainlessApiOptions: {
        projectName: "test-project",
        guessConfig: false,
      },
    });
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

    expect(generateAndWatchSDK).toHaveBeenCalledWith({
      sdkName: "other-sdk",
      sdkRepo: mockConfigWithoutDefaults.stainlessSdkRepos["other-sdk"].staging,
      branch: "custom-branch",
      targetDir: "/mock/test/dir/custom-dir",
      openApiFile: "/mock/test/dir/custom-openapi.json",
      env: "staging",
      lifecycle: undefined,
      spinner: expect.any(Object),
      stainlessApiOptions: {
        projectName: "custom-project",
        guessConfig: false,
      },
    });
    expect(exitCode).toBe(0);
  });

  it("generates SDK with partial defaults", async () => {
    vi.mocked(loadConfig).mockResolvedValue(mockConfigWithPartialDefaults);

    const exitCode = await generateAction("test-sdk", {
      "open-api-file": "./specs/openapi.json",
      projectName: "test-project",
    });

    expect(generateAndWatchSDK).toHaveBeenCalledWith({
      sdkName: "test-sdk",
      sdkRepo: mockConfigWithPartialDefaults.stainlessSdkRepos["test-sdk"].staging,
      branch: mockConfigWithPartialDefaults.defaults.branch,
      openApiFile: "/mock/test/dir/specs/openapi.json",
      targetDir: "/mock/test/dir/sdks/test-sdk",
      env: "staging",
      lifecycle: undefined,
      spinner: expect.any(Object),
      stainlessApiOptions: {
        projectName: "test-project",
        guessConfig: false,
      },
    });
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
    const sigintHandler = mockProcess.on.mock.calls.find((call) => call[0] === "SIGINT")?.[1];
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

  it("passes lifecycle configuration to generateAndWatchSDK", async () => {
    const exitCode = await generateAction("test-sdk", {
      "open-api-file": "./specs/openapi.json",
      projectName: "test-project",
    });

    expect(generateAndWatchSDK).toHaveBeenCalledWith(
      expect.objectContaining({
        sdkName: "test-sdk",
        lifecycle: {
          "test-sdk": {
            postClone: "npm install && npm run build",
            postUpdate: "npm run build",
          },
        },
      }),
    );
    expect(exitCode).toBe(0);
  });

  it("uses branch from command line option", async () => {
    const exitCode = await generateAction("test-sdk", {
      branch: "feature/test",
      "open-api-file": "./specs/openapi.json",
      projectName: "test-project",
    });

    expect(generateAndWatchSDK).toHaveBeenCalledWith(
      expect.objectContaining({
        branch: "feature/test",
      }),
    );
    expect(exitCode).toBe(0);
  });

  it("uses branch from environment variable", async () => {
    process.env.STAINLESS_SDK_BRANCH = "env/test";

    const exitCode = await generateAction("test-sdk", {
      "open-api-file": "./specs/openapi.json",
      projectName: "test-project",
    });

    expect(generateAndWatchSDK).toHaveBeenCalledWith(
      expect.objectContaining({
        branch: "env/test",
      }),
    );
    expect(exitCode).toBe(0);
  });

  it("uses branch from config defaults", async () => {
    const configWithBranch = {
      ...defaultMockConfig,
      defaults: {
        ...defaultMockConfig.defaults,
        branch: "config/test",
      },
    };
    vi.mocked(loadConfig).mockResolvedValue(configWithBranch);

    // Ensure no environment variable is set
    mockProcess.env = { STAINLESS_API_KEY: "test-api-key" };

    const exitCode = await generateAction("test-sdk", {
      "open-api-file": "./specs/openapi.json",
      projectName: "test-project",
    });

    expect(generateAndWatchSDK).toHaveBeenCalledWith(
      expect.objectContaining({
        branch: "config/test",
      }),
    );
    expect(exitCode).toBe(0);
  });

  it("prioritizes command line branch over environment variable and config", async () => {
    process.env.STAINLESS_SDK_BRANCH = "env/test";
    const configWithBranch = {
      ...defaultMockConfig,
      defaults: {
        ...defaultMockConfig.defaults,
        branch: "config/test",
      },
    };
    vi.mocked(loadConfig).mockResolvedValue(configWithBranch);

    const exitCode = await generateAction("test-sdk", {
      branch: "cli/test",
      "open-api-file": "./specs/openapi.json",
      projectName: "test-project",
    });

    expect(generateAndWatchSDK).toHaveBeenCalledWith(
      expect.objectContaining({
        branch: "cli/test",
      }),
    );
    expect(exitCode).toBe(0);
  });

  it("prioritizes environment variable over config defaults", async () => {
    process.env.STAINLESS_SDK_BRANCH = "env/test";
    const configWithBranch = {
      ...defaultMockConfig,
      defaults: {
        ...defaultMockConfig.defaults,
        branch: "config/test",
      },
    };
    vi.mocked(loadConfig).mockResolvedValue(configWithBranch);

    const exitCode = await generateAction("test-sdk", {
      "open-api-file": "./specs/openapi.json",
      projectName: "test-project",
    });

    expect(generateAndWatchSDK).toHaveBeenCalledWith(
      expect.objectContaining({
        branch: "env/test",
      }),
    );
    expect(exitCode).toBe(0);
  });

  it("uses staging URL by default", async () => {
    process.env.STAINLESS_SDK_BRANCH = "test/branch"; // Add branch via env var

    const exitCode = await generateAction("test-sdk", {
      "open-api-file": "./specs/openapi.json",
      projectName: "test-project",
    });

    expect(generateAndWatchSDK).toHaveBeenCalledWith(
      expect.objectContaining({
        sdkRepo: defaultMockConfig.stainlessSdkRepos["test-sdk"].staging,
        branch: "test/branch",
      }),
    );
    expect(exitCode).toBe(0);
  });

  it("uses production URL when prod flag is set", async () => {
    process.env.STAINLESS_SDK_BRANCH = "test/branch"; // Add branch via env var

    const exitCode = await generateAction("test-sdk", {
      "open-api-file": "./specs/openapi.json",
      projectName: "test-project",
      prod: true,
    });

    expect(generateAndWatchSDK).toHaveBeenCalledWith(
      expect.objectContaining({
        sdkRepo: defaultMockConfig.stainlessSdkRepos["test-sdk"].prod,
        branch: "test/branch",
      }),
    );
    expect(exitCode).toBe(0);
  });

  it("fails when staging URL is not defined", async () => {
    // Set up config with an SDK that only has prod URL
    const configWithProdOnly = {
      stainlessSdkRepos: {
        prod_only: {
          prod: "git@github.com:org/prod-only-sdk.git",
        },
      },
      defaults: defaultMockConfig.defaults,
    };
    vi.mocked(loadConfig).mockResolvedValue(configWithProdOnly);

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
    // Set up config with an SDK that only has staging URL
    const configWithStagingOnly = {
      stainlessSdkRepos: {
        staging_only: {
          staging: "git@github.com:org/staging-only-sdk.git",
        },
      },
      defaults: defaultMockConfig.defaults,
    };
    vi.mocked(loadConfig).mockResolvedValue(configWithStagingOnly);

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

  it("resolves target directory template variables in console output", async () => {
    const configWithTemplates = {
      ...defaultMockConfig,
      defaults: {
        ...defaultMockConfig.defaults,
        targetDir: "./sdks/{env}/{sdk}/{branch}",
      },
    };
    vi.mocked(loadConfig).mockResolvedValue(configWithTemplates);

    const exitCode = await generateAction("test-sdk", {
      branch: "user/feature/test",
      "open-api-file": "./specs/openapi.json",
      projectName: "test-project",
    });

    expect(exitCode).toBe(0);
    expect(consoleOutput).toContain("Target directory: /mock/test/dir/sdks/staging/test-sdk/user-feature-test");
  });

  it("resolves target directory with prod environment", async () => {
    const configWithTemplates = {
      ...defaultMockConfig,
      defaults: {
        ...defaultMockConfig.defaults,
        targetDir: "./sdks/{env}/{sdk}/{branch}",
      },
    };
    vi.mocked(loadConfig).mockResolvedValue(configWithTemplates);

    const exitCode = await generateAction("test-sdk", {
      branch: "main",
      "open-api-file": "./specs/openapi.json",
      projectName: "test-project",
      prod: true,
    });

    expect(exitCode).toBe(0);
    expect(consoleOutput).toContain("Target directory: /mock/test/dir/sdks/prod/test-sdk/main");
  });

  it("resolves target directory with only some template variables", async () => {
    const configWithTemplates = {
      ...defaultMockConfig,
      defaults: {
        ...defaultMockConfig.defaults,
        targetDir: "./custom/{sdk}/path/{branch}",
      },
    };
    vi.mocked(loadConfig).mockResolvedValue(configWithTemplates);

    const exitCode = await generateAction("test-sdk", {
      branch: "user/dev",
      "open-api-file": "./specs/openapi.json",
      projectName: "test-project",
    });

    expect(exitCode).toBe(0);
    expect(consoleOutput).toContain("Target directory: /mock/test/dir/custom/test-sdk/path/user-dev");
  });

  it("leaves target directory unchanged when no template variables used", async () => {
    const configWithoutTemplates = {
      ...defaultMockConfig,
      defaults: {
        ...defaultMockConfig.defaults,
        targetDir: "./fixed/path/sdk",
      },
    };
    vi.mocked(loadConfig).mockResolvedValue(configWithoutTemplates);

    const exitCode = await generateAction("test-sdk", {
      branch: "main",
      "open-api-file": "./specs/openapi.json",
      projectName: "test-project",
    });

    expect(exitCode).toBe(0);
    expect(consoleOutput).toContain("Target directory: /mock/test/dir/fixed/path/sdk");
  });

  it("generates random cli/ branch when no branch is specified", async () => {
    // Remove branch from config defaults
    const configWithoutBranch = {
      ...defaultMockConfig,
      defaults: {
        ...defaultMockConfig.defaults,
        branch: undefined,
      },
    };
    vi.mocked(loadConfig).mockResolvedValue(configWithoutBranch);

    // Ensure no environment variable is set
    mockProcess.env = { STAINLESS_API_KEY: "test-api-key" };

    const exitCode = await generateAction("test-sdk", {
      "open-api-file": "./specs/openapi.json",
      projectName: "test-project",
    });

    expect(exitCode).toBe(0);
    expect(generateAndWatchSDK).toHaveBeenCalledWith(
      expect.objectContaining({
        branch: expect.stringMatching(/^cli\/[a-f0-9]{8}$/),
      }),
    );
  });
});
