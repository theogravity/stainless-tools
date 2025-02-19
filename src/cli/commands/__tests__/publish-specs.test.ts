import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Mock } from "vitest";
import { StainlessApi } from "../../../StainlessApi.js";
import { StainlessError } from "../../../StainlessError.js";
import * as utils from "../../utils.js";
import { createPublishSpecsCommand, publishSpecsAction } from "../publish-specs.js";

vi.mock("../../../StainlessApi.js");
vi.mock("../../utils.js");

const mockValidateAndProcessOptions = utils.validateAndProcessOptions as Mock;
const mockReadFileContents = utils.readFileContents as Mock;

describe("publish-specs command", () => {
  it("should create command with correct name and description", () => {
    const command = createPublishSpecsCommand();
    expect(command.name()).toBe("publish-specs");
    expect(command.description()).toBe("Publish SDK specifications to Stainless");
  });

  it("should have required options", () => {
    const command = createPublishSpecsCommand();
    const options = command.options;
    expect(options.find((o) => o.short === "-b")).toBeDefined();
    expect(options.find((o) => o.short === "-t")).toBeDefined();
    expect(options.find((o) => o.short === "-o")).toBeDefined();
    expect(options.find((o) => o.short === "-c")).toBeDefined();
    expect(options.find((o) => o.short === "-s")).toBeDefined();
    expect(options.find((o) => o.short === "-p")).toBeDefined();
    expect(options.find((o) => o.short === "-g")).toBeDefined();
    expect(options.find((o) => o.long === "--prod")).toBeDefined();
  });

  it("should have required arguments", () => {
    const command = createPublishSpecsCommand();
    const usage = command.usage();
    expect(usage).toContain("<sdk-name>");
  });
});

describe("publishSpecsAction", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockValidateAndProcessOptions.mockReset();
    mockReadFileContents.mockReset();
    vi.spyOn(StainlessApi.prototype, "publish").mockResolvedValue(undefined);
  });

  it("should handle validation errors", async () => {
    mockValidateAndProcessOptions.mockRejectedValue(new StainlessError("Validation error"));

    const exitCode = await publishSpecsAction("test-sdk", {
      branch: "main",
      targetDir: ".",
      "open-api-file": "openapi.json",
    });

    expect(exitCode).toBe(1);
    expect(StainlessApi.prototype.publish).not.toHaveBeenCalled();
  });

  it("publishes SDK specifications with default configuration", async () => {
    mockValidateAndProcessOptions.mockResolvedValue({
      branch: "main",
      openApiFile: "openapi.json",
      projectName: "test-project",
      guessConfig: false,
      sdkRepo: "git@github.com:test/repo.git",
      config: {},
    });
    mockReadFileContents.mockResolvedValue("spec content");

    const exitCode = await publishSpecsAction("test-sdk", {
      branch: "main",
      targetDir: ".",
      "open-api-file": "openapi.json",
    });

    expect(exitCode).toBe(0);
    expect(StainlessApi.prototype.publish).toHaveBeenCalledWith(
      expect.objectContaining({
        spec: expect.any(String),
        config: undefined,
      }),
    );
  });

  it("publishes SDK specifications with custom configuration", async () => {
    mockValidateAndProcessOptions.mockResolvedValue({
      branch: "main",
      openApiFile: "openapi.json",
      stainlessConfigFile: "stainless.config.json",
      projectName: "test-project",
      guessConfig: false,
      sdkRepo: "git@github.com:test/repo.git",
      config: {},
    });
    mockReadFileContents.mockResolvedValueOnce("spec content").mockResolvedValueOnce("config content");

    const exitCode = await publishSpecsAction("test-sdk", {
      branch: "main",
      targetDir: ".",
      "open-api-file": "openapi.json",
      "stainless-config-file": "stainless.config.json",
    });

    expect(exitCode).toBe(0);
    expect(StainlessApi.prototype.publish).toHaveBeenCalledWith(
      expect.objectContaining({
        spec: expect.any(String),
        config: expect.any(String),
      }),
    );
  });

  it("should handle nonexistent OpenAPI file", async () => {
    mockValidateAndProcessOptions.mockResolvedValue({
      branch: "main",
      openApiFile: "nonexistent.json",
      projectName: "test-project",
      guessConfig: false,
      sdkRepo: "git@github.com:test/repo.git",
      config: {},
    });
    mockReadFileContents.mockRejectedValue(new Error("File not found"));

    const exitCode = await publishSpecsAction("nonexistent", {
      branch: "main",
      targetDir: ".",
      "open-api-file": "nonexistent.json",
    });

    expect(exitCode).toBe(1);
    expect(StainlessApi.prototype.publish).not.toHaveBeenCalled();
  });

  it("should handle nonexistent config file", async () => {
    mockValidateAndProcessOptions.mockResolvedValue({
      branch: "main",
      openApiFile: "openapi.json",
      stainlessConfigFile: "nonexistent.config.json",
      projectName: "test-project",
      guessConfig: false,
      sdkRepo: "git@github.com:test/repo.git",
      config: {},
    });
    mockReadFileContents.mockResolvedValueOnce("spec content").mockRejectedValueOnce(new Error("File not found"));

    const exitCode = await publishSpecsAction("test-sdk", {
      branch: "main",
      targetDir: ".",
      "open-api-file": "openapi.json",
      "stainless-config-file": "nonexistent.config.json",
    });

    expect(exitCode).toBe(1);
    expect(StainlessApi.prototype.publish).not.toHaveBeenCalled();
  });

  it("should handle API errors", async () => {
    mockValidateAndProcessOptions.mockResolvedValue({
      branch: "main",
      openApiFile: "openapi.json",
      projectName: "test-project",
      guessConfig: false,
      sdkRepo: "git@github.com:test/repo.git",
      config: {},
    });
    mockReadFileContents.mockResolvedValue("spec content");
    vi.spyOn(StainlessApi.prototype, "publish").mockRejectedValue(new Error("API error"));

    const exitCode = await publishSpecsAction("test-sdk", {
      branch: "main",
      targetDir: ".",
      "open-api-file": "openapi.json",
    });

    expect(exitCode).toBe(1);
  });
});
