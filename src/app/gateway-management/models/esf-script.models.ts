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

// ESF's GraalVM™ scripted Wire components (Kura's `org.eclipse.kura.wire.script.tools`, ESF 7.6 = Kura 5.6): the Filter Component
// runs its `script` setting (JavaScript, GraalJS) on every envelope it receives; the Conditional Component its `condition` (an
// expression, true or false: which of its two ports the envelope goes on). What a script is given and what ESF does with it, from
// Kura's `EngineProvider` / `FilterComponent`:
//
// - the bindings: `input` (the envelope — `getEmitterPid()`, `getRecords()`; a record's `getProperties()`: its names to TypedValues,
//   `getValue()`, `getType()`), `logger` (an slf4j logger), the helpers `newWireRecord`, `newByteArray` and the `new<Type>Value`s,
//   the DataType names (`BOOLEAN` … `STRING`); `exit` and `quit` taken out;
// - what it emits: the global `output`, read after the run — an array of WireRecords; anything else (or none) emits nothing;
// - one context for every run (dropped only on a settings update with `script.context.drop`): a global set once stays — but a
//   top-level `let` / `const` / `class` is declared again on the next run, which GraalJS refuses ("already declared");
// - no Java: the engine allows no host class lookup (`Java.type` fails);
// - a syntax or run error is only logged on the unit ("Syntax error at …"): the envelope is dropped, nothing emitted.
//
// `esfScriptIssues` checks a script against that (and its syntax, as the browser parses JavaScript), so the field says what ESF
// would do before the settings are applied; `ESF_SCRIPT_COMPLETER` offers the bindings in ThingsBoard's script editor.

/** Which script setting a field is: a Filter Component's script, a Conditional Component's condition. */
export type EsfScriptKind = "filter" | "condition";

export const ESF_FILTER_DEFINITION = "org.eclipse.kura.wire.script.tools.FilterComponent";
export const ESF_CONDITIONAL_DEFINITION = "org.eclipse.kura.wire.script.tools.ConditionalComponent";

/** A setting that is one of these scripts (by its component's definition, or a filter's own pair of settings), else null. */
export function esfScriptKindOf(definitionId: string | undefined, attrId: string, attrIds: string[]): EsfScriptKind | null {
  if (attrId === "script" && (definitionId === ESF_FILTER_DEFINITION || attrIds.includes("script.context.drop"))) {
    return "filter";
  }
  if (attrId === "condition" && definitionId === ESF_CONDITIONAL_DEFINITION) {
    return "condition";
  }
  return null;
}

/** Something about a script: an error ESF won't run past (Apply waits), or a warning of what it'll do that may not be meant. */
export interface EsfScriptIssue {
  level: "error" | "warning";
  title: string;
  detail: string;
  /** Its line (1 first), where it has one. */
  line?: number;
}

/** The helpers ESF binds (`EngineProvider.createDefaultBindings`). */
const HELPERS = [
  "newWireRecord",
  "newByteArray",
  "newBooleanValue",
  "newByteArrayValue",
  "newDoubleValue",
  "newFloatValue",
  "newIntegerValue",
  "newLongValue",
  "newStringValue",
];

/** slf4j's Logger methods a script calls. */
const LOGGER_METHODS = new Set([
  "trace",
  "debug",
  "info",
  "warn",
  "error",
  "isTraceEnabled",
  "isDebugEnabled",
  "isInfoEnabled",
  "isWarnEnabled",
  "isErrorEnabled",
  "getName",
]);

/** Not a member access or part of a longer name: the start of the source, or a character a name can't hold, before it. */
const START = String.raw`(?:^|[^.\w$])`;

const blank = (s: string) => s.replace(/[^\r\n]/g, " ");

/** Where a line ends from `from` on (a line feed, or a carriage return alone — ESF's own default script breaks its lines so). */
const lineEnd = (src: string, from: number) => {
  const m = /[\r\n]/.exec(src.slice(from));
  return m ? from + m.index : src.length;
};

/**
 * The source with every comment, string and template literal blanked (their quotes kept, newlines kept): the checks read the code
 * alone, at the same places. (A regular expression literal holding a quote can throw it off — rare in a Wire script.)
 */
function codeOnly(src: string): string {
  let out = "";
  let i = 0;
  while (i < src.length) {
    const c = src[i];
    const n = src[i + 1];
    if (c === "/" && n === "/") {
      const j = lineEnd(src, i);
      out += blank(src.slice(i, j));
      i = j;
    } else if (c === "/" && n === "*") {
      const end = src.indexOf("*/", i + 2);
      const j = end < 0 ? src.length : end + 2;
      out += blank(src.slice(i, j));
      i = j;
    } else if (c === '"' || c === "'" || c === "`") {
      let j = i + 1;
      while (j < src.length && src[j] !== c && (c === "`" || (src[j] !== "\n" && src[j] !== "\r"))) {
        j += src[j] === "\\" ? 2 : 1;
      }
      const close = j < src.length && src[j] === c;
      out += c + blank(src.slice(i + 1, Math.min(j, src.length))) + (close ? c : "");
      i = close ? j + 1 : Math.min(j, src.length);
    } else {
      out += c;
      i++;
    }
  }
  return out;
}

const lineOf = (code: string, index: number) => code.slice(0, index).split(/\r\n|\r|\n/).length;

/** A match's line, past the character `START` takes before the name (a line break, at a line's start). */
const lineAt = (code: string, m: RegExpMatchArray) => lineOf(code, (m.index ?? 0) + (/^[^\w$]/.test(m[0]) ? 1 : 0));

/** Every top-level `let` / `const` / `class` / `return` (outside any braces, parentheses or brackets): its word, name and line. */
function topLevel(code: string): { word: string; name: string; line: number }[] {
  const out: { word: string; name: string; line: number }[] = [];
  const re = /[{}()[\]]|\b(let|const|class|return)\b\s*([A-Za-z_$][\w$]*|\[|\{)?/g;
  let depth = 0;
  for (let m = re.exec(code); m; m = re.exec(code)) {
    const t = m[0];
    if (t === "{" || t === "(" || t === "[") {
      depth++;
    } else if (t === "}" || t === ")" || t === "]") {
      depth = Math.max(0, depth - 1);
    } else if (depth === 0 && m[1] && code[m.index - 1] !== ".") {
      out.push({ word: m[1], name: m[2] ?? "", line: lineOf(code, m.index) });
    }
    if (m[2] === "{" || m[2] === "[") {
      depth++; // a destructuring pattern opened right after the word
    }
  }
  return out;
}

/** The browser's parse of it (as a function's body — a script's statements, `return` aside): the syntax error's message, else "". */
function syntaxError(body: string): string {
  try {
    // Only parsed, never run: a Function made from the text, not called.
    new Function(body);
    return "";
  } catch (e) {
    return e instanceof SyntaxError ? e.message : "";
  }
}

/** A parse error that only says the text ended (something left open): no line of its own. */
const AT_END = /Unexpected end of input|end of script|missing \) after argument list/i;

const OPENERS = "([{";
const CLOSERS = ")]}";

/**
 * A bracket out of place, read over the code alone (comments and strings blanked): one closing nothing, one closing another's bracket,
 * or one never closed — where it is, in words; null when they all pair up.
 */
function bracketProblem(code: string): { message: string; line: number } | null {
  const stack: { c: string; line: number }[] = [];
  let line = 1;
  for (let i = 0; i < code.length; i++) {
    const c = code[i];
    if (c === "\n" || (c === "\r" && code[i + 1] !== "\n")) {
      line++;
      continue;
    }
    if (OPENERS.includes(c)) {
      stack.push({ c, line });
      continue;
    }
    const k = CLOSERS.indexOf(c);
    if (k < 0) {
      continue;
    }
    const top = stack.pop();
    if (!top) {
      return { message: `A ${c} that closes nothing`, line };
    }
    const needs = CLOSERS[OPENERS.indexOf(top.c)];
    if (needs !== c) {
      return { message: `A ${c} where the ${top.c} from line ${top.line} needs its ${needs}`, line };
    }
  }
  const left = stack.pop();
  return left ? { message: `The ${left.c} here is never closed (no ${CLOSERS[OPENERS.indexOf(left.c)]})`, line: left.line } : null;
}

/** The browser's message, in plain words — what, and after what on its line; no guess at the cause (it's often another). */
function plainMessage(message: string, lineText: string): string {
  const token = /^Unexpected (?:identifier|token|keyword) '(.+)'$/.exec(message);
  if (token) {
    const at = lineText.indexOf(token[1]);
    const before = at > 0 ? lineText.slice(Math.max(0, at - 24), at).trim() : "";
    return before ? `Unexpected "${token[1]}" after "${before}"` : `Unexpected "${token[1]}"`;
  }
  if (/^Unexpected string$/.test(message)) {
    return "A string where it can't go";
  }
  if (/^Unexpected number$/.test(message)) {
    return "A number where it can't go";
  }
  if (/Invalid or unexpected token/.test(message)) {
    return "A character that can't go here";
  }
  if (/Unexpected end of input/.test(message)) {
    return "It ends too soon";
  }
  return message;
}

/** The first quote never closed — a string run into its line's end (a template literal, the script's end): its line; null none. */
function unclosedQuote(src: string): { quote: string; line: number } | null {
  let line = 1;
  let i = 0;
  while (i < src.length) {
    const c = src[i];
    const n = src[i + 1];
    if (c === "\n" || (c === "\r" && n !== "\n")) {
      line++;
      i++;
    } else if (c === "/" && n === "/") {
      i = lineEnd(src, i);
    } else if (c === "/" && n === "*") {
      const end = src.indexOf("*/", i + 2);
      const j = end < 0 ? src.length : end + 2;
      line += src.slice(i, j).split(/\r\n|\r|\n/).length - 1;
      i = j;
    } else if (c === '"' || c === "'" || c === "`") {
      const from = line;
      let j = i + 1;
      while (j < src.length && src[j] !== c && (c === "`" || (src[j] !== "\n" && src[j] !== "\r"))) {
        j += src[j] === "\\" ? 2 : 1;
      }
      if (j >= src.length || src[j] !== c) {
        return { quote: c, line: from };
      }
      line += src.slice(i, j).split(/\r\n|\r|\n/).length - 1;
      i = j + 1;
    } else {
      i++;
    }
  }
  return null;
}

/**
 * Where a script's syntax fails, and why in plain words: a quote never closed, a bracket out of place (found over the code alone), else the first line at
 * which the browser's parse of the script so far fails for a reason other than its end (each prefix parsed — a script's few hundred
 * lines are quick); null when it parses. The browser's message alone has no line.
 */
function syntaxProblem(src: string): { message: string; line?: number } | null {
  const full = syntaxError(src);
  if (!full) {
    return null;
  }
  const quote = unclosedQuote(src);
  if (quote) {
    return { message: `The ${quote.quote} here is never closed`, line: quote.line };
  }
  const brackets = bracketProblem(codeOnly(src));
  if (brackets) {
    return brackets;
  }
  const lines = src.split(/\r\n|\r|\n/);
  for (let k = 1; k <= lines.length; k++) {
    const error = syntaxError(lines.slice(0, k).join("\n"));
    if (error && !AT_END.test(error)) {
      return { message: plainMessage(error, lines[k - 1]), line: k };
    }
  }
  return { message: plainMessage(full, "") };
}

/** A message as a sentence: a full stop after it, unless it ends in one already (a question). */
const sentence = (m: string) => (/[.?!]$/.test(m) ? m : `${m}.`);

/** What ESF would make of a Filter Component's script, or a Conditional Component's condition (errors first). */
export function esfScriptIssues(kind: EsfScriptKind, source: unknown): EsfScriptIssue[] {
  const src = String(source ?? "");
  const issues: EsfScriptIssue[] = [];
  if (!src.trim()) {
    return [
      {
        level: "error",
        title: kind === "filter" ? "No script" : "No condition",
        detail: kind === "filter" ? "ESF ignores every envelope it receives." : "ESF can't tell which port an envelope goes on.",
      },
    ];
  }
  const code = codeOnly(src);

  // Syntax: ESF logs it on the unit and drops every envelope.
  if (kind === "condition") {
    if (syntaxError(`return (${src}\n);`)) {
      const problem = syntaxProblem(src);
      if (problem) {
        issues.push({ level: "error", title: "Syntax error", detail: sentence(problem.message), line: problem.line });
      } else {
        issues.push({ level: "warning", title: "Not one expression", detail: "ESF takes the value of its last statement, which must be true or false." });
      }
    }
  } else {
    const problem = syntaxProblem(src);
    if (problem) {
      issues.push({ level: "error", title: "Syntax error", detail: sentence(problem.message), line: problem.line });
    }
  }

  // Top level: run again in the same context, a lexical declaration is declared twice; a return has no function to return from.
  if (kind === "filter") {
    for (const d of topLevel(code)) {
      if (d.word === "return") {
        issues.push({ level: "error", title: "return outside a function", detail: "ESF runs the script as a script, not a function body.", line: d.line });
      } else if (d.name === "output") {
        issues.push({
          level: "error",
          title: `${d.word} output`,
          detail: "ESF reads output as a global: declared with let or const it never sees it, and the next run fails. Use var output = [].",
          line: d.line,
        });
      } else {
        issues.push({
          level: "error",
          title: `Top-level ${d.word}${d.name && d.name !== "{" && d.name !== "[" ? ` ${d.name}` : ""}`,
          detail: "ESF runs the script again in the same context for each envelope, so from the second run it fails (already declared). Use var, or declare it inside a block or function.",
          line: d.line,
        });
      }
    }
  }

  // Java: the engine looks up no host classes.
  const java = new RegExp(`${START}(Java|Packages|java|javax)\\s*\\.`).exec(code);
  if (java) {
    issues.push({ level: "error", title: "Java classes", detail: "ESF's engine loads no Java classes: only the Wire records, the logger and the helpers.", line: lineAt(code, java) });
  }
  const exit = new RegExp(`${START}(exit|quit)\\s*\\(`).exec(code);
  if (exit) {
    issues.push({ level: "error", title: `${exit[1]}()`, detail: "ESF takes exit and quit out of the engine.", line: lineAt(code, exit) });
  }

  // Helpers: one ESF doesn't bind (a typo), unless the script makes it itself.
  const declared = new Set<string>();
  for (const m of code.matchAll(/\b(?:function|var|let|const)\s+([A-Za-z_$][\w$]*)/g)) {
    declared.add(m[1]);
  }
  for (const m of code.matchAll(new RegExp(`${START}(new[A-Z][\\w$]*)\\s*\\(`, "g"))) {
    if (!HELPERS.includes(m[1]) && !declared.has(m[1])) {
      issues.push({
        level: "error",
        title: `${m[1]} isn't ESF's`,
        detail: "ESF's helpers: newWireRecord, newByteArray, newBooleanValue, newByteArrayValue, newDoubleValue, newFloatValue, newIntegerValue, newLongValue, newStringValue.",
        line: lineAt(code, m),
      });
    }
  }
  for (const m of code.matchAll(new RegExp(`${START}logger\\s*\\.\\s*([A-Za-z_$][\\w$]*)`, "g"))) {
    if (!LOGGER_METHODS.has(m[1]) && !declared.has("logger")) {
      issues.push({ level: "error", title: `logger.${m[1]}`, detail: "logger is ESF's slf4j logger: trace, debug, info, warn, error.", line: lineAt(code, m) });
    }
  }

  // Output (a filter's): a global array of records, started anew each run.
  if (kind === "filter") {
    const assigned = new RegExp(`${START}output\\s*=(?!=)`).test(code) || /\bvar\s+output\b/.test(code);
    const used = new RegExp(`${START}output\\s*(\\[|\\.\\s*push\\b)`).exec(code);
    const record = new RegExp(`${START}output\\s*=\\s*newWireRecord\\b`).exec(code);
    if (record) {
      issues.push({ level: "error", title: "output is one record", detail: "ESF emits output only as an array of records: output = [newWireRecord(…)].", line: lineAt(code, record) });
    }
    if (used && !assigned) {
      issues.push({
        level: "warning",
        title: "output never started anew",
        detail: "The context keeps it between runs, so each run adds to the last run's records. Start it each run: var output = [].",
        line: lineAt(code, used),
      });
    }
    if (!used && !assigned) {
      issues.push({ level: "warning", title: "Emits nothing", detail: "The script never sets output, so ESF passes nothing on (and logs that output isn't an array)." });
    }
  }

  // Console: GraalJS prints it to the unit's standard output, not ESF's log.
  const consoleCall = new RegExp(`${START}console\\s*\\.`).exec(code);
  if (consoleCall) {
    issues.push({ level: "warning", title: "console", detail: "It goes to the unit's standard output, not ESF's log: use logger.info.", line: lineAt(code, consoleCall) });
  }

  return issues.sort((a, b) => (a.level === b.level ? 0 : a.level === "error" ? -1 : 1));
}

/** A completion ESF's bindings give (ThingsBoard's script editor's Ace completer): its name, what it is, a line on it. */
interface EsfScriptCompletion {
  value: string;
  meta: string;
  doc: string;
}

/** At the top level: ESF's bindings, its helpers, the DataType names. */
const GLOBALS: EsfScriptCompletion[] = [
  { value: "input", meta: "envelope", doc: "The wire envelope received: getEmitterPid(), getRecords()." },
  { value: "output", meta: "global", doc: "Set it to an array of records to emit them: var output = []; output.push(newWireRecord(properties))." },
  { value: "logger", meta: "slf4j", doc: "ESF's logger: logger.info('value = {}', value)." },
  { value: "newWireRecord", meta: "helper", doc: "newWireRecord(properties): a record of an object of names to TypedValues." },
  { value: "newByteArray", meta: "helper", doc: "newByteArray(size): a Java byte array." },
  { value: "newBooleanValue", meta: "helper", doc: "newBooleanValue(true): a BOOLEAN TypedValue." },
  { value: "newByteArrayValue", meta: "helper", doc: "newByteArrayValue(bytes): a BYTE_ARRAY TypedValue." },
  { value: "newDoubleValue", meta: "helper", doc: "newDoubleValue(1.5): a DOUBLE TypedValue." },
  { value: "newFloatValue", meta: "helper", doc: "newFloatValue(1.5): a FLOAT TypedValue." },
  { value: "newIntegerValue", meta: "helper", doc: "newIntegerValue(10): an INTEGER TypedValue." },
  { value: "newLongValue", meta: "helper", doc: "newLongValue(100): a LONG TypedValue." },
  { value: "newStringValue", meta: "helper", doc: "newStringValue('text'): a STRING TypedValue." },
  ...["BOOLEAN", "BYTE_ARRAY", "DOUBLE", "FLOAT", "INTEGER", "LONG", "STRING"].map((t) => ({ value: t, meta: "DataType", doc: `The ${t} DataType.` })),
];

/** After `input.`: the envelope's methods. */
const INPUT_MEMBERS: EsfScriptCompletion[] = [
  { value: "getEmitterPid", meta: "envelope", doc: "getEmitterPid(): the pid of the component that emitted the envelope." },
  { value: "getRecords", meta: "envelope", doc: "getRecords(): the envelope's records, an array." },
];

/** After `logger.`: slf4j's. */
const LOGGER_MEMBERS: EsfScriptCompletion[] = [
  ...["trace", "debug", "info", "warn", "error"].map((m) => ({ value: m, meta: "logger", doc: `logger.${m}('message {}', value): {} takes each value after it.` })),
  ...["isTraceEnabled", "isDebugEnabled", "isInfoEnabled", "isWarnEnabled", "isErrorEnabled"].map((m) => ({ value: m, meta: "logger", doc: `logger.${m}(): whether ESF logs that level.` })),
];

/** After any other `.`: a record's, a TypedValue's, an array's. */
const MEMBERS: EsfScriptCompletion[] = [
  { value: "getProperties", meta: "record", doc: "A record's properties: each name to its TypedValue (record.getProperties().TIMER)." },
  { value: "getValue", meta: "TypedValue", doc: "A property's value." },
  { value: "getType", meta: "TypedValue", doc: "A property's DataType." },
  { value: "push", meta: "array", doc: "output.push(record): a record added to what's emitted." },
  { value: "length", meta: "array", doc: "How many it holds." },
];

/** JavaScript's own words a Wire script uses. */
const KEYWORDS = ["var", "function", "if", "else", "for", "of", "while", "return", "typeof", "new", "true", "false", "null", "undefined", "break", "continue", "try", "catch"];

/** The script's own names (var, let, const, function), offered as they're used again. */
function declaredNames(text: string, except: string): EsfScriptCompletion[] {
  const names = new Set<string>();
  for (const m of codeOnly(text).matchAll(/\b(?:var|let|const|function)\s+([A-Za-z_$][\w$]*)/g)) {
    if (m[1] !== except) {
      names.add(m[1]);
    }
  }
  return [...names].map((n) => ({ value: n, meta: "variable", doc: "Declared in this script." }));
}

/** An Ace session as the completer reads it. */
interface CompleterSession {
  getLine(row: number): string;
  getValue(): string;
}

/**
 * ESF's own completions for ThingsBoard's script editor — the only ones (`tbScriptEditor [completers]`: Ace's snippets and its words
 * of the text left out), by what's before the word typed: after `input.` the envelope's methods, after `logger.` slf4j's, after any
 * other `.` a record's, a TypedValue's and an array's; elsewhere ESF's bindings and helpers, the DataType names, the script's own
 * names and JavaScript's words — each with what it is and a line on it.
 */
export const ESF_SCRIPT_COMPLETER = {
  identifierRegexps: [/[a-zA-Z_0-9$\u00A2-\uFFFF]/],
  getCompletions(
    _editor: unknown,
    session: CompleterSession,
    pos: { row: number; column: number },
    prefix: string,
    callback: (error: null, completions: { caption: string; value: string; meta: string; docText: string; score: number }[]) => void
  ): void {
    const before = session.getLine(pos.row).slice(0, Math.max(0, pos.column - prefix.length));
    let list: EsfScriptCompletion[];
    if (/\binput\s*\.\s*$/.test(before)) {
      list = INPUT_MEMBERS;
    } else if (/\blogger\s*\.\s*$/.test(before)) {
      list = LOGGER_MEMBERS;
    } else if (/\.\s*$/.test(before)) {
      list = MEMBERS;
    } else {
      const keywords = KEYWORDS.map((k) => ({ value: k, meta: "keyword", doc: "" }));
      list = [...GLOBALS, ...declaredNames(session.getValue(), prefix), ...keywords];
    }
    const p = prefix.toLowerCase();
    callback(
      null,
      list
        .filter((c) => c.value.toLowerCase().startsWith(p) && c.value !== prefix)
        .map((c, i) => ({ caption: c.value, value: c.value, meta: c.meta, docText: c.doc, score: 1000 - i }))
    );
  },
};

/** The completers ThingsBoard's script editor gets for an ESF script: ESF's alone. */
export const ESF_SCRIPT_COMPLETERS: unknown[] = [ESF_SCRIPT_COMPLETER];
