import { describe, expect, it } from "vitest";
import { DatasetParseError, parseDatasetFile, serializeDataset } from "./datasetIo";

describe("parseDatasetFile", () => {
  it("parses a JSON array of {prompt, context?}", () => {
    const items = parseDatasetFile(
      JSON.stringify([
        { prompt: "p1", context: "Employee ID: EMP-001." },
        { prompt: "p2" },
      ]),
    );
    expect(items).toEqual([
      { prompt: "p1", context: "Employee ID: EMP-001." },
      { prompt: "p2" },
    ]);
  });

  it("parses JSONL (one object per line)", () => {
    const items = parseDatasetFile('{"prompt":"a"}\n{"prompt":"b","context":"c."}\n');
    expect(items).toEqual([{ prompt: "a" }, { prompt: "b", context: "c." }]);
  });

  it("drops empty context strings", () => {
    expect(parseDatasetFile('[{"prompt":"a","context":"  "}]')).toEqual([{ prompt: "a" }]);
  });

  it("rejects empty files, non-arrays, and missing prompts with readable errors", () => {
    expect(() => parseDatasetFile("")).toThrow(DatasetParseError);
    expect(() => parseDatasetFile("[]")).toThrow(/no items/);
    expect(() => parseDatasetFile('[{"context":"x"}]')).toThrow(/item 1: "prompt"/);
    expect(() => parseDatasetFile('[{"prompt":42}]')).toThrow(/non-empty string/);
    expect(() => parseDatasetFile('{"prompt":"a"}\nnot json')).toThrow(/line 2/);
    expect(() => parseDatasetFile("[not json")).toThrow(/invalid JSON/);
  });

  it("round-trips through serializeDataset", () => {
    const items = [{ prompt: "p", context: "c." }];
    expect(parseDatasetFile(serializeDataset(items))).toEqual(items);
  });
});
