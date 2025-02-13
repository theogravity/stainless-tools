import { watch } from "chokidar";
import mock from "mock-fs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { StainlessError } from "../StainlessError";
import { StainlessTools } from "../StainlessTools";
import { generateAndWatchSDK } from "../lib";

// Mock StainlessApi
const mockPublish = vi.fn().mockResolvedValue(undefined);
vi.mock("../StainlessApi", () => ({
  StainlessApi: vi.fn().mockImplementation((options = {}) => {
    // Mock the constructor behavior
    if (!options.apiKey && !process.env.STAINLESS_API_KEY) {
      process.env.STAINLESS_API_KEY = "test-api-key";
    }
    return {
      publish: mockPublish,
      baseUrl: options.baseUrl || "https://api.stainlessapi.com",
      apiKey: options.apiKey || process.env.STAINLESS_API_KEY,
    };
  }),
}));

// Create mock implementation
const mockGit = {
  clone: vi.fn().mockResolvedValue(undefined),
  cwd: vi.fn().mockResolvedValue(undefined),
  checkout: vi.fn().mockResolvedValue(undefined),
  log: vi.fn().mockResolvedValue({ latest: { hash: "abc123" } }),
  fetch: vi.fn().mockResolvedValue(undefined),
  pull: vi.fn().mockResolvedValue(undefined),
  status: vi.fn().mockResolvedValue({ isClean: () => true }),
  stash: vi.fn().mockResolvedValue(undefined),
  revparse: vi.fn().mockResolvedValue(undefined),
  getRemotes: vi.fn().mockResolvedValue([{ name: "origin", refs: { fetch: "https://github.com/org/repo.git" } }]),
};

// Mock the entire module
vi.mock("simple-git", () => ({
  default: () => mockGit,
}));

vi.mock("node:path");

// Mock chokidar
const mockWatcher = {
  on: vi.fn().mockReturnThis(),
  close: vi.fn(),
};

vi.mock("chokidar", () => ({
  watch: vi.fn(() => mockWatcher),
}));

describe("StainlessTools", () => {
  beforeEach(() => {
    // Reset all mocks
    vi.clearAllMocks();
    mockPublish.mockReset();
    mockGit.clone.mockReset();
    mockGit.cwd.mockReset();
    mockGit.checkout.mockReset();
    mockGit.log.mockReset();
    mockGit.fetch.mockReset();
    mockGit.pull.mockReset();
    mockGit.clone.mockResolvedValue(undefined);
    mockGit.cwd.mockResolvedValue(undefined);
    mockGit.checkout.mockResolvedValue(undefined);
    mockGit.fetch.mockResolvedValue(undefined);
    mockGit.pull.mockResolvedValue(undefined);
    mockPublish.mockResolvedValue(undefined);
    mockWatcher.on.mockReset();
    mockWatcher.close.mockReset();
    mockWatcher.on.mockReturnThis();

    // Setup mock filesystem
    mock({
      "/test/sdk-repo": {},
      "/test/config-repo": {},
      "/test/target-dir": {},
      "/test/openapi.json": '{"openapi": "3.0.0"}',
      "/test/stainless.json": '{"name": "test-api"}',
    });
  });

  afterEach(() => {
    mock.restore();
    delete process.env.STAINLESS_API_KEY;
  });

  describe("constructor", () => {
    it("validates inputs correctly", () => {
      expect(() => {
        new StainlessTools({
          sdkRepo: "https://github.com/org/repo.git",
          branch: "main",
          targetDir: "/test/target-dir",
          openApiFile: "/test/openapi.json",
          stainlessConfigFile: "/test/stainless.json",
        });
      }).not.toThrow();
    });

    it("accepts optional files", () => {
      expect(() => {
        new StainlessTools({
          sdkRepo: "https://github.com/org/repo.git",
          branch: "main",
          targetDir: "/test/target-dir",
        });
      }).not.toThrow();
    });
  });

  describe("clone", () => {
    let validTools: StainlessTools;
    let mockExit: any;

    beforeEach(() => {
      validTools = new StainlessTools({
        sdkRepo: "https://github.com/org/repo.git",
        branch: "main",
        targetDir: "/test/target-dir",
      });

      // Reset mock implementations
      mockGit.revparse.mockReset();
      mockGit.getRemotes.mockReset();
      mockGit.log.mockReset();
      mockGit.clone.mockReset();
      mockGit.checkout.mockReset();

      // Set default successful responses
      mockGit.log.mockResolvedValue({ latest: { hash: "abc123" } });
      mockGit.clone.mockResolvedValue(undefined);
      mockGit.checkout.mockResolvedValue(undefined);
      mockGit.getRemotes.mockResolvedValue([{ name: "origin", refs: { fetch: "https://github.com/org/repo.git" } }]);

      // Mock process.exit
      mockExit = vi.spyOn(process, "exit").mockImplementation(() => undefined as never);
    });

    afterEach(() => {
      mockExit.mockRestore();
    });

    it("clones repository successfully", async () => {
      // Mock directory does not exist
      mockGit.revparse.mockRejectedValue(new Error("not a git repo"));

      await validTools.clone();

      expect(mockGit.clone).toHaveBeenCalledWith("https://github.com/org/repo.git", "/test/target-dir");
      expect(mockGit.checkout).toHaveBeenCalledWith("main");
    });

    it("publishes files when specified", async () => {
      // Mock directory does not exist
      mockGit.revparse.mockRejectedValue(new Error("not a git repo"));

      const toolsWithFiles = new StainlessTools({
        sdkRepo: "https://github.com/org/repo.git",
        branch: "main",
        targetDir: "/test/target-dir",
        openApiFile: "/test/openapi.json",
      });

      await toolsWithFiles.clone();

      expect(mockPublish).toHaveBeenCalledWith(
        expect.objectContaining({
          spec: expect.any(Buffer),
          branch: "main",
        }),
      );
    });

    it("requires OpenAPI file", async () => {
      // Mock directory does not exist
      mockGit.revparse.mockRejectedValue(new Error("not a git repo"));

      const toolsWithConfigOnly = new StainlessTools({
        sdkRepo: "https://github.com/org/repo.git",
        branch: "main",
        targetDir: "/test/target-dir",
        stainlessConfigFile: "/test/stainless.json",
      });

      await expect(toolsWithConfigOnly.clone()).rejects.toThrow("OpenAPI specification file is required");
    });

    it("publishes files with OpenAPI and config", async () => {
      // Mock directory does not exist
      mockGit.revparse.mockRejectedValue(new Error("not a git repo"));

      const toolsWithFiles = new StainlessTools({
        sdkRepo: "https://github.com/org/repo.git",
        branch: "main",
        targetDir: "/test/target-dir",
        openApiFile: "/test/openapi.json",
        stainlessConfigFile: "/test/stainless.json",
      });

      await toolsWithFiles.clone();

      expect(mockPublish).toHaveBeenCalledWith(
        expect.objectContaining({
          spec: expect.any(Buffer),
          config: expect.any(Buffer),
          branch: "main",
        }),
      );
    });

    it("handles clone failure", async () => {
      // Mock directory does not exist
      mockGit.revparse.mockRejectedValue(new Error("not a git repo"));

      // Mock clone failure
      mockGit.clone.mockRejectedValue(new Error("Clone failed"));

      // Mock getRemotes to return empty array to avoid existing repo path
      mockGit.getRemotes.mockResolvedValue([]);

      await expect(validTools.clone()).rejects.toThrow("Failed to clone SDK repository");
    });

    it("handles file publish failure", async () => {
      const toolsWithFiles = new StainlessTools({
        sdkRepo: "https://github.com/org/repo.git",
        branch: "main",
        targetDir: "/test/target-dir",
        openApiFile: "/test/openapi.json",
        stainlessConfigFile: "/test/stainless.json",
      });

      mockGit.log.mockResolvedValue({ latest: { hash: "abc123" } });
      mockPublish.mockRejectedValue(new Error("Publish failed"));

      await expect(toolsWithFiles.clone()).rejects.toThrow(StainlessError);
    });

    it("handles existing repository with same origin", async () => {
      // Mock directory exists and is a git repo
      mockGit.revparse.mockResolvedValue("/test/target-dir/.git");
      mockGit.getRemotes.mockResolvedValue([{ name: "origin", refs: { fetch: "https://github.com/org/repo.git" } }]);

      await validTools.clone();

      expect(mockGit.clone).not.toHaveBeenCalled();
      expect(mockGit.fetch).toHaveBeenCalled();
      expect(mockGit.checkout).toHaveBeenCalledWith("main");
      expect(mockGit.pull).toHaveBeenCalled();
    });

    it("throws error for existing repository with different origin", async () => {
      // Mock directory exists and is a git repo
      mockGit.revparse.mockResolvedValue("/test/target-dir/.git");
      mockGit.getRemotes.mockResolvedValue([{ name: "origin", refs: { fetch: "https://github.com/other/repo.git" } }]);

      await expect(validTools.clone()).rejects.toThrow(
        "Directory /test/target-dir contains a different repository (https://github.com/other/repo.git). " +
          "Expected https://github.com/org/repo.git. Please remove the directory manually and try again.",
      );
    });

    it("correctly compares SSH and HTTPS repository URLs", async () => {
      const sshTools = new StainlessTools({
        sdkRepo: "git@github.com:org/repo.git",
        branch: "main",
        targetDir: "/test/target-dir",
      });

      mockGit.revparse.mockResolvedValue("/test/target-dir/.git");
      mockGit.getRemotes.mockResolvedValue([{ name: "origin", refs: { fetch: "https://github.com/org/repo.git" } }]);

      await sshTools.clone();

      expect(mockGit.clone).not.toHaveBeenCalled();
      expect(mockGit.fetch).toHaveBeenCalled();
      expect(mockGit.checkout).toHaveBeenCalledWith("main");
    });
  });

  describe("hasNewChanges", () => {
    it("checks SDK repository for changes", async () => {
      const tools = new StainlessTools({
        sdkRepo: "https://github.com/org/repo.git",
        branch: "main",
        targetDir: "/test/target-dir",
      });

      // Mock initial clone with local hash
      mockGit.log.mockImplementation(async (params) => {
        if (!params || params.length === 0) {
          return { latest: { hash: "abc123" } }; // Local hash
        }
        return { latest: { hash: "abc123" } }; // Remote hash matches initially
      });

      await tools.clone();

      // Mock subsequent check with different remote hash
      mockGit.log.mockImplementation(async (params) => {
        if (!params || params.length === 0) {
          return { latest: { hash: "abc123" } }; // Local hash stays same
        }
        if (params[0] === "origin/main") {
          return { latest: { hash: "def456" } }; // Remote hash is different
        }
        return { latest: { hash: "" } };
      });

      const hasChanges = await tools.hasNewChanges();

      expect(hasChanges).toBe(true);
      expect(mockGit.fetch).toHaveBeenCalled();
    });

    it("detects no changes when hash is same", async () => {
      const tools = new StainlessTools({
        sdkRepo: "https://github.com/org/repo.git",
        branch: "main",
        targetDir: "/test/target-dir",
      });

      mockGit.log.mockResolvedValue({ latest: { hash: "abc123" } });
      await tools.clone();

      mockGit.log.mockResolvedValue({ latest: { hash: "abc123" } });
      const hasChanges = await tools.hasNewChanges();

      expect(hasChanges).toBe(false);
    });

    it("handles fetch errors", async () => {
      const tools = new StainlessTools({
        sdkRepo: "https://github.com/org/repo.git",
        branch: "main",
        targetDir: "/test/target-dir",
      });

      mockGit.log.mockResolvedValue({ latest: { hash: "abc123" } });
      await tools.clone();

      mockGit.fetch.mockRejectedValue(new Error("Fetch failed"));
      await expect(tools.hasNewChanges()).rejects.toThrow(StainlessError);
    });
  });

  describe("pullChanges", () => {
    let validTools: StainlessTools;
    let mockExit: any;
    let consoleSpy: any;

    beforeEach(() => {
      validTools = new StainlessTools({
        sdkRepo: "https://github.com/org/repo.git",
        branch: "main",
        targetDir: "/test/target-dir",
      });

      // Reset mock implementations
      mockGit.status.mockReset();
      mockGit.stash.mockReset();
      mockGit.pull.mockReset();
      mockGit.log.mockReset();

      // Set default successful responses
      mockGit.status.mockResolvedValue({ isClean: () => true });
      mockGit.stash.mockResolvedValue(undefined);
      mockGit.pull.mockResolvedValue(undefined);
      mockGit.log.mockResolvedValue({ latest: { hash: "abc123" } });

      // Mock process.exit and console.log
      mockExit = vi.spyOn(process, "exit").mockImplementation(() => undefined as never);
      consoleSpy = vi.spyOn(console, "log");
    });

    afterEach(() => {
      mockExit.mockRestore();
      consoleSpy.mockRestore();
    });

    it("pulls changes from clean repository", async () => {
      const tools = new StainlessTools({
        sdkRepo: "https://github.com/org/repo.git",
        branch: "main",
        targetDir: "/test/target-dir",
      });

      mockGit.status.mockResolvedValue({ isClean: () => true });
      mockGit.log.mockResolvedValue({ latest: { hash: "abc123" } });
      await tools.clone();
      await tools.pullChanges();

      expect(mockGit.stash).not.toHaveBeenCalled();
      expect(mockGit.pull).toHaveBeenCalled();
    });

    it("stashes and restores local changes when pulling", async () => {
      const tools = new StainlessTools({
        sdkRepo: "https://github.com/org/repo.git",
        branch: "main",
        targetDir: "/test/target-dir",
      });

      // Mock repository with local changes
      mockGit.status.mockResolvedValue({ isClean: () => false });
      mockGit.log.mockResolvedValue({ latest: { hash: "abc123" } });

      await tools.clone();
      await tools.pullChanges();

      expect(mockGit.stash).toHaveBeenCalledWith(["push", "-u", "-m", "Stashing changes before SDK update"]);
      expect(mockGit.pull).toHaveBeenCalled();
      expect(mockGit.stash).toHaveBeenCalledWith(["pop"]);
    });

    it("restores local changes even if pull fails", async () => {
      // Mock repository with local changes and pull failure
      mockGit.status.mockResolvedValue({ isClean: () => false });
      mockGit.pull.mockRejectedValue(new Error("Pull failed"));

      await validTools.pullChanges().catch(() => {});

      expect(mockGit.stash).toHaveBeenCalledWith(["push", "-u", "-m", "Stashing changes before SDK update"]);
      expect(mockGit.stash).toHaveBeenCalledWith(["pop"]);
      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining("Could not update to the latest SDK version"));
      expect(mockExit).toHaveBeenCalledWith(1);
    });

    it("handles stash conflicts by preserving changes and exiting", async () => {
      // Mock repository with local changes
      mockGit.status.mockResolvedValue({ isClean: () => false });
      mockGit.stash.mockImplementation(async (args) => {
        if (args[0] === "pop") {
          throw new Error("stash pop failed");
        }
        if (args[0] === "list") {
          return "stash@{0}: On main: stash message";
        }
        return undefined;
      });

      await validTools.pullChanges().catch(() => {});

      expect(mockGit.stash).toHaveBeenCalledWith(["push", "-u", "-m", "Stashing changes before SDK update"]);
      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining("Your changes are preserved in the stash"));
      expect(mockExit).toHaveBeenCalledWith(1);
    });

    it("handles pull failures by restoring changes and providing instructions", async () => {
      // Mock repository with local changes and pull failure
      mockGit.status.mockResolvedValue({ isClean: () => false });
      mockGit.pull.mockRejectedValue(new Error("pull failed"));

      await validTools.pullChanges().catch(() => {});

      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining("Could not update to the latest SDK version"));
      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining("To update manually:"));
      expect(mockExit).toHaveBeenCalledWith(1);
    });
  });

  describe("file watching", () => {
    it("starts watching files when specified", async () => {
      const tools = new StainlessTools({
        sdkRepo: "https://github.com/org/repo.git",
        branch: "main",
        targetDir: "/test/target-dir",
        openApiFile: "/test/openapi.json",
        stainlessConfigFile: "/test/stainless.json",
      });

      mockGit.log.mockResolvedValue({ latest: { hash: "abc123" } });
      await tools.clone();

      expect(watch).toHaveBeenCalledWith(["/test/openapi.json", "/test/stainless.json"], expect.any(Object));
      expect(mockWatcher.on).toHaveBeenCalledWith("change", expect.any(Function));
    });

    it("does not start watching when no files specified", async () => {
      const tools = new StainlessTools({
        sdkRepo: "https://github.com/org/repo.git",
        branch: "main",
        targetDir: "/test/target-dir",
      });

      mockGit.log.mockResolvedValue({ latest: { hash: "abc123" } });
      await tools.clone();

      expect(watch).not.toHaveBeenCalled();
    });

    it("publishes files when changes detected", async () => {
      const tools = new StainlessTools({
        sdkRepo: "https://github.com/org/repo.git",
        branch: "main",
        targetDir: "/test/target-dir",
        openApiFile: "/test/openapi.json",
        stainlessConfigFile: "/test/stainless.json",
      });

      mockGit.log.mockResolvedValue({ latest: { hash: "abc123" } });
      await tools.clone();

      // Get the change handler
      const changeHandler = mockWatcher.on.mock.calls.find((call) => call[0] === "change")?.[1];

      // Simulate a file change
      await changeHandler("/test/openapi.json");

      // Verify StainlessApi publish was called
      expect(mockPublish).toHaveBeenCalledWith({
        spec: expect.any(Buffer),
        config: expect.any(Buffer),
        branch: "main",
      });
    });

    it("stops watching files on cleanup", async () => {
      const tools = new StainlessTools({
        sdkRepo: "https://github.com/org/repo.git",
        branch: "main",
        targetDir: "/test/target-dir",
        openApiFile: "/test/openapi.json",
        stainlessConfigFile: "/test/stainless.json",
      });

      mockGit.log.mockResolvedValue({ latest: { hash: "abc123" } });
      await tools.clone();

      tools.cleanup();

      expect(mockWatcher.close).toHaveBeenCalled();
    });
  });

  describe("generateAndWatchSDK", () => {
    it("polls and pulls remote changes", async () => {
      const options = {
        sdkName: "test-sdk",
        sdkRepo: "https://github.com/org/repo.git",
        branch: "main",
        targetDir: "/test/target-dir",
        pollIntervalMs: 100, // Short interval for testing
      };

      // Spy on console.log
      const consoleSpy = vi.spyOn(console, "log");

      // Mock clean repository for successful pull
      mockGit.status.mockResolvedValue({ isClean: () => true });
      mockGit.log
        // For local branch
        .mockImplementation(async (params) => {
          if (!params || params.length === 0) {
            return { latest: { hash: "abc123" } }; // Local hash
          }
          // For remote branch
          if (params[0] === "origin/main") {
            return { latest: { hash: "def456" } }; // Remote hash
          }
          return { latest: { hash: "" } };
        });

      const cleanup = await generateAndWatchSDK(options);

      // Wait for a poll cycle
      await new Promise((resolve) => setTimeout(resolve, 150));

      // Verify that changes were pulled
      expect(mockGit.fetch).toHaveBeenCalled();
      expect(mockGit.pull).toHaveBeenCalledWith("origin", "main");

      // Verify console output
      expect(consoleSpy).toHaveBeenCalledWith("\nDetected new changes in SDK repository, pulling updates...");
      expect(consoleSpy).toHaveBeenCalledWith("✓ Successfully pulled latest SDK changes.");

      await cleanup();
      consoleSpy.mockRestore();
    });
  });
});
