import { describe, it, expect } from "vitest";
import { tokenizePython, highlight } from "./highlight";

function typesOf(code: string) {
  return tokenizePython(code).map((t) => `${t.type}:${t.value}`);
}

describe("tokenizePython", () => {
  it("classifies keywords, builtins, strings, numbers, comments", () => {
    const toks = tokenizePython('import boto3  # comment\nx = len("hi") + 42');
    const types = toks.map((t) => t.type);
    expect(types).toContain("keyword"); // import
    expect(types).toContain("comment"); // # comment
    expect(types).toContain("builtin"); // len
    expect(types).toContain("string"); // "hi"
    expect(types).toContain("number"); // 42
  });

  it("detects function calls (identifier followed by '(')", () => {
    const toks = tokenizePython("client.create_configuration_bundle(bundleName=x)");
    expect(toks.some((t) => t.type === "func" && t.value === "create_configuration_bundle")).toBe(
      true,
    );
  });

  it("round-trips: joined token values equal the original source", () => {
    const src = 'def main(name):\n    return f"{name}"  # done\n';
    const joined = tokenizePython(src)
      .map((t) => t.value)
      .join("");
    expect(joined).toBe(src);
  });

  it("handles triple-quoted strings as a single string token", () => {
    const src = '"""a\nmulti\nline"""';
    const toks = tokenizePython(src);
    expect(toks).toHaveLength(1);
    expect(toks[0]).toEqual({ type: "string", value: src });
  });

  it("does not misclassify identifiers that merely contain keywords", () => {
    // 'information' contains 'in' but must stay plain.
    expect(typesOf("information")).toEqual(["plain:information"]);
  });
});

describe("highlight", () => {
  it("falls back to a single plain token for non-python", () => {
    const toks = highlight("SELECT * FROM t", "sql");
    expect(toks).toEqual([{ type: "plain", value: "SELECT * FROM t" }]);
  });
});
