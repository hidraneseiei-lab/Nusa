/**
 * =============================================================================
 *  BAHASA NUSA — Lexer / Tokenizer
 * =============================================================================
 *  Tugas modul ini adalah mengubah kode sumber Nusa (teks mentah) menjadi
 *  aliran (stream) token yang siap dikonsumsi oleh Parser.
 *
 *  Alur:  Kode Sumber (string)  ──►  Lexer.pindai()  ──►  Token[]
 *
 *  Fitur leksikal yang didukung:
 *   - Angka bulat & desimal (mis. 10, 3.14)
 *   - Teks dengan escape (\n \t \\ \" \') dan INTERPOLASI  "Halo {nama}!"
 *   - Komentar baris `// ...` dan blok `/* ... * /`
 *   - Seluruh kata kunci Bahasa Nusa (lihat tokens.ts)
 *   - Operator majemuk (==, !=, <=, >=, &&, ||, +=, -=, *=, /=, ->, ...)
 * =============================================================================
 */

import { KEYWORDS, StringPart, Token, TokenType } from "./tokens";
import { NusaLexError } from "./errors";

const isDigit = (c: string) => c >= "0" && c <= "9";
const isAlpha = (c: string) => /^[A-Za-z_$]$/.test(c);
const isAlphaNumeric = (c: string) => isAlpha(c) || isDigit(c);

export class Lexer {
  private source: string;
  private tokens: Token[] = [];
  private start = 0;
  private current = 0;
  private line = 1;
  private lineStart = 0; // index awal baris saat ini, untuk hitung kolom

  constructor(source: string) {
    this.source = source;
  }

  private get col(): number {
    return this.start - this.lineStart + 1;
  }

  private isAtEnd(): boolean {
    return this.current >= this.source.length;
  }

  private advance(): string {
    return this.source[this.current++];
  }

  private peek(offset = 0): string {
    const idx = this.current + offset;
    return idx < this.source.length ? this.source[idx] : "\0";
  }

  private match(expected: string): boolean {
    if (this.isAtEnd() || this.source[this.current] !== expected) return false;
    this.current++;
    return true;
  }

  private addToken(type: TokenType, literal?: unknown, parts?: StringPart[]) {
    const lexeme = this.source.slice(this.start, this.current);
    this.tokens.push({ type, lexeme, literal, parts, line: this.line, col: this.col });
  }

  private error(message: string): never {
    throw new NusaLexError(message, this.line, this.col);
  }

  /** Titik masuk utama: memindai seluruh kode sumber menjadi daftar Token */
  public pindai(): Token[] {
    while (!this.isAtEnd()) {
      this.start = this.current;
      this.scanToken();
    }
    this.start = this.current;
    this.tokens.push({ type: "EOF", lexeme: "", line: this.line, col: this.col });
    return this.tokens;
  }

  private newline() {
    this.line++;
    this.lineStart = this.current;
  }

  private scanToken() {
    const c = this.advance();

    switch (c) {
      case "(":
        this.addToken("LPAREN");
        break;
      case ")":
        this.addToken("RPAREN");
        break;
      case "{":
        this.addToken("LBRACE");
        break;
      case "}":
        this.addToken("RBRACE");
        break;
      case "[":
        this.addToken("LBRACKET");
        break;
      case "]":
        this.addToken("RBRACKET");
        break;
      case ",":
        this.addToken("COMMA");
        break;
      case ";":
        this.addToken("SEMI");
        break;
      case ":":
        this.addToken("COLON");
        break;
      case "?":
        this.addToken("QUESTION");
        break;
      case ".":
        if (this.peek() === "." && this.peek(1) === ".") {
          this.current += 2;
          this.addToken("SPREAD");
        } else {
          this.addToken("DOT");
        }
        break;
      case "+":
        this.addToken(this.match("=") ? "PLUS_ASSIGN" : "PLUS");
        break;
      case "-":
        if (this.match(">")) this.addToken("ARROW");
        else this.addToken(this.match("=") ? "MINUS_ASSIGN" : "MINUS");
        break;
      case "*":
        this.addToken(this.match("=") ? "STAR_ASSIGN" : "STAR");
        break;
      case "%":
        this.addToken("PERSEN");
        break;
      case "^":
        this.addToken("CARET");
        break;
      case "!":
        this.addToken(this.match("=") ? "NEQ" : "NOT");
        break;
      case "=":
        if (this.match("=")) this.addToken("EQ");
        else if (this.match(">")) this.addToken("ARROW");
        else this.addToken("ASSIGN");
        break;
      case "<":
        this.addToken(this.match("=") ? "LTE" : "LT");
        break;
      case ">":
        this.addToken(this.match("=") ? "GTE" : "GT");
        break;
      case "&":
        if (this.match("&")) this.addToken("AND_AND");
        else this.error("Karakter '&' tunggal tidak dikenali, mungkin maksud kamu '&&'?");
        break;
      case "|":
        if (this.match("|")) this.addToken("OR_OR");
        else this.error("Karakter '|' tunggal tidak dikenali, mungkin maksud kamu '||'?");
        break;
      case "/":
        if (this.match("/")) {
          while (this.peek() !== "\n" && !this.isAtEnd()) this.advance();
        } else if (this.match("*")) {
          this.scanBlockComment();
        } else {
          this.addToken(this.match("=") ? "SLASH_ASSIGN" : "SLASH");
        }
        break;
      case " ":
      case "\r":
      case "\t":
        break;
      case "\n":
        this.newline();
        break;
      case '"':
      case "'":
        this.scanString(c);
        break;
      default:
        if (isDigit(c)) {
          this.scanNumber();
        } else if (isAlpha(c)) {
          this.scanIdentifier();
        } else {
          this.error(`Karakter tidak dikenali: '${c}'`);
        }
    }
  }

  private scanBlockComment() {
    let depth = 1;
    while (depth > 0 && !this.isAtEnd()) {
      if (this.peek() === "/" && this.peek(1) === "*") {
        this.current += 2;
        depth++;
      } else if (this.peek() === "*" && this.peek(1) === "/") {
        this.current += 2;
        depth--;
      } else if (this.peek() === "\n") {
        this.advance();
        this.newline();
      } else {
        this.advance();
      }
    }
    if (depth > 0) this.error("Komentar blok '/* ... */' tidak pernah ditutup");
  }

  private scanNumber() {
    while (isDigit(this.peek())) this.advance();
    if (this.peek() === "." && isDigit(this.peek(1))) {
      this.advance();
      while (isDigit(this.peek())) this.advance();
    }
    // Notasi ilmiah: 1e10, 1.5e-3
    if (this.peek() === "e" || this.peek() === "E") {
      const next = this.peek(1);
      if (isDigit(next) || ((next === "+" || next === "-") && isDigit(this.peek(2)))) {
        this.advance();
        if (this.peek() === "+" || this.peek() === "-") this.advance();
        while (isDigit(this.peek())) this.advance();
      }
    }
    const text = this.source.slice(this.start, this.current);
    this.addToken("NUMBER", parseFloat(text));
  }

  private scanIdentifier() {
    while (isAlphaNumeric(this.peek())) this.advance();
    const text = this.source.slice(this.start, this.current);
    const type = KEYWORDS[text];
    this.addToken(type ?? "IDENTIFIER", text);
  }

  /**
   * Memindai literal string, mendukung escape sequence dan interpolasi `{...}`.
   * Hasilnya adalah token STRING dengan `parts`: campuran teks literal & sumber
   * ekspresi mentah yang nanti akan di-lexer & di-parse ulang secara terpisah.
   */
  private scanString(quote: string) {
    const parts: StringPart[] = [];
    let buffer = "";

    const flush = () => {
      if (buffer.length > 0) {
        parts.push({ kind: "text", value: buffer });
        buffer = "";
      }
    };

    while (this.peek() !== quote && !this.isAtEnd()) {
      const ch = this.peek();
      if (ch === "\n") {
        this.error("Literal teks tidak boleh melompati baris baru tanpa escape '\\n'");
      }
      if (ch === "\\") {
        this.advance();
        const esc = this.advance();
        switch (esc) {
          case "n":
            buffer += "\n";
            break;
          case "t":
            buffer += "\t";
            break;
          case "r":
            buffer += "\r";
            break;
          case "\\":
            buffer += "\\";
            break;
          case "'":
            buffer += "'";
            break;
          case '"':
            buffer += '"';
            break;
          case "{":
            buffer += "{";
            break;
          case "}":
            buffer += "}";
            break;
          case "0":
            buffer += "\0";
            break;
          default:
            buffer += esc;
        }
        continue;
      }
      if (ch === "{") {
        this.advance(); // konsumsi '{'
        flush();
        let depth = 1;
        const exprStart = this.current;
        const exprLine = this.line;
        while (depth > 0) {
          if (this.isAtEnd()) this.error("Interpolasi '{...}' pada teks tidak pernah ditutup");
          const cc = this.peek();
          if (cc === "{") depth++;
          if (cc === "}") {
            depth--;
            if (depth === 0) break;
          }
          if (cc === "\n") this.newline();
          this.advance();
        }
        const exprSource = this.source.slice(exprStart, this.current);
        this.advance(); // konsumsi '}'
        parts.push({ kind: "expr", source: exprSource, line: exprLine });
        continue;
      }
      buffer += ch;
      this.advance();
    }

    if (this.isAtEnd()) this.error("Literal teks tidak pernah ditutup dengan kutip penutup");
    this.advance(); // konsumsi kutip penutup
    flush();

    if (parts.length === 1 && parts[0].kind === "text") {
      this.addToken("STRING", parts[0].value, parts);
    } else if (parts.length === 0) {
      this.addToken("STRING", "", []);
    } else {
      this.addToken("STRING", undefined, parts);
    }
  }
}

/** Fungsi bantu singkat untuk memindai kode sumber menjadi token */
export function lex(source: string): Token[] {
  return new Lexer(source).pindai();
}
