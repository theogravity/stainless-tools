import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { StainlessApi } from "../StainlessApi";
import { StainlessError } from "../StainlessError";
import {fail} from "node:assert";

describe("StainlessApi", () => {
  const API_KEY = "test-api-key";
  const BASE_URL = "https://api.test.com";

  describe("constructor", () => {
    const originalEnv = process.env;

    beforeEach(() => {
      process.env = { ...originalEnv };
      delete process.env.STAINLESS_API_KEY;
    });

    afterEach(() => {
      process.env = originalEnv;
    });

    it("should initialize with provided API key", () => {
      const api = new StainlessApi({ apiKey: API_KEY });
      expect(api).toBeInstanceOf(StainlessApi);
    });

    it("should initialize with API key from environment", () => {
      process.env.STAINLESS_API_KEY = API_KEY;
      const api = new StainlessApi();
      expect(api).toBeInstanceOf(StainlessApi);
    });

    it("should throw if no API key is provided", () => {
      expect(() => new StainlessApi()).toThrow(StainlessError);
    });

    it("should use custom base URL if provided", () => {
      const api = new StainlessApi({ apiKey: API_KEY, baseUrl: BASE_URL });
      expect(api).toBeInstanceOf(StainlessApi);
    });
  });

  describe("publish", () => {
    let api: StainlessApi;

    beforeEach(() => {
      api = new StainlessApi({ apiKey: API_KEY, baseUrl: BASE_URL });
      fetchMock.resetMocks();
    });

    it("should successfully publish spec without config", async () => {
      const spec = "openapi: 3.0.0";
      fetchMock.mockResponseOnce(JSON.stringify({ success: true }));

      await api.publish({ spec });

      expect(fetchMock).toHaveBeenCalledTimes(1);
      const [url, options] = fetchMock.mock.calls[0];
      expect(url).toBe(`${BASE_URL}/api/spec`);
      expect(options?.method).toBe("POST");
      expect(options?.headers).toEqual({
        Authorization: `Bearer ${API_KEY}`,
      });
      // Verify FormData was sent
      expect(options?.body).toBeInstanceOf(FormData);
    });

    it("should throw error when spec is missing", async () => {
      const config = '{ "version": "1.0.0" }';

      // @ts-expect-error
      await expect(api.publish({ config })).rejects.toThrow(StainlessError);
    });

    it("should successfully publish only spec without config", async () => {
      const spec = "openapi: 3.0.0";
      fetchMock.mockResponseOnce(JSON.stringify({ success: true }));

      await api.publish({ spec });

      expect(fetchMock).toHaveBeenCalledTimes(1);
      const [url, options] = fetchMock.mock.calls[0];
      expect(url).toBe(`${BASE_URL}/api/spec`);
      expect(options?.method).toBe("POST");
      expect(options?.headers).toEqual({
        Authorization: `Bearer ${API_KEY}`,
      });
      // Verify FormData was sent
      expect(options?.body).toBeInstanceOf(FormData);
    });

    it("should successfully publish spec with config", async () => {
      const spec = "openapi: 3.0.0";
      const config = '{ "version": "1.0.0" }';
      fetchMock.mockResponseOnce(JSON.stringify({ success: true }));

      await api.publish({ spec, config });

      expect(fetchMock).toHaveBeenCalledTimes(1);
      const [, options] = fetchMock.mock.calls[0];
      const formData = options?.body as FormData;
      expect(formData.has("oasSpec")).toBe(true);
      expect(formData.has("stainlessConfig")).toBe(true);
    });

    it("should handle publish options", async () => {
      const spec = "openapi: 3.0.0";
      fetchMock.mockResponseOnce(JSON.stringify({ success: true }));

      await api.publish({
        spec,
        projectName: "test-project",
        branch: "main",
        guessConfig: true,
      });

      expect(fetchMock).toHaveBeenCalledTimes(1);
      const [, requestOptions] = fetchMock.mock.calls[0];
      const formData = requestOptions?.body as FormData;
      expect(formData.get("projectName")).toBe("test-project");
      expect(formData.get("branch")).toBe("main");
      expect(formData.get("guessConfig")).toBe("true");
    });

    it("should handle API errors with detailed error message", async () => {
      const spec = "openapi: 3.0.0";
      const errorResponse = {
        message: "Invalid spec format",
        details: "Schema validation failed",
      };
      fetchMock.mockResponseOnce(JSON.stringify(errorResponse), { status: 400 });

      try {
        await api.publish({ spec });
        fail("Expected publish to throw an error");
      } catch (error: any) {
        expect(error).toBeInstanceOf(StainlessError);
        expect(error.message).toMatch(/API Error \(HTTP 400\)/);
        expect(error.message).toMatch(/Invalid spec format/);
        expect(error.message).toMatch(/Schema validation failed/);
      }
    });

    it("should handle network errors", async () => {
      const spec = "openapi: 3.0.0";
      fetchMock.mockReject(new Error("Network error"));

      await expect(api.publish({ spec })).rejects.toThrow("Failed to publish to Stainless API");
    });

    it("should handle Buffer input for spec and config", async () => {
      const spec = Buffer.from("openapi: 3.0.0");
      const config = Buffer.from('{ "version": "1.0.0" }');
      fetchMock.mockResponseOnce(JSON.stringify({ success: true }));

      await api.publish({ spec, config });

      expect(fetchMock).toHaveBeenCalledTimes(1);
      const [, options] = fetchMock.mock.calls[0];
      const formData = options?.body as FormData;
      expect(formData.has("oasSpec")).toBe(true);
      expect(formData.has("stainlessConfig")).toBe(true);
    });

    it("should handle non-JSON error responses", async () => {
      const spec = "openapi: 3.0.0";
      const plainTextError = "Internal Server Error";
      fetchMock.mockResponseOnce(plainTextError, { status: 500 });

      try {
        await api.publish({ spec });
        fail("Expected publish to throw an error");
      } catch (error: any) {
        expect(error).toBeInstanceOf(StainlessError);
        expect(error.message).toMatch(/API Error \(HTTP 500\)/);
        expect(error.message).toMatch(plainTextError);
      }
    });
  });
});
