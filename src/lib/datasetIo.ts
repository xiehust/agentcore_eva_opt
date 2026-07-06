/**
 * Dataset file import/export. Accepts a JSON array of {prompt, context?} or
 * JSONL (one object per line); validates the shape with readable errors.
 */
import type { DatasetItem } from "./liveApi";

export class DatasetParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DatasetParseError";
  }
}

function validateItem(value: unknown, index: number): DatasetItem {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new DatasetParseError(`item ${index + 1}: expected an object like {"prompt": "..."}`);
  }
  const obj = value as Record<string, unknown>;
  if (typeof obj.prompt !== "string" || obj.prompt.trim() === "") {
    throw new DatasetParseError(`item ${index + 1}: "prompt" must be a non-empty string`);
  }
  if (obj.context !== undefined && obj.context !== null && typeof obj.context !== "string") {
    throw new DatasetParseError(`item ${index + 1}: "context" must be a string when present`);
  }
  const item: DatasetItem = { prompt: obj.prompt };
  if (typeof obj.context === "string" && obj.context.trim() !== "") item.context = obj.context;
  return item;
}

/** Parse dataset file text: a JSON array, or JSONL (one JSON object per line). */
export function parseDatasetFile(text: string): DatasetItem[] {
  const trimmed = text.trim();
  if (trimmed === "") throw new DatasetParseError("file is empty");

  if (trimmed.startsWith("[")) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(trimmed);
    } catch (e) {
      throw new DatasetParseError(`invalid JSON: ${e instanceof Error ? e.message : String(e)}`);
    }
    if (!Array.isArray(parsed)) throw new DatasetParseError("expected a JSON array");
    if (parsed.length === 0) throw new DatasetParseError("dataset has no items");
    return parsed.map(validateItem);
  }

  // JSONL: one object per non-empty line.
  const lines = trimmed.split(/\r?\n/).filter((l) => l.trim() !== "");
  return lines.map((line, i) => {
    let parsed: unknown;
    try {
      parsed = JSON.parse(line);
    } catch (e) {
      throw new DatasetParseError(
        `line ${i + 1}: invalid JSON: ${e instanceof Error ? e.message : String(e)}`,
      );
    }
    return validateItem(parsed, i);
  });
}

/** Serialize dataset items to pretty-printed JSON for download. */
export function serializeDataset(items: DatasetItem[]): string {
  return JSON.stringify(items, null, 2);
}
