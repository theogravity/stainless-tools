import { describe, expect, test } from "vitest";
import { isValidGitUrl } from "../utils.js";

describe("isValidGitUrl", () => {
  describe("SSH URLs with protocol", () => {
    test("accepts valid SSH URLs with port", () => {
      expect(isValidGitUrl("ssh://git@ssh.github.com:443/user/repo.git")).toBe(true);
      expect(isValidGitUrl("ssh://git@gitlab.company.com:2222/team/project.git")).toBe(true);
    });

    test("rejects invalid SSH URLs with protocol", () => {
      expect(isValidGitUrl("ssh://git@/user/repo.git")).toBe(false);
      expect(isValidGitUrl("ssh://git@invalid domain:443/user/repo.git")).toBe(false);
      expect(isValidGitUrl("ssh://git@domain.com:443/invalid-path")).toBe(false);
    });
  });

  describe("Traditional SSH URLs", () => {
    test("accepts valid traditional SSH URLs", () => {
      expect(isValidGitUrl("git@github.com:user/repo.git")).toBe(true);
      expect(isValidGitUrl("git@gitlab.company.com:team/project.git")).toBe(true);
    });

    test("rejects invalid traditional SSH URLs", () => {
      expect(isValidGitUrl("git@:user/repo.git")).toBe(false);
      expect(isValidGitUrl("git@invalid domain:user/repo.git")).toBe(false);
      expect(isValidGitUrl("git@domain.com:invalid-path")).toBe(false);
    });
  });

  describe("HTTPS URLs", () => {
    test("accepts valid HTTPS URLs", () => {
      expect(isValidGitUrl("https://github.com/user/repo.git")).toBe(true);
      expect(isValidGitUrl("http://gitlab.company.com/team/project.git")).toBe(true);
    });

    test("rejects invalid HTTPS URLs", () => {
      expect(isValidGitUrl("https:///user/repo.git")).toBe(false);
      expect(isValidGitUrl("https://invalid domain/user/repo.git")).toBe(false);
      expect(isValidGitUrl("https://github.com/invalid-path")).toBe(false);
      expect(isValidGitUrl("ftp://github.com/user/repo.git")).toBe(false);
    });
  });

  describe("Invalid URLs", () => {
    test("rejects malformed URLs", () => {
      expect(isValidGitUrl("")).toBe(false);
      expect(isValidGitUrl("not-a-url")).toBe(false);
      expect(isValidGitUrl("git@")).toBe(false);
      expect(isValidGitUrl("ssh://")).toBe(false);
      expect(isValidGitUrl("https://")).toBe(false);
    });
  });
});
