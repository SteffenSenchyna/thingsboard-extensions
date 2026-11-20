///
/// Copyright © 2016-2025 The Thingsboard Authors
///
/// Licensed under the Apache License, Version 2.0 (the "License");
/// you may not use this file except in compliance with the License.
/// You may obtain a copy of the License at
///
///     http://www.apache.org/licenses/LICENSE-2.0
///
/// Unless required by applicable law or agreed to in writing, software
/// distributed under the License is distributed on an "AS IS" BASIS,
/// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
/// See the License for the specific language governing permissions and
/// limitations under the License.
///

// ESF's Regex Filter (Kura's `org.eclipse.kura.wire.RegexFilter`): its `regex.filter` is a Java regular expression, matched whole
// (`Pattern.matcher(name).matches()`) against each property name of each record it receives — RETAIN (`filter.type` 1) keeps the
// properties it matches, REMOVE (2) drops them. A pattern Java can't compile (a `PatternSyntaxException`) filters nothing: ESF passes
// every envelope through as it came, logging a warning each time. `esfJavaRegexError` checks a pattern as Java's `Pattern` reads it
// (its escapes, its character classes — nested, a `]` first in one the character itself — its repetitions, its groups and flags),
// then its groups and repetitions once more with the browser's own parser, on the pattern reduced to them.

/** The Regex Filter's definition and its pattern's setting. */
export const ESF_REGEX_FILTER_DEFINITION = "org.eclipse.kura.wire.RegexFilter";
export const ESF_REGEX_FILTER_SETTING = "regex.filter";

/** A setting that is a Regex Filter's pattern. */
export function isEsfRegexSetting(definitionId: string | undefined, attrId: string): boolean {
  return definitionId === ESF_REGEX_FILTER_DEFINITION && attrId === ESF_REGEX_FILTER_SETTING;
}

/** An escape read (`\…`): where it ends, the character it stands for (null — a class, a boundary, a reference), what's wrong. */
interface Escape {
  end: number;
  value: number | null;
  error?: string;
  /** A `\k<name>`'s group. */
  ref?: string;
}

/** Letters Java's `Pattern` has no escape for (`\y`, `\i`, `\E` without its `\Q` — "Illegal/unsupported escape sequence"). */
const NO_ESCAPE = /^[CEFIJKLMOTUYgijlmoqy]$/;
/** Escapes Java refuses inside `[ ]`: the boundaries, `\R`, `\X`, a back reference. */
const NOT_IN_CLASS = /^[ABGRXZbzk1-9]$/;
/** The escapes of one character. */
const CONTROL: Record<string, number> = { t: 9, n: 10, f: 12, r: 13, a: 7, e: 27 };
/** A group name Java takes: Latin letters and digits, a letter first. */
const GROUP_NAME = /^<([a-zA-Z][a-zA-Z0-9]*)>/;

/** The escape at `i` (a `\`), as Java's `Pattern.escape` reads it. */
function escapeAt(p: string, i: number, inClass: boolean): Escape {
  const c = p[i + 1];
  const at = i + 2;
  const rest = p.slice(at);
  if (c === undefined) {
    return { end: i + 1, value: null, error: "A \\ at the end, escaping nothing" };
  }
  if (inClass && NOT_IN_CLASS.test(c)) {
    return { end: at, value: null, error: `\\${c} isn't allowed inside [ ]` };
  }
  switch (c) {
    case "x": {
      const two = /^[0-9a-fA-F]{2}/.exec(rest);
      const braced = /^\{([0-9a-fA-F]+)\}/.exec(rest);
      if (two) {
        return { end: at + 2, value: parseInt(two[0], 16) };
      }
      if (braced) {
        const code = parseInt(braced[1], 16);
        return code <= 0x10ffff
          ? { end: at + braced[0].length, value: code }
          : { end: at + braced[0].length, value: null, error: "A \\x{…} past the last character, \\x{10FFFF}" };
      }
      return { end: at, value: null, error: "A \\x without its two hex digits (\\x41) or {code} (\\x{1F600})" };
    }
    case "u": {
      const four = /^[0-9a-fA-F]{4}/.exec(rest);
      return four ? { end: at + 4, value: parseInt(four[0], 16) } : { end: at, value: null, error: "A \\u without its four hex digits (\\u00B0)" };
    }
    case "0": {
      // One to three octal digits, a third only after a first of 0 to 3 (Java's `o()`).
      const octal = /^([0-3][0-7]{0,2}|[4-7][0-7]?)/.exec(rest);
      return octal ? { end: at + octal[0].length, value: parseInt(octal[0], 8) } : { end: at, value: null, error: "A \\0 without its octal digits (\\0101)" };
    }
    case "c":
      return at < p.length ? { end: at + 1, value: p.charCodeAt(at) ^ 64 } : { end: at, value: null, error: "A \\c without its letter (\\cM)" };
    case "k": {
      const name = GROUP_NAME.exec(rest);
      return name ? { end: at + name[0].length, value: null, ref: name[1] } : { end: at, value: null, error: "A \\k without its group's <name>" };
    }
    case "N": {
      const name = /^\{[^}]+\}/.exec(rest);
      return name ? { end: at + name[0].length, value: null } : { end: at, value: null, error: "A \\N without its {character name}" };
    }
    case "p":
    case "P": {
      const family = /^(\{[^}]+\}|[a-zA-Z])/.exec(rest);
      return family ? { end: at + family[0].length, value: null } : { end: at, value: null, error: `A \\${c} without its {property} (\\${c}{Alpha})` };
    }
  }
  if (NO_ESCAPE.test(c)) {
    return { end: at, value: null, error: `\\${c} isn't an escape Java knows` };
  }
  if (/[a-zA-Z1-9]/.test(c)) {
    // A class (\d, \w, \s, \p…), a boundary (\b, \A, \z…), \R, \X, or a back reference: no one character.
    return { end: at, value: CONTROL[c] ?? null };
  }
  // Any other character escaped stands for itself (\., \\, \-, \#).
  const value = p.codePointAt(i + 1)!;
  return { end: i + 1 + (value > 0xffff ? 3 : 2), value };
}

/** One character of a class at `i`: where it ends, the character (null — a class escape), what's wrong. */
function classCharAt(p: string, i: number): Escape {
  if (p[i] === "\\") {
    return escapeAt(p, i, true);
  }
  const value = p.codePointAt(i)!;
  return { end: i + (value > 0xffff ? 2 : 1), value };
}

/**
 * The character class at `start` (a `[`), as Java's `Pattern.clazz` reads it: `^` first negates; a `]` before anything in it is
 * the character itself; a `[` inside a class of its own (a union); `&&` an intersection; `a-z` a range, its ends in order.
 */
function classAt(p: string, start: number): { end: number; error?: string } {
  let i = start + 1;
  if (p[i] === "^") {
    i++;
  }
  let empty = true;
  while (i < p.length) {
    const c = p[i];
    if (c === "]" && !empty) {
      return { end: i + 1 };
    }
    empty = false;
    if (c === "[") {
      const inner = classAt(p, i);
      if (inner.error) {
        return inner;
      }
      i = inner.end;
      continue;
    }
    if (c === "&" && p[i + 1] === "&") {
      i += 2;
      continue;
    }
    if (c === "\\" && p[i + 1] === "Q") {
      const close = p.indexOf("\\E", i + 2);
      i = close < 0 ? p.length : close + 2;
      continue;
    }
    const from = classCharAt(p, i);
    if (from.error) {
      return { end: from.end, error: from.error };
    }
    i = from.end;
    // A range: a character, a -, and another — not a ] (the - then the character itself) or a [ (a union after it).
    if (from.value !== null && p[i] === "-" && p[i + 1] !== undefined && p[i + 1] !== "]" && p[i + 1] !== "[") {
      const to = classCharAt(p, i + 1);
      if (to.error) {
        return { end: to.end, error: to.error };
      }
      if (to.value === null) {
        return { end: to.end, error: "A range in [ ] ending in a class (\\d, \\w…) rather than a character" };
      }
      if (to.value < from.value) {
        return { end: to.end, error: "A range in [ ] that runs backwards (z-a)" };
      }
      i = to.end;
    }
  }
  return { end: p.length, error: "A [ never closed" };
}

/** Java's inline flags: `(?i)`, `(?-i)`, `(?is-m:` — `x` its comments mode (whitespace and `#` to a line's end ignored). */
const FLAGS = /^([idmsuxUc]*)(?:-([idmsuxUc]*))?([:)])/;

/** The browser's message about a pattern's groups and repetitions (Chromium's, Firefox's, Safari's), in plain words. */
function plainMessage(message: string): string {
  const said = message.replace(/^Invalid regular expression: \/.*\/[a-z]*: /s, "");
  const words: [RegExp, string][] = [
    [/nothing to repeat/i, "A repeat (*, +, ? or {n}) with nothing before it"],
    [/unterminated group|unterminated parenthetical|missing \)/i, "A ( never closed"],
    [/unmatched '?\)'?|unmatched parenthes/i, "A ) that closes nothing"],
  ];
  return words.find(([re]) => re.test(said))?.[1] ?? said;
}

/**
 * What's wrong with a Java regular expression (a Regex Filter's pattern), in plain words — null when Java's `Pattern` compiles it.
 * Its escapes, classes, repetitions' braces, group names and flags are read as Java reads them; what's left — its groups,
 * alternatives and repetitions, every character, class and escape one `x` — goes to the browser's parser, which judges those as
 * Java does (a possessive `*+` read as a lazy `*?`, an atomic `(?>` as `(?:`). Checked against Java 17's `Pattern.compile`; Java's
 * property names (`\p{Alpha}`, `\p{IsLatin}`) aren't checked.
 */
export function esfJavaRegexError(pattern: string): string | null {
  const p = pattern ?? "";
  const names: string[] = [];
  let skeleton = "";
  let comments = false;
  let i = 0;
  while (i < p.length) {
    const c = p[i];
    if (c === "\\" && p[i + 1] === "Q") {
      // A quoted run, to its \E or the end: its characters themselves.
      const close = p.indexOf("\\E", i + 2);
      i = close < 0 ? p.length : close + 2;
      skeleton += "x";
      continue;
    }
    if (c === "\\") {
      const escape = escapeAt(p, i, false);
      if (escape.error) {
        return escape.error;
      }
      if (escape.ref !== undefined && !names.includes(escape.ref)) {
        return `A \\k<${escape.ref}> naming no group before it`;
      }
      skeleton += "x";
      i = escape.end;
      continue;
    }
    if (c === "[") {
      const cls = classAt(p, i);
      if (cls.error) {
        return cls.error;
      }
      skeleton += "x";
      i = cls.end;
      continue;
    }
    if (c === "{") {
      const repeat = /^\{(\d+)(,(\d*))?\}/.exec(p.slice(i));
      if (!repeat) {
        return "A { that isn't a repetition like {2} or {1,3}: \\{ for the character itself";
      }
      if (repeat[3] && Number(repeat[3]) < Number(repeat[1])) {
        return "A {min,max} whose min is over its max";
      }
      // Java lets a {n} repeat anything, even nothing ("{2}", "a{2}{3}"): checked here alone, left out of the browser's.
      i += repeat[0].length;
      if (p[i] === "?" || p[i] === "+") {
        i++;
      }
      // But a *, + or ? after it (and its lazy ? or possessive +) is Java's "Dangling meta character".
      if (p[i] === "*" || p[i] === "+" || p[i] === "?") {
        return "A repeat (*, +, ? or {n}) with nothing before it";
      }
      continue;
    }
    if (c === "*" || c === "+" || c === "?") {
      // A possessive *+ read as a lazy *? — one more repeat after either is Java's "Dangling meta character" too.
      skeleton += c + (p[i + 1] === "+" ? "?" : "");
      i += 1 + (p[i + 1] === "+" ? 1 : 0);
      continue;
    }
    if (c === "(" && p[i + 1] === "?") {
      const rest = p.slice(i + 2);
      if (/^(<?[=!]|:)/.test(rest)) {
        const open = rest[0] === "<" ? 4 : 3;
        skeleton += p.slice(i, i + open);
        i += open;
        continue;
      }
      if (rest[0] === ">") {
        skeleton += "(?:";
        i += 3;
        continue;
      }
      if (rest[0] === "<") {
        const name = GROUP_NAME.exec(rest);
        if (!name) {
          return "A group name of Latin letters and digits, a letter first: (?<name>…)";
        }
        if (names.includes(name[1])) {
          return `Two groups named ${name[1]}`;
        }
        names.push(name[1]);
        skeleton += "(";
        i += 2 + name[0].length;
        continue;
      }
      const flags = FLAGS.exec(rest);
      if (!flags) {
        return "A (? Java doesn't know: (?:…), (?=…), (?!…), (?<=…), (?<!…), (?>…), (?<name>…) or flags (?i)";
      }
      if (flags[1].includes("x")) {
        comments = true;
      } else if (flags[2]?.includes("x")) {
        comments = false;
      }
      skeleton += flags[3] === ":" ? "(?:" : "";
      i += 2 + flags[0].length;
      continue;
    }
    if (comments && /\s/.test(c)) {
      i++;
      continue;
    }
    if (comments && c === "#") {
      const end = p.indexOf("\n", i);
      i = end < 0 ? p.length : end + 1;
      continue;
    }
    // A group, an alternative, else one character (or an anchor, which Java lets repeat).
    skeleton += c === "(" || c === ")" || c === "|" ? c : "x";
    i++;
  }
  try {
    // Only compiled, never run against anything.
    new RegExp(skeleton);
    return null;
  } catch (e) {
    return e instanceof SyntaxError ? plainMessage(e.message) : null;
  }
}

/** What reaches a component (a Regex Filter's input): every property name its records may carry, and the few worth naming. */
export interface EsfReceivedProperties {
  names: string[];
  shown: string[];
}

/** Characters a browser's pattern reads as syntax. */
const SPECIAL = /[.*+?^${}()|[\]\\/]/g;
/** A run of characters as themselves in a browser's character class. */
const classLiteral = (s: string): string => s.replace(/[\]\\^-]/g, "\\$&");
/** Characters as themselves in a browser's pattern. */
const literal = (s: string): string => s.replace(SPECIAL, "\\$&");

/** A class of Java's as the browser's (`[…]`), else null — a union or an intersection, an escape the browser has none of. */
function classToJs(p: string, start: number): { text: string; end: number } | null {
  let i = start + 1;
  let text = "[";
  if (p[i] === "^") {
    text += "^";
    i++;
  }
  let empty = true;
  while (i < p.length) {
    const c = p[i];
    if (c === "]" && !empty) {
      return { text: `${text}]`, end: i + 1 };
    }
    if (c === "[" || (c === "&" && p[i + 1] === "&")) {
      return null;
    }
    empty = false;
    if (c !== "\\") {
      text += c === "]" ? "\\]" : c;
      i++;
      continue;
    }
    const n = p[i + 1] ?? "";
    if (n === "Q") {
      const close = p.indexOf("\\E", i + 2);
      text += classLiteral(p.slice(i + 2, close < 0 ? p.length : close));
      i = close < 0 ? p.length : close + 2;
    } else if ("dDsSwWtnrf".includes(n)) {
      text += `\\${n}`;
      i += 2;
    } else if (/[a-zA-Z0-9]/.test(n)) {
      const escape = escapeAt(p, i, true);
      if (escape.error || escape.value === null || !/[xuc0ae]/.test(n)) {
        return null;
      }
      text += classLiteral(String.fromCodePoint(escape.value));
      i = escape.end;
    } else {
      text += `\\${n}`;
      i += 2;
    }
  }
  return null;
}

/**
 * A Java pattern (one `esfJavaRegexError` passes) as the browser's, matched whole as Java's `matches()` matches — `^(?:…)$`; null
 * where Java's syntax has no like in the browser's (comments mode, a class's union or intersection, `\p{…}`, `\h`, `\v`, `\R`, `\G`):
 * then nothing is said of what it matches. An inline flag counts for the whole pattern (`(?i)` — case-insensitive everywhere).
 */
export function esfJavaRegexToJs(pattern: string): RegExp | null {
  const p = pattern ?? "";
  let out = "";
  let flags = "";
  let i = 0;
  while (i < p.length) {
    const c = p[i];
    if (c === "\\") {
      const n = p[i + 1] ?? "";
      if (n === "Q") {
        const close = p.indexOf("\\E", i + 2);
        out += literal(p.slice(i + 2, close < 0 ? p.length : close));
        i = close < 0 ? p.length : close + 2;
      } else if ("AzZ".includes(n)) {
        // The input's bounds: the match is whole anyway.
        i += 2;
      } else if ("dDsSwWbBtnrf123456789".includes(n)) {
        out += `\\${n}`;
        i += 2;
      } else if (n === "k") {
        const escape = escapeAt(p, i, false);
        out += p.slice(i, escape.end);
        i = escape.end;
      } else if (/[a-zA-Z0]/.test(n)) {
        const escape = escapeAt(p, i, false);
        if (escape.error || escape.value === null || !/[xuc0ae]/.test(n)) {
          return null;
        }
        out += literal(String.fromCodePoint(escape.value));
        i = escape.end;
      } else {
        out += literal(n);
        i += 2;
      }
      continue;
    }
    if (c === "[") {
      const cls = classToJs(p, i);
      if (!cls) {
        return null;
      }
      out += cls.text;
      i = cls.end;
      continue;
    }
    if (c === "(" && p[i + 1] === "?") {
      const rest = p.slice(i + 2);
      const open = /^(<?[=!]|:)/.exec(rest) ?? /^<[a-zA-Z][a-zA-Z0-9]*>/.exec(rest);
      if (open) {
        out += `(?${open[0]}`;
        i += 2 + open[0].length;
        continue;
      }
      if (rest[0] === ">") {
        out += "(?:";
        i += 3;
        continue;
      }
      const f = FLAGS.exec(rest);
      if (!f || `${f[1]}${f[2] ?? ""}`.includes("x")) {
        return null;
      }
      flags += (f[1].includes("i") && !flags.includes("i") ? "i" : "") + (f[1].includes("s") && !flags.includes("s") ? "s" : "");
      out += f[3] === ":" ? "(?:" : "";
      i += 2 + f[0].length;
      continue;
    }
    if (c === "{") {
      const repeat = /^\{\d+(,\d*)?\}/.exec(p.slice(i));
      if (!repeat) {
        return null;
      }
      out += repeat[0];
      i += repeat[0].length + (p[i + repeat[0].length] === "+" ? 1 : 0);
      continue;
    }
    if (c === "*" || c === "+" || c === "?") {
      // A possessive repeat (`*+`) as the greedy one: the same names match, but for a pattern written to backtrack into it.
      out += c;
      i += 1 + (p[i + 1] === "+" ? 1 : 0);
      continue;
    }
    out += c === "}" || c === "]" ? `\\${c}` : c;
    i++;
  }
  try {
    return new RegExp(`^(?:${out})$`, flags);
  } catch {
    return null;
  }
}

/**
 * A Regex Filter's pattern that matches none of the properties reaching it (`received`, from the components wired into it) — its
 * RETAIN then emits records with nothing in them, its REMOVE takes nothing out: what its field warns of, naming what it receives.
 * Null when it matches one, when what reaches it isn't known, and for a pattern Java can't compile (its error says so) or one the
 * browser can't run as Java would.
 */
export function esfRegexMatchWarning(pattern: string, received: EsfReceivedProperties | null): string | null {
  if (!received?.names.length || esfJavaRegexError(pattern)) {
    return null;
  }
  const re = esfJavaRegexToJs(pattern);
  if (!re || received.names.some((name) => re.test(name))) {
    return null;
  }
  const shown = received.shown.slice(0, 4).join(", ");
  const more = received.shown.length > 4 ? ` +${received.shown.length - 4}` : "";
  return `Matches none of the properties it receives: ${shown}${more}`;
}
