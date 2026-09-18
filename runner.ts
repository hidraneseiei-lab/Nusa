/**
 * =============================================================================
 *  BAHASA NUSA — Runner (Penghubung Pipeline Lengkap)
 * =============================================================================
 *  Kode Sumber ──► Lexer ──► Parser (AST) ──► Interpreter ──► Keluaran
 *
 *  File ini menyatukan seluruh tahap pipeline bahasa Nusa menjadi satu fungsi
 *  siap pakai `jalankanNusa()`, lengkap dengan penangkapan & pemformatan
 *  galat pada setiap tahap (leksikal, sintaksis, ataupun eksekusi/runtime).
 * =============================================================================
 */

import { lex } from "./lexer";
import { Parser } from "./parser";
import { Interpreter } from "./interpreter";
import { NusaError, NusaThrow } from "./errors";
import { stringify } from "./values";
import type { Token } from "./tokens";
import type { Program } from "./ast";

export interface RunLogLine {
  text: string;
  kind: "log" | "error" | "warn" | "system";
}

export interface RunResult {
  logs: RunLogLine[];
  tokens: Token[] | null;
  ast: Program | null;
  ok: boolean;
  durationMs: number;
}

export async function jalankanNusa(source: string, opts?: { fetchImpl?: typeof fetch }): Promise<RunResult> {
  const logs: RunLogLine[] = [];
  const startedAt = performance.now();
  const output = (text: string, kind: "log" | "error" | "warn" = "log") => {
    logs.push({ text, kind });
  };

  let tokens: Token[] | null = null;
  let ast: Program | null = null;

  try {
    tokens = lex(source);
  } catch (e) {
    if (e instanceof NusaError) {
      logs.push({ text: e.toDisplayString(), kind: "error" });
    } else {
      logs.push({ text: `Galat tak terduga pada tahap leksikal: ${(e as Error).message}`, kind: "error" });
    }
    return { logs, tokens, ast, ok: false, durationMs: performance.now() - startedAt };
  }

  try {
    const parser = new Parser(tokens);
    ast = parser.parseProgram();
  } catch (e) {
    if (e instanceof NusaError) {
      logs.push({ text: e.toDisplayString(), kind: "error" });
    } else {
      logs.push({ text: `Galat tak terduga pada tahap sintaksis: ${(e as Error).message}`, kind: "error" });
    }
    return { logs, tokens, ast, ok: false, durationMs: performance.now() - startedAt };
  }

  try {
    const interpreter = new Interpreter(output, opts?.fetchImpl ?? fetch.bind(globalThis));
    await interpreter.run(ast);
  } catch (e) {
    if (e instanceof NusaThrow) {
      logs.push({ text: `[Galat Program] Program melempar nilai: ${stringify(e.value)}`, kind: "error" });
    } else if (e instanceof NusaError) {
      logs.push({ text: e.toDisplayString(), kind: "error" });
    } else {
      logs.push({ text: `Galat tak terduga pada tahap eksekusi: ${(e as Error).message}`, kind: "error" });
    }
    return { logs, tokens, ast, ok: false, durationMs: performance.now() - startedAt };
  }

  return { logs, tokens, ast, ok: true, durationMs: performance.now() - startedAt };
}
