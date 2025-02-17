import { watch } from "chokidar";
import type { FSWatcher } from "chokidar";
import { execa } from "execa";
import mock from "mock-fs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { StainlessError } from "../StainlessError";
import { StainlessTools } from "../StainlessTools";

// Mock execa
vi.mock("execa", () => ({
  execa: vi.fn().mockResolvedValue({ stdout: "success", stderr: "" }),
}));

// Mock chokidar
vi.mock("chokidar", () => {
  const mockOn = vi.fn().mockReturnThis();
  const mockClose = vi.fn();

  return {
    watch: vi.fn().mockReturnValue({
      on: mockOn,
      close: mockClose,
    } as unknown as FSWatcher),
  };
});

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

// Mock simple-git
const mockGit = {
  clone: vi.fn(),
  cwd: vi.fn(),
  checkout: vi.fn(),
  log: vi.fn(),
  fetch: vi.fn(),
  pull: vi.fn(),
  status: vi.fn(),
  stash: vi.fn(),
  revparse: vi.fn(),
  getRemotes: vi.fn(),
};

vi.mock("simple-git", () => ({
  default: () => mockGit,
}));

// Get the mocked watch function for use in tests
const mockWatch = vi.mocked(watch);

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
    mockGit.status.mockReset();
    mockGit.stash.mockReset();
    mockGit.revparse.mockReset();
    mockGit.getRemotes.mockReset();
    vi.mocked(execa).mockReset();

    // Set default successful responses
    mockGit.status.mockResolvedValue({ isClean: () => true });
    mockGit.log.mockResolvedValue({ latest: { hash: "abc123" } });
    mockGit.clone.mockResolvedValue(undefined);
    mockGit.cwd.mockResolvedValue(undefined);
    mockGit.checkout.mockResolvedValue(undefined);
    mockGit.fetch.mockResolvedValue(undefined);
    mockGit.pull.mockResolvedValue(undefined);
    mockGit.revparse.mockResolvedValue(undefined);
    mockGit.getRemotes.mockResolvedValue([{ name: "origin", refs: { fetch: "git@ssh.github.com:org/repo.git" } }]);

    // Setup mock filesystem
    mock({
      "/test": {},
      "/test/target-dir": {},
      "/test/openapi.json": '{"openapi": "3.0.0"}',
      "/test/stainless-tools.json": '{"name": "test-api"}',
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
          stainlessConfigFile: "/test/stainless-tools.json",
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
        sdkRepo: "git@ssh.github.com:org/repo.git",
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
      mockGit.getRemotes.mockResolvedValue([{ name: "origin", refs: { fetch: "git@ssh.github.com:org/repo.git" } }]);

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

      expect(mockGit.clone).toHaveBeenCalledWith("git@ssh.github.com:org/repo.git", "/test/target-dir");
      expect(mockGit.checkout).toHaveBeenCalledWith("main");
    });

    it("publishes files when specified", async () => {
      // Mock directory does not exist
      mockGit.revparse.mockRejectedValue(new Error("not a git repo"));

      const toolsWithFiles = new StainlessTools({
        sdkRepo: "git@ssh.github.com:org/repo.git",
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
        sdkRepo: "git@ssh.github.com:org/repo.git",
        branch: "main",
        targetDir: "/test/target-dir",
        stainlessConfigFile: "/test/stainless-tools.json",
      });

      await expect(toolsWithConfigOnly.clone()).rejects.toThrow("OpenAPI specification file is required");
    });

    it("publishes files with OpenAPI and config", async () => {
      // Mock directory does not exist
      mockGit.revparse.mockRejectedValue(new Error("not a git repo"));

      const toolsWithFiles = new StainlessTools({
        sdkRepo: "git@ssh.github.com:org/repo.git",
        branch: "main",
        targetDir: "/test/target-dir",
        openApiFile: "/test/openapi.json",
        stainlessConfigFile: "/test/stainless-tools.json",
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
        sdkRepo: "git@ssh.github.com:org/repo.git",
        branch: "main",
        targetDir: "/test/target-dir",
        openApiFile: "/test/openapi.json",
        stainlessConfigFile: "/test/stainless-tools.json",
      });

      mockGit.log.mockResolvedValue({ latest: { hash: "abc123" } });
      mockPublish.mockRejectedValue(new Error("Publish failed"));

      await expect(toolsWithFiles.clone()).rejects.toThrow(StainlessError);
    });

    it("handles existing repository with same origin", async () => {
      // Mock directory exists and is a git repo
      mockGit.revparse.mockResolvedValue("/test/target-dir/.git");
      mockGit.getRemotes.mockResolvedValue([{ name: "origin", refs: { fetch: "git@ssh.github.com:org/repo.git" } }]);

      await validTools.clone();

      expect(mockGit.clone).not.toHaveBeenCalled();
      expect(mockGit.fetch).toHaveBeenCalled();
      expect(mockGit.checkout).toHaveBeenCalledWith("main");
      expect(mockGit.pull).toHaveBeenCalled();
    });

    it("throws error for existing repository with different origin", async () => {
      // Mock directory exists and is a git repo
      mockGit.revparse.mockResolvedValue("/test/target-dir/.git");
      mockGit.getRemotes.mockResolvedValue([{ name: "origin", refs: { fetch: "git@ssh.github.com:other/repo.git" } }]);

      await expect(validTools.clone()).rejects.toThrow(
        "Directory /test/target-dir contains a different repository (git@ssh.github.com:other/repo.git). " +
          "Expected git@ssh.github.com:org/repo.git. Please remove the directory manually and try again.",
      );
    });

    it("correctly compares SSH and HTTPS repository URLs", async () => {
      const sshTools = new StainlessTools({
        sdkRepo: "git@github.com:org/repo.git",
        branch: "main",
        targetDir: "/test/target-dir",
      });

      mockGit.revparse.mockResolvedValue("/test/target-dir/.git");
      mockGit.getRemotes.mockResolvedValue([{ name: "origin", refs: { fetch: "git@github.com:org/repo.git" } }]);

      await sshTools.clone();

      expect(mockGit.clone).not.toHaveBeenCalled();
      expect(mockGit.fetch).toHaveBeenCalled();
      expect(mockGit.checkout).toHaveBeenCalledWith("main");
    });

    it("correctly compares SSH protocol URLs with ports", async () => {
      // Test with git@ format against ssh:// format
      const sshTools = new StainlessTools({
        sdkRepo: "git@ssh.github.com:org/repo.git",
        branch: "main",
        targetDir: "/test/target-dir",
      });

      mockGit.revparse.mockResolvedValue("/test/target-dir/.git");
      mockGit.getRemotes.mockResolvedValue([
        { name: "origin", refs: { fetch: "ssh://git@ssh.github.com:443/org/repo.git" } },
      ]);

      await sshTools.clone();

      expect(mockGit.clone).not.toHaveBeenCalled();
      expect(mockGit.fetch).toHaveBeenCalled();
      expect(mockGit.checkout).toHaveBeenCalledWith("main");

      // Test with ssh:// format against git@ format
      const sshProtocolTools = new StainlessTools({
        sdkRepo: "ssh://git@ssh.github.com:443/org/repo.git",
        branch: "main",
        targetDir: "/test/target-dir",
      });

      mockGit.getRemotes.mockResolvedValue([{ name: "origin", refs: { fetch: "git@ssh.github.com:org/repo.git" } }]);

      await sshProtocolTools.clone();

      expect(mockGit.clone).not.toHaveBeenCalled();
      expect(mockGit.fetch).toHaveBeenCalled();
      expect(mockGit.checkout).toHaveBeenCalledWith("main");
    });

    it("executes postClone command when configured", async () => {
      // Mock directory does not exist
      mockGit.revparse.mockRejectedValue(new Error("not a git repo"));

      // Mock execa to return some output
      vi.mocked(execa).mockResolvedValue({
        stdout: Buffer.from("Installing dependencies...\nBuild complete"),
        stderr: Buffer.from("Some warning message"),
        exitCode: 0,
        failed: false,
        killed: false,
        command: "",
        timedOut: false,
        isCanceled: false,
        escapedCommand: "",
        cwd: "/test/target-dir",
        all: undefined,
      });

      const toolsWithLifecycle = new StainlessTools({
        sdkRepo: "git@ssh.github.com:org/repo.git",
        branch: "main",
        targetDir: "/test/target-dir",
        sdkName: "typescript",
        lifecycle: {
          typescript: {
            postClone: "npm install && npm run build",
          },
        },
      });

      const consoleSpy = vi.spyOn(console, "log");
      const consoleErrorSpy = vi.spyOn(console, "error");

      await toolsWithLifecycle.clone();

      expect(execa).toHaveBeenCalledWith(
        "npm install && npm run build",
        expect.objectContaining({
          shell: true,
        }),
      );

      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining("Executing postClone command: npm install && npm run build"));
      expect(consoleSpy).toHaveBeenCalledWith("Installing dependencies...\nBuild complete");
      expect(consoleErrorSpy).toHaveBeenCalledWith("Some warning message");
      expect(consoleSpy).toHaveBeenCalledWith("✓ Successfully executed postClone command");

      consoleSpy.mockRestore();
      consoleErrorSpy.mockRestore();
    });

    it("skips postClone command when sdkName doesn't match", async () => {
      // Mock directory does not exist
      mockGit.revparse.mockRejectedValue(new Error("not a git repo"));

      const toolsWithLifecycle = new StainlessTools({
        sdkRepo: "git@ssh.github.com:org/repo.git",
        branch: "main",
        targetDir: "/test/target-dir",
        sdkName: "python",
        lifecycle: {
          typescript: {
            postClone: "npm install && npm run build",
          },
        },
      });

      await toolsWithLifecycle.clone();

      expect(execa).not.toHaveBeenCalled();
    });

    it("handles postClone command failure", async () => {
      // Mock directory does not exist
      mockGit.revparse.mockRejectedValue(new Error("not a git repo"));

      // Mock execa to fail
      vi.mocked(execa).mockRejectedValue(new Error("Command failed"));

      const toolsWithLifecycle = new StainlessTools({
        sdkRepo: "git@ssh.github.com:org/repo.git",
        branch: "main",
        targetDir: "/test/target-dir",
        sdkName: "typescript",
        lifecycle: {
          typescript: {
            postClone: "npm install && npm run build",
          },
        },
      });

      await expect(toolsWithLifecycle.clone()).rejects.toThrow("Failed to execute postClone command");
      expect(execa).toHaveBeenCalledWith(
        "npm install && npm run build",
        expect.objectContaining({
          shell: true,
        }),
      );
    });

    it("executes postClone command after updating existing repo", async () => {
      // Mock directory exists and is a git repo
      mockGit.revparse.mockResolvedValue("git-dir");
      mockGit.getRemotes.mockResolvedValue([{ name: "origin", refs: { fetch: "git@ssh.github.com:org/repo.git" } }]);

      const toolsWithLifecycle = new StainlessTools({
        sdkRepo: "git@ssh.github.com:org/repo.git",
        branch: "main",
        targetDir: "/test/target-dir",
        sdkName: "typescript",
        lifecycle: {
          typescript: {
            postClone: "npm install && npm run build",
          },
        },
      });

      await toolsWithLifecycle.clone();

      // postClone should not be called for existing repos
      expect(execa).not.toHaveBeenCalled();
    });

    it("executes postClone command with environment variables", async () => {
      // Mock directory does not exist
      mockGit.revparse.mockRejectedValue(new Error("not a git repo"));

      // Mock execa to return some output
      vi.mocked(execa).mockResolvedValue({
        stdout: Buffer.from("/test/target-dir"),
        stderr: Buffer.from(""),
        exitCode: 0,
        failed: false,
        killed: false,
        command: "",
        timedOut: false,
        isCanceled: false,
        escapedCommand: "",
        cwd: "/test/target-dir",
        all: undefined,
      });

      const toolsWithLifecycle = new StainlessTools({
        sdkRepo: "git@ssh.github.com:org/repo.git",
        branch: "main",
        targetDir: "/test/target-dir",
        sdkName: "typescript",
        lifecycle: {
          typescript: {
            postClone: "echo $STAINLESS_TOOLS_SDK_PATH",
          },
        },
      });

      const consoleSpy = vi.spyOn(console, "log");
      const consoleErrorSpy = vi.spyOn(console, "error");

      await toolsWithLifecycle.clone();

      expect(execa).toHaveBeenCalledWith(
        "echo $STAINLESS_TOOLS_SDK_PATH",
        expect.objectContaining({
          shell: true,
          env: {
            STAINLESS_TOOLS_SDK_PATH: "/test/target-dir",
            STAINLESS_TOOLS_SDK_BRANCH: "main",
            STAINLESS_TOOLS_SDK_REPO_NAME: "typescript",
          },
        }),
      );

      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining("Executing postClone command: echo $STAINLESS_TOOLS_SDK_PATH"));
      expect(consoleSpy).toHaveBeenCalledWith("/test/target-dir");
      expect(consoleSpy).toHaveBeenCalledWith("✓ Successfully executed postClone command");

      consoleSpy.mockRestore();
      consoleErrorSpy.mockRestore();
    });
  });

  describe("hasNewChanges", () => {
    it("checks SDK repository for changes", async () => {
      const tools = new StainlessTools({
        sdkRepo: "git@ssh.github.com:org/repo.git",
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
        sdkRepo: "git@ssh.github.com:org/repo.git",
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
        sdkRepo: "git@ssh.github.com:org/repo.git",
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
        sdkRepo: "git@ssh.github.com:org/repo.git",
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
        sdkRepo: "git@ssh.github.com:org/repo.git",
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
        sdkRepo: "git@ssh.github.com:org/repo.git",
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

    it("executes postUpdate command after pulling changes", async () => {
      // Mock execa to return some output
      vi.mocked(execa).mockResolvedValue({
        stdout: Buffer.from("Build complete"),
        stderr: Buffer.from(""),
        exitCode: 0,
        failed: false,
        killed: false,
        command: "",
        timedOut: false,
        isCanceled: false,
        escapedCommand: "",
        cwd: "/test/target-dir",
        all: undefined,
      });

      const tools = new StainlessTools({
        sdkRepo: "git@ssh.github.com:org/repo.git",
        branch: "main",
        targetDir: "/test/target-dir",
        sdkName: "typescript",
        lifecycle: {
          typescript: {
            postUpdate: "npm run build",
          },
        },
      });

      const consoleSpy = vi.spyOn(console, "log");
      const consoleErrorSpy = vi.spyOn(console, "error");

      await tools.pullChanges();

      expect(mockGit.pull).toHaveBeenCalled();
      expect(execa).toHaveBeenCalledWith(
        "npm run build",
        expect.objectContaining({
          shell: true,
        }),
      );

      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining("Executing postUpdate command: npm run build"));
      expect(consoleSpy).toHaveBeenCalledWith("Build complete");
      expect(consoleSpy).toHaveBeenCalledWith("✓ Successfully executed postUpdate command");

      consoleSpy.mockRestore();
      consoleErrorSpy.mockRestore();
    });

    it("skips postUpdate command when sdkName doesn't match", async () => {
      const tools = new StainlessTools({
        sdkRepo: "git@ssh.github.com:org/repo.git",
        branch: "main",
        targetDir: "/test/target-dir",
        sdkName: "python",
        lifecycle: {
          typescript: {
            postClone: "npm install",
            postUpdate: "npm run build",
          },
        },
      });

      await tools.pullChanges();

      expect(mockGit.pull).toHaveBeenCalled();
      expect(execa).not.toHaveBeenCalled();
    });

    it("handles postUpdate command failure", async () => {
      // Mock execa to fail
      vi.mocked(execa).mockRejectedValue(new Error("Command failed"));

      const tools = new StainlessTools({
        sdkRepo: "git@ssh.github.com:org/repo.git",
        branch: "main",
        targetDir: "/test/target-dir",
        sdkName: "typescript",
        lifecycle: {
          typescript: {
            postClone: "npm install",
            postUpdate: "npm run build",
          },
        },
      });

      await expect(tools.pullChanges()).rejects.toThrow("Failed to execute postUpdate command");
      expect(execa).toHaveBeenCalledWith(
        "npm run build",
        expect.objectContaining({
          shell: true,
        }),
      );
    });

    it("executes postUpdate command after restoring stashed changes", async () => {
      // Mock repository with local changes
      mockGit.status.mockResolvedValue({ isClean: () => false });

      // Mock execa to return some output
      vi.mocked(execa).mockResolvedValue({
        stdout: Buffer.from("Build complete"),
        stderr: Buffer.from(""),
        exitCode: 0,
        failed: false,
        killed: false,
        command: "",
        timedOut: false,
        isCanceled: false,
        escapedCommand: "",
        cwd: "/test/target-dir",
        all: undefined,
      });

      const tools = new StainlessTools({
        sdkRepo: "git@ssh.github.com:org/repo.git",
        branch: "main",
        targetDir: "/test/target-dir",
        sdkName: "typescript",
        lifecycle: {
          typescript: {
            postClone: "npm install",
            postUpdate: "npm run build",
          },
        },
      });

      const consoleSpy = vi.spyOn(console, "log");
      const consoleErrorSpy = vi.spyOn(console, "error");

      await tools.pullChanges();

      expect(mockGit.stash).toHaveBeenCalledWith(["push", "-u", "-m", "Stashing changes before SDK update"]);
      expect(mockGit.pull).toHaveBeenCalled();
      expect(execa).toHaveBeenCalledWith(
        "npm run build",
        expect.objectContaining({
          shell: true,
        }),
      );
      expect(mockGit.stash).toHaveBeenCalledWith(["pop"]);

      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining("Executing postUpdate command: npm run build"));
      expect(consoleSpy).toHaveBeenCalledWith("Build complete");
      expect(consoleSpy).toHaveBeenCalledWith("✓ Successfully executed postUpdate command");

      consoleSpy.mockRestore();
      consoleErrorSpy.mockRestore();
    });

    it("works with no lifecycle hooks configured", async () => {
      // Mock directory does not exist
      mockGit.revparse.mockRejectedValue(new Error("not a git repo"));

      const tools = new StainlessTools({
        sdkRepo: "git@ssh.github.com:org/repo.git",
        branch: "main",
        targetDir: "/test/target-dir",
        sdkName: "typescript",
        lifecycle: {
          typescript: {},
        },
      });

      await tools.clone();
      await tools.pullChanges();

      expect(mockGit.clone).toHaveBeenCalled();
      expect(mockGit.pull).toHaveBeenCalled();
      expect(execa).not.toHaveBeenCalled();
    });

    it("works with no lifecycle configuration at all", async () => {
      // Mock directory does not exist
      mockGit.revparse.mockRejectedValue(new Error("not a git repo"));

      const tools = new StainlessTools({
        sdkRepo: "git@ssh.github.com:org/repo.git",
        branch: "main",
        targetDir: "/test/target-dir",
        sdkName: "typescript",
      });

      await tools.clone();
      await tools.pullChanges();

      expect(mockGit.clone).toHaveBeenCalled();
      expect(mockGit.pull).toHaveBeenCalled();
      expect(execa).not.toHaveBeenCalled();
    });

    it("executes postUpdate command with environment variables", async () => {
      // Mock execa to return some output
      vi.mocked(execa).mockResolvedValue({
        stdout: Buffer.from("python"),
        stderr: Buffer.from(""),
        exitCode: 0,
        failed: false,
        killed: false,
        command: "",
        timedOut: false,
        isCanceled: false,
        escapedCommand: "",
        cwd: "/test/target-dir",
        all: undefined,
      });

      const tools = new StainlessTools({
        sdkRepo: "git@ssh.github.com:org/repo.git",
        branch: "feature/test",
        targetDir: "/test/target-dir",
        sdkName: "python",
        lifecycle: {
          python: {
            postUpdate: "echo $STAINLESS_TOOLS_SDK_REPO_NAME",
          },
        },
      });

      const consoleSpy = vi.spyOn(console, "log");
      const consoleErrorSpy = vi.spyOn(console, "error");

      await tools.pullChanges();

      expect(mockGit.pull).toHaveBeenCalled();
      expect(execa).toHaveBeenCalledWith(
        "echo $STAINLESS_TOOLS_SDK_REPO_NAME",
        expect.objectContaining({
          shell: true,
          env: {
            STAINLESS_TOOLS_SDK_PATH: "/test/target-dir",
            STAINLESS_TOOLS_SDK_BRANCH: "feature/test",
            STAINLESS_TOOLS_SDK_REPO_NAME: "python",
          },
        }),
      );

      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining("Executing postUpdate command: echo $STAINLESS_TOOLS_SDK_REPO_NAME"));
      expect(consoleSpy).toHaveBeenCalledWith("python");
      expect(consoleSpy).toHaveBeenCalledWith("✓ Successfully executed postUpdate command");

      consoleSpy.mockRestore();
      consoleErrorSpy.mockRestore();
    });

    it("executes postUpdate command with output logging", async () => {
      // Mock execa to return some output
      vi.mocked(execa).mockResolvedValue({
        stdout: Buffer.from("Rebuilding...\nBuild complete"),
        stderr: Buffer.from("Some warning during build"),
        exitCode: 0,
        failed: false,
        killed: false,
        command: "",
        timedOut: false,
        isCanceled: false,
        escapedCommand: "",
        cwd: "/test/target-dir",
        all: undefined,
      });

      const tools = new StainlessTools({
        sdkRepo: "git@ssh.github.com:org/repo.git",
        branch: "feature/test",
        targetDir: "/test/target-dir",
        sdkName: "typescript",
        lifecycle: {
          typescript: {
            postUpdate: "npm run build",
          },
        },
      });

      const consoleSpy = vi.spyOn(console, "log");
      const consoleErrorSpy = vi.spyOn(console, "error");

      await tools.pullChanges();

      expect(mockGit.pull).toHaveBeenCalled();
      expect(execa).toHaveBeenCalledWith(
        "npm run build",
        expect.objectContaining({
          shell: true,
          env: {
            STAINLESS_TOOLS_SDK_PATH: "/test/target-dir",
            STAINLESS_TOOLS_SDK_BRANCH: "feature/test",
            STAINLESS_TOOLS_SDK_REPO_NAME: "typescript",
          },
        }),
      );

      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining("Executing postUpdate command: npm run build"));
      expect(consoleSpy).toHaveBeenCalledWith("Rebuilding...\nBuild complete");
      expect(consoleErrorSpy).toHaveBeenCalledWith("Some warning during build");
      expect(consoleSpy).toHaveBeenCalledWith("✓ Successfully executed postUpdate command");

      consoleSpy.mockRestore();
      consoleErrorSpy.mockRestore();
    });
  });

  describe("file watching", () => {
    it("starts watching files when specified", async () => {
      const tools = new StainlessTools({
        sdkRepo: "git@ssh.github.com:org/repo.git",
        branch: "main",
        targetDir: "/test/target-dir",
        openApiFile: "/test/openapi.json",
        stainlessConfigFile: "/test/stainless-tools.json",
      });

      mockGit.log.mockResolvedValue({ latest: { hash: "abc123" } });
      await tools.clone();

      expect(mockWatch).toHaveBeenCalledWith(["/test/openapi.json", "/test/stainless-tools.json"], expect.any(Object));
      expect(mockWatch.mock.results[0].value.on).toHaveBeenCalledWith("change", expect.any(Function));
    });

    it("does not start watching when no files specified", async () => {
      const tools = new StainlessTools({
        sdkRepo: "git@ssh.github.com:org/repo.git",
        branch: "main",
        targetDir: "/test/target-dir",
      });

      mockGit.log.mockResolvedValue({ latest: { hash: "abc123" } });
      await tools.clone();

      expect(mockWatch).not.toHaveBeenCalled();
    });

    it("publishes files when changes detected", async () => {
      const tools = new StainlessTools({
        sdkRepo: "git@ssh.github.com:org/repo.git",
        branch: "main",
        targetDir: "/test/target-dir",
        openApiFile: "/test/openapi.json",
        stainlessConfigFile: "/test/stainless-tools.json",
      });

      mockGit.log.mockResolvedValue({ latest: { hash: "abc123" } });
      await tools.clone();

      // Get the change handler
      const mockWatcher = mockWatch.mock.results[0].value;
      const [[, changeHandler]] = mockWatcher.on.mock.calls;

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
        sdkRepo: "git@ssh.github.com:org/repo.git",
        branch: "main",
        targetDir: "/test/target-dir",
        openApiFile: "/test/openapi.json",
        stainlessConfigFile: "/test/stainless-tools.json",
      });

      mockGit.log.mockResolvedValue({ latest: { hash: "abc123" } });
      await tools.clone();

      tools.cleanup();

      const mockWatcher = mockWatch.mock.results[0].value;
      expect(mockWatcher.close).toHaveBeenCalled();
    });
  });

  describe("getTargetDir", () => {
    it("replaces {sdk} with SDK name", () => {
      const tools = new StainlessTools({
        sdkRepo: "git@github.com:org/repo.git",
        branch: "main",
        targetDir: "./sdks/{sdk}",
        sdkName: "typescript",
      });

      // @ts-expect-error accessing private method for testing
      expect(tools.getTargetDir()).toBe("./sdks/typescript");
    });

    it("replaces {env} with environment", () => {
      const tools = new StainlessTools({
        sdkRepo: "git@github.com:org/repo.git",
        branch: "main",
        targetDir: "./sdks/{env}/{sdk}",
        sdkName: "typescript",
        env: "staging",
      });

      // @ts-expect-error accessing private method for testing
      expect(tools.getTargetDir()).toBe("./sdks/staging/typescript");
    });

    it("replaces {branch} with branch name, converting slashes to hyphens", () => {
      const tools = new StainlessTools({
        sdkRepo: "git@github.com:org/repo.git",
        branch: "feature/auth",
        targetDir: "./sdks/{branch}",
      });

      // @ts-expect-error accessing private method for testing
      expect(tools.getTargetDir()).toBe("./sdks/feature-auth");
    });

    it("handles complex branch names with multiple slashes", () => {
      const tools = new StainlessTools({
        sdkRepo: "git@github.com:org/repo.git",
        branch: "users/theo/feature/auth",
        targetDir: "./sdks/{branch}",
      });

      // @ts-expect-error accessing private method for testing
      expect(tools.getTargetDir()).toBe("./sdks/users-theo-feature-auth");
    });

    it("handles all template variables together", () => {
      const tools = new StainlessTools({
        sdkRepo: "git@github.com:org/repo.git",
        branch: "users/theo/dev",
        targetDir: "./sdks/{env}/{sdk}/{branch}",
        sdkName: "typescript",
        env: "staging",
      });

      // @ts-expect-error accessing private method for testing
      expect(tools.getTargetDir()).toBe("./sdks/staging/typescript/users-theo-dev");
    });

    it("leaves targetDir unchanged when no template variables used", () => {
      const tools = new StainlessTools({
        sdkRepo: "git@github.com:org/repo.git",
        branch: "main",
        targetDir: "./sdks/typescript",
      });

      // @ts-expect-error accessing private method for testing
      expect(tools.getTargetDir()).toBe("./sdks/typescript");
    });
  });
});
