import { describe, expect, it } from "vitest";
import { program } from "../cli";

describe("CLI", () => {
  it("has the correct name and description", () => {
    expect(program.name()).toBe("stainless-tools");
    expect(program.description()).toBe("Stainless SDK tools for generating and managing SDKs");
  });

  it("has the generate command", () => {
    const generateCommand = program.commands.find((cmd) => cmd.name() === "generate");
    expect(generateCommand).toBeDefined();
    expect(generateCommand?.description()).toBe("Generate an SDK");
  });
});
