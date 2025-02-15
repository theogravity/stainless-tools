import { watch } from "chokidar";
import mock from "mock-fs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { generateAndWatchSDK } from "../lib";

// Mock chokidar
vi.mock("chokidar", () => ({
  watch: vi.fn().mockReturnValue({
    on: vi.fn().mockReturnThis(),
    close: vi.fn(),
  }),
}));

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
const mockWatcher = {
  on: vi.fn(),
  close: vi.fn(),
};

describe("generateAndWatchSDK", () => {
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
    });
  });

  afterEach(() => {
    mock.restore();
  });

  it("polls and pulls remote changes", async () => {
    const options = {
      sdkName: "test-sdk",
      sdkRepo: "git@ssh.github.com:org/repo.git",
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

    // Clean up
    cleanup();
  });
});
