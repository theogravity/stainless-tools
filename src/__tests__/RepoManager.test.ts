import simpleGit from "simple-git";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { LifecycleManager } from "../LifecycleManager.js";
import { RepoManager } from "../RepoManager.js";

vi.mock("simple-git");
vi.mock("../LifecycleManager.js");

type RepoManagerTestOptions = {
  sdkRepo: string;
  branch: string;
  targetDir: string;
  sdkName?: string;
  env?: string;
  lifecycleManager: LifecycleManager;
};

describe("RepoManager", () => {
  const mockLifecycleManager = {
    executePostClone: vi.fn(),
    executePostUpdate: vi.fn(),
    executePrePublishSpec: vi.fn(),
    config: {},
    executeCommand: vi.fn(),
  } as unknown as LifecycleManager;

  const defaultOptions: RepoManagerTestOptions = {
    sdkRepo: "git@github.com:org/repo.git",
    branch: "main",
    targetDir: "./sdks/test",
    sdkName: "test-sdk",
    env: "staging",
    lifecycleManager: mockLifecycleManager,
  };

  let mockGit: any;

  beforeEach(() => {
    // Reset mocks
    vi.clearAllMocks();

    // Setup git mock
    mockGit = {
      cwd: vi.fn(),
      init: vi.fn(),
      addRemote: vi.fn(),
      fetch: vi.fn(),
      branch: vi.fn(),
      checkout: vi.fn(),
      pull: vi.fn(),
      log: vi.fn(),
      status: vi.fn(),
      stash: vi.fn(),
      revparse: vi.fn(),
      getRemotes: vi.fn(),
    };
    (simpleGit as unknown as any).mockReturnValue(mockGit);
  });

  describe("cloneFreshRepo", () => {
    it("initializes repository and executes postClone", async () => {
      const manager = new RepoManager(defaultOptions);
      mockGit.branch.mockResolvedValue({ all: ["origin/main"] });
      mockGit.log.mockResolvedValue({ latest: { hash: "abc123" } });

      await manager["cloneFreshRepo"]("./sdks/test");

      expect(mockGit.init).toHaveBeenCalled();
      expect(mockGit.addRemote).toHaveBeenCalledWith("origin", defaultOptions.sdkRepo);
      expect(mockGit.checkout).toHaveBeenCalledWith(["-b", "main", "origin/main"]);
      expect(mockLifecycleManager.executePostClone).toHaveBeenCalledWith({
        sdkPath: "./sdks/test",
        branch: "main",
        sdkName: "test-sdk",
      });
    });

    it("does not execute postClone when sdkName is not provided", async () => {
      const optionsWithoutSdkName = {
        ...defaultOptions,
        sdkName: undefined,
      };

      const manager = new RepoManager(optionsWithoutSdkName);
      mockGit.branch.mockResolvedValue({ all: ["origin/main"] });
      mockGit.log.mockResolvedValue({ latest: { hash: "abc123" } });

      await manager["cloneFreshRepo"]("./sdks/test");

      expect(mockLifecycleManager.executePostClone).not.toHaveBeenCalled();
    });

    it("waits for branch if it does not exist", async () => {
      const manager = new RepoManager(defaultOptions);
      mockGit.branch
        .mockResolvedValueOnce({ all: [] }) // First call: branch doesn't exist
        .mockResolvedValueOnce({ all: ["origin/main"] }); // Second call: branch exists
      mockGit.log.mockResolvedValue({ latest: { hash: "abc123" } });

      await manager["cloneFreshRepo"]("./sdks/test");

      // The fetch is called:
      // 1. Initial fetch in cloneFreshRepo
      // 2. First check in waitForRemoteBranch
      // 3. Second check in waitForRemoteBranch that succeeds
      expect(mockGit.fetch).toHaveBeenCalledTimes(3);
      expect(mockGit.checkout).toHaveBeenCalledWith(["-b", "main", "origin/main"]);
    });
  });

  describe("pullChanges", () => {
    it("pulls changes and executes postUpdate", async () => {
      const manager = new RepoManager(defaultOptions);
      mockGit.status.mockResolvedValue({ isClean: () => true });
      mockGit.log
        .mockResolvedValueOnce({ latest: { hash: "abc123" } }) // old hash
        .mockResolvedValueOnce({ latest: { hash: "def456" } }); // new hash

      await manager.pullChanges();

      expect(mockGit.pull).toHaveBeenCalledWith("origin", "main");
      expect(mockLifecycleManager.executePostUpdate).toHaveBeenCalledWith({
        sdkPath: "./sdks/test",
        branch: "main",
        sdkName: "test-sdk",
      });
    });

    it("does not execute postUpdate when sdkName is not provided", async () => {
      const optionsWithoutSdkName = {
        ...defaultOptions,
        sdkName: undefined,
      };

      const manager = new RepoManager(optionsWithoutSdkName);
      mockGit.status.mockResolvedValue({ isClean: () => true });
      mockGit.log
        .mockResolvedValueOnce({ latest: { hash: "abc123" } })
        .mockResolvedValueOnce({ latest: { hash: "def456" } });

      await manager.pullChanges();

      expect(mockLifecycleManager.executePostUpdate).not.toHaveBeenCalled();
    });

    it("handles local changes by stashing and reapplying", async () => {
      const manager = new RepoManager(defaultOptions);
      mockGit.status.mockResolvedValue({ isClean: () => false });
      mockGit.log
        .mockResolvedValueOnce({ latest: { hash: "abc123" } })
        .mockResolvedValueOnce({ latest: { hash: "def456" } });

      await manager.pullChanges();

      expect(mockGit.stash).toHaveBeenCalledWith(["push", "-u", "-m", expect.any(String)]);
      expect(mockGit.pull).toHaveBeenCalledWith("origin", "main");
      expect(mockGit.stash).toHaveBeenCalledWith(["pop"]);
    });
  });

  // ... rest of the RepoManager tests that don't involve lifecycle hooks ...
});
