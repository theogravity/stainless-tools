import * as fs from "node:fs/promises";
import * as chokidar from "chokidar";
import type { Ora } from "ora";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FileWatcher } from "../FileWatcher";
import type { StainlessApi } from "../StainlessApi";
import { StainlessError } from "../StainlessError";

vi.mock("node:fs/promises");
vi.mock("chokidar");

describe("FileWatcher", () => {
  const mockPublish = vi.fn().mockImplementation(() => Promise.resolve());
  const mockStainlessApi = {
    publish: mockPublish,
  } as unknown as StainlessApi;

  const mockSpinner = {
    start: vi.fn(),
    stop: vi.fn(),
    text: "",
    prefixText: "",
    suffixText: "",
    color: "white",
    indent: 0,
    spinner: { interval: 100, frames: [] },
    isSpinning: false,
    isSilent: false,
    isEnabled: true,
    frame: () => "",
    clear: vi.fn(),
    render: vi.fn(),
    succeed: vi.fn(),
    fail: vi.fn(),
    warn: vi.fn(),
    info: vi.fn(),
    stopAndPersist: vi.fn(),
    isDiscrete: false,
  } as unknown as Ora;

  const defaultOptions = {
    openApiFile: "openapi.yaml",
    stainlessConfigFile: "stainless.config.json",
    branch: "main",
    stainlessApi: mockStainlessApi,
    spinner: mockSpinner,
  };

  let watcher: FileWatcher;
  let mockFsWatcher: any;

  beforeEach(() => {
    vi.clearAllMocks();
    mockFsWatcher = {
      on: vi.fn(),
      close: vi.fn(),
    };
    vi.mocked(chokidar.watch).mockReturnValue(mockFsWatcher);
    watcher = new FileWatcher(defaultOptions);
  });

  afterEach(() => {
    watcher.stop();
  });

  describe("start", () => {
    it("should not start watching if no files are specified", () => {
      const emptyWatcher = new FileWatcher({
        ...defaultOptions,
        openApiFile: undefined,
        stainlessConfigFile: undefined,
      });
      emptyWatcher.start();
      expect(chokidar.watch).not.toHaveBeenCalled();
    });

    it("should start watching specified files", () => {
      watcher.start();
      expect(chokidar.watch).toHaveBeenCalledWith(
        [defaultOptions.openApiFile, defaultOptions.stainlessConfigFile],
        expect.any(Object),
      );
    });

    it("should handle file changes", async () => {
      const mockPublish = vi.spyOn(watcher, "publishFiles").mockResolvedValue();
      watcher.start();

      // Get the change callback
      const [[, changeCallback]] = mockFsWatcher.on.mock.calls.filter(([event]) => event === "change");
      await changeCallback("openapi.yaml");

      expect(mockSpinner.stop).toHaveBeenCalled();
      expect(mockPublish).toHaveBeenCalled();
      expect(mockSpinner.start).toHaveBeenCalledWith("Listening for new SDK updates...");
    });

    it("should handle file change errors", async () => {
      const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
      const mockError = new Error("Test error");
      vi.spyOn(watcher, "publishFiles").mockRejectedValue(mockError);
      watcher.start();

      // Get the change callback
      const [[, changeCallback]] = mockFsWatcher.on.mock.calls.filter(([event]) => event === "change");
      await changeCallback("openapi.yaml");

      expect(consoleErrorSpy).toHaveBeenCalledWith("Failed to publish changes:", mockError);
    });
  });

  describe("stop", () => {
    it("should stop watching files", () => {
      watcher.start();
      watcher.stop();
      expect(mockFsWatcher.close).toHaveBeenCalled();
    });

    it("should handle multiple stop calls safely", () => {
      watcher.stop();
      watcher.stop();
      expect(mockFsWatcher.close).not.toHaveBeenCalled();
    });
  });

  describe("publishFiles", () => {
    it("should throw error if OpenAPI file is not specified", async () => {
      const noOpenApiWatcher = new FileWatcher({
        ...defaultOptions,
        openApiFile: undefined,
      });

      await expect(noOpenApiWatcher.publishFiles()).rejects.toThrow("OpenAPI specification file is required");
    });

    it("should publish OpenAPI spec without config", async () => {
      const specContent = Buffer.from("spec content");
      vi.mocked(fs.readFile).mockResolvedValueOnce(specContent);

      const singleFileWatcher = new FileWatcher({
        ...defaultOptions,
        stainlessConfigFile: undefined,
      });

      await singleFileWatcher.publishFiles();

      expect(mockStainlessApi.publish).toHaveBeenCalledWith({
        spec: specContent,
        config: undefined,
        branch: defaultOptions.branch,
      });
    });

    it("should publish both OpenAPI spec and config", async () => {
      const specContent = Buffer.from("spec content");
      const configContent = Buffer.from("config content");
      vi.mocked(fs.readFile).mockResolvedValueOnce(specContent).mockResolvedValueOnce(configContent);

      await watcher.publishFiles();

      expect(mockStainlessApi.publish).toHaveBeenCalledWith({
        spec: specContent,
        config: configContent,
        branch: defaultOptions.branch,
      });
      expect(mockSpinner.start).toHaveBeenCalledWith("Listening for new SDK updates...");
    });

    it("should handle OpenAPI file read error", async () => {
      const error = new Error("File read error");
      vi.mocked(fs.readFile).mockRejectedValueOnce(error);

      await expect(watcher.publishFiles()).rejects.toThrow(
        `Failed to read OpenAPI file (${defaultOptions.openApiFile})`,
      );
    });

    it("should handle config file read error", async () => {
      const specContent = Buffer.from("spec content");
      const error = new Error("Config read error");
      vi.mocked(fs.readFile).mockResolvedValueOnce(specContent).mockRejectedValueOnce(error);

      await expect(watcher.publishFiles()).rejects.toThrow(
        `Failed to read Stainless config file (${defaultOptions.stainlessConfigFile})`,
      );
    });

    it("should handle publish API error", async () => {
      const specContent = Buffer.from("spec content");
      const configContent = Buffer.from("config content");
      vi.mocked(fs.readFile).mockResolvedValueOnce(specContent).mockResolvedValueOnce(configContent);

      const apiError = new StainlessError("API Error");
      mockPublish.mockRejectedValueOnce(apiError);

      await expect(watcher.publishFiles()).rejects.toThrow(apiError);
    });
  });
});
