import { beforeEach, describe, expect, it, vi } from "vitest";
import { FileWatcher } from "../FileWatcher.js";
import { LifecycleManager } from "../LifecycleManager.js";
import { RepoManager } from "../RepoManager.js";
import { StainlessApi } from "../StainlessApi.js";
import { StainlessError } from "../StainlessError.js";
import { StainlessTools } from "../StainlessTools.js";

// Mock dependencies
vi.mock("../StainlessApi.js");
vi.mock("../FileWatcher.js");
vi.mock("../RepoManager.js");
vi.mock("../LifecycleManager.js");

describe("StainlessTools", () => {
  const defaultOptions = {
    sdkRepo: "git@github.com:org/repo.git",
    branch: "main",
    targetDir: "./sdks/test",
    openApiFile: "openapi.yaml",
    stainlessConfigFile: "stainless.json",
    projectName: "test-project",
    stainlessApiOptions: {
      apiKey: "test-api-key",
      baseUrl: "https://api.test.com",
      projectName: "test-project",
    },
    sdkName: "test-sdk",
    env: "staging",
    lifecycle: {
      "test-sdk": {
        postClone: "npm install",
        postUpdate: "npm run build",
      },
    },
    lifecycleManager: new LifecycleManager(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("constructor", () => {
    it("should create instance with valid options", () => {
      const tools = new StainlessTools(defaultOptions);
      expect(tools).toBeInstanceOf(StainlessTools);
      expect(StainlessApi).toHaveBeenCalledWith(defaultOptions.stainlessApiOptions);
      expect(RepoManager).toHaveBeenCalledWith({
        sdkRepo: defaultOptions.sdkRepo,
        branch: defaultOptions.branch,
        targetDir: defaultOptions.targetDir,
        sdkName: defaultOptions.sdkName,
        env: defaultOptions.env,
        lifecycleManager: expect.any(LifecycleManager),
      });
      expect(FileWatcher).toHaveBeenCalledWith(
        expect.objectContaining({
          openApiFile: defaultOptions.openApiFile,
          stainlessConfigFile: defaultOptions.stainlessConfigFile,
          spinner: undefined,
          branch: defaultOptions.branch,
          stainlessApi: expect.any(StainlessApi),
          stainlessApiOptions: {
            projectName: defaultOptions.stainlessApiOptions.projectName,
            guessConfig: undefined,
          },
          lifecycleManager: expect.any(LifecycleManager),
          sdkName: defaultOptions.sdkName,
        }),
      );
    });

    it("should create LifecycleManager with empty config when no lifecycle provided", () => {
      const { lifecycle, ...optionsWithoutLifecycle } = defaultOptions;

      const tools = new StainlessTools(optionsWithoutLifecycle);
      expect(LifecycleManager).toHaveBeenCalledWith(undefined);
    });

    it("should throw error if sdkRepo is missing", () => {
      const invalidOptions = { ...defaultOptions, sdkRepo: "" };
      expect(() => new StainlessTools(invalidOptions)).toThrow(StainlessError);
    });

    it("should throw error if branch is missing", () => {
      const invalidOptions = { ...defaultOptions, branch: "" };
      expect(() => new StainlessTools(invalidOptions)).toThrow(StainlessError);
    });

    it("should throw error if targetDir is missing", () => {
      const invalidOptions = { ...defaultOptions, targetDir: "" };
      expect(() => new StainlessTools(invalidOptions)).toThrow(StainlessError);
    });

    it("should throw error if sdkRepo is invalid", () => {
      const invalidOptions = { ...defaultOptions, sdkRepo: "invalid-url" };
      expect(() => new StainlessTools(invalidOptions)).toThrow(StainlessError);
    });
  });

  describe("clone", () => {
    let tools: StainlessTools;
    let mockRepoManager: any;
    let mockFileWatcher: any;
    let callOrder: string[];

    beforeEach(() => {
      tools = new StainlessTools(defaultOptions);
      mockRepoManager = vi.mocked(RepoManager).mock.instances[0];
      mockFileWatcher = vi.mocked(FileWatcher).mock.instances[0];
      callOrder = [];

      // Setup mocks with proper typing
      mockFileWatcher.publishFiles = vi.fn().mockImplementation(async () => {
        callOrder.push("publish");
      });
      mockRepoManager.initializeRepo = vi.fn().mockImplementation(async () => {
        callOrder.push("initRepo");
      });
      mockFileWatcher.start = vi.fn();
    });

    it("should successfully clone and setup repository", async () => {
      await tools.clone();

      // Verify publish is called before repo initialization
      expect(callOrder).toEqual(["publish", "initRepo"]);
      expect(mockFileWatcher.publishFiles).toHaveBeenCalled();
      expect(mockRepoManager.initializeRepo).toHaveBeenCalled();
      expect(mockFileWatcher.start).toHaveBeenCalled();
    });

    it("should publish files even for cli branch", async () => {
      const cliTools = new StainlessTools({
        ...defaultOptions,
        branch: "cli/feature",
      });

      // Get the mock instances for the new StainlessTools instance
      const mockRepoManager = vi.mocked(RepoManager).mock.instances[1];
      const mockFileWatcher = vi.mocked(FileWatcher).mock.instances[1];

      // Setup mocks with proper typing
      mockFileWatcher.publishFiles = vi.fn().mockImplementation(async () => {
        callOrder.push("publish");
      });
      mockRepoManager.initializeRepo = vi.fn().mockImplementation(async () => {
        callOrder.push("initRepo");
      });
      mockFileWatcher.start = vi.fn();

      await cliTools.clone();

      // Verify publish is called before repo initialization
      expect(callOrder).toEqual(["publish", "initRepo"]);
      expect(mockFileWatcher.publishFiles).toHaveBeenCalled();
      expect(mockRepoManager.initializeRepo).toHaveBeenCalled();
      expect(mockFileWatcher.start).toHaveBeenCalled();
    });

    it("should throw error if openApiFile is missing", async () => {
      const { openApiFile, ...optionsWithoutOpenApi } = defaultOptions;

      expect(() => new StainlessTools(optionsWithoutOpenApi as any)).toThrow(StainlessError);
    });

    it("should handle repository initialization errors", async () => {
      const error = new Error("Git error");
      mockRepoManager.initializeRepo.mockRejectedValue(error);

      await expect(tools.clone()).rejects.toThrow(StainlessError);
    });
  });

  describe("hasNewChanges", () => {
    let tools: StainlessTools;
    let mockRepoManager: any;

    beforeEach(() => {
      tools = new StainlessTools(defaultOptions);
      mockRepoManager = vi.mocked(RepoManager).mock.instances[0];
    });

    it("should return true when new changes exist", async () => {
      mockRepoManager.hasNewChanges.mockResolvedValue(true);
      expect(await tools.hasNewChanges()).toBe(true);
    });

    it("should return false when no new changes exist", async () => {
      mockRepoManager.hasNewChanges.mockResolvedValue(false);
      expect(await tools.hasNewChanges()).toBe(false);
    });

    it("should propagate errors", async () => {
      const error = new Error("Git error");
      mockRepoManager.hasNewChanges.mockRejectedValue(error);
      await expect(tools.hasNewChanges()).rejects.toThrow(error);
    });
  });

  describe("pullChanges", () => {
    let tools: StainlessTools;
    let mockRepoManager: any;

    beforeEach(() => {
      tools = new StainlessTools(defaultOptions);
      mockRepoManager = vi.mocked(RepoManager).mock.instances[0];
    });

    it("should successfully pull changes", async () => {
      await tools.pullChanges();
      expect(mockRepoManager.pullChanges).toHaveBeenCalled();
    });

    it("should handle pull errors", async () => {
      const error = new Error("Git error");
      mockRepoManager.pullChanges.mockRejectedValue(error);
      await expect(tools.pullChanges()).rejects.toThrow(error);
    });
  });

  describe("cleanup", () => {
    let tools: StainlessTools;
    let mockFileWatcher: any;

    beforeEach(() => {
      tools = new StainlessTools(defaultOptions);
      mockFileWatcher = vi.mocked(FileWatcher).mock.instances[0];
    });

    it("should stop file watcher", () => {
      tools.cleanup();
      expect(mockFileWatcher.stop).toHaveBeenCalled();
    });
  });
});
