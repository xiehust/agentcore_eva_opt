/**
 * Tiny, dependency-free syntax tokenizer for the code shown in CodeBlock.
 *
 * The site only displays Python (boto3) snippets, so this covers Python well;
 * unknown languages fall back to a single "plain" token so the caller can still
 * render safely. Tokens are rendered as React <span>s by CodeBlock — no
 * innerHTML, so there's no XSS surface.
 */

export type TokenType =
  | "keyword"
  | "string"
  | "number"
  | "comment"
  | "builtin"
  | "func"
  | "punct"
  | "plain";

export interface Token {
  type: TokenType;
  value: string;
}

const PY_KEYWORDS = new Set([
  "and", "as", "assert", "async", "await", "break", "class", "continue",
  "def", "del", "elif", "else", "except", "finally", "for", "from", "global",
  "if", "import", "in", "is", "lambda", "nonlocal", "not", "or", "pass",
  "raise", "return", "try", "while", "with", "yield", "True", "False", "None",
]);

const PY_BUILTINS = new Set([
  "print", "len", "range", "str", "int", "float", "bool", "list", "dict",
  "set", "tuple", "open", "isinstance", "enumerate", "zip", "map", "filter",
  "sorted", "sum", "min", "max", "abs", "type", "super", "self",
]);

// Ordered matchers. Each returns the matched length at position `i`, or 0.
function isIdentStart(ch: string): boolean {
  return /[A-Za-z_]/.test(ch);
}
function isIdentChar(ch: string): boolean {
  return /[A-Za-z0-9_]/.test(ch);
}

/** Tokenize a Python source string into typed tokens (order-preserving). */
export function tokenizePython(src: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;
  const n = src.length;

  const push = (type: TokenType, value: string) => {
    if (value) tokens.push({ type, value });
  };

  while (i < n) {
    const ch = src[i];

    // Comment: # ... to end of line
    if (ch === "#") {
      let j = i + 1;
      while (j < n && src[j] !== "\n") j++;
      push("comment", src.slice(i, j));
      i = j;
      continue;
    }

    // Triple-quoted string
    if (
      (ch === '"' || ch === "'") &&
      src[i + 1] === ch &&
      src[i + 2] === ch
    ) {
      const quote = ch.repeat(3);
      let j = i + 3;
      while (j < n && src.slice(j, j + 3) !== quote) j++;
      j = Math.min(j + 3, n);
      push("string", src.slice(i, j));
      i = j;
      continue;
    }

    // Single/double-quoted string (with escape handling)
    if (ch === '"' || ch === "'") {
      let j = i + 1;
      while (j < n && src[j] !== ch) {
        if (src[j] === "\\") j++; // skip escaped char
        j++;
      }
      j = Math.min(j + 1, n);
      push("string", src.slice(i, j));
      i = j;
      continue;
    }

    // Number (int/float, incl. leading dot)
    if (/[0-9]/.test(ch) || (ch === "." && /[0-9]/.test(src[i + 1] ?? ""))) {
      let j = i;
      while (j < n && /[0-9._eE+-]/.test(src[j])) {
        // stop a trailing +/- that isn't part of an exponent
        if ((src[j] === "+" || src[j] === "-") && !/[eE]/.test(src[j - 1] ?? "")) break;
        j++;
      }
      push("number", src.slice(i, j));
      i = j;
      continue;
    }

    // Identifier / keyword / builtin / function-call
    if (isIdentStart(ch)) {
      let j = i + 1;
      while (j < n && isIdentChar(src[j])) j++;
      const word = src.slice(i, j);
      // Look past whitespace for a "(" to detect a call.
      let k = j;
      while (k < n && (src[k] === " " || src[k] === "\t")) k++;
      const isCall = src[k] === "(";
      if (PY_KEYWORDS.has(word)) push("keyword", word);
      else if (PY_BUILTINS.has(word)) push("builtin", word);
      else if (isCall) push("func", word);
      else push("plain", word);
      i = j;
      continue;
    }

    // Punctuation / operators (grouped run of non-word, non-space chars)
    if (/[()[\]{}.,:;=+\-*/%<>!&|^~@]/.test(ch)) {
      push("punct", ch);
      i++;
      continue;
    }

    // Whitespace / anything else → plain (preserve exactly)
    let j = i + 1;
    while (j < n && /\s/.test(src[j]) && src[j] !== "\n") j++;
    // keep newlines as their own plain token boundary for stable rendering
    if (ch === "\n") {
      push("plain", "\n");
      i++;
    } else {
      push("plain", src.slice(i, j));
      i = j;
    }
  }

  return tokens;
}

/** Tailwind text color class per token type (see @theme --color-syn-*). */
export const TOKEN_CLASS: Record<TokenType, string> = {
  keyword: "text-syn-keyword",
  string: "text-syn-string",
  number: "text-syn-number",
  comment: "text-syn-comment italic",
  builtin: "text-syn-builtin",
  func: "text-syn-func",
  punct: "text-syn-punct",
  plain: "text-fog-300",
};

/**
 * Tokenize for a given language. Only Python is specially handled; any other
 * language returns a single plain token (safe fallback).
 */
export function highlight(code: string, language: string): Token[] {
  if (language.toLowerCase() === "python") return tokenizePython(code);
  return [{ type: "plain", value: code }];
}
