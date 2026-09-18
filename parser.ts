/**
 * =============================================================================
 *  BAHASA NUSA — Parser (Penyusun AST)
 * =============================================================================
 *  Parser mengambil daftar Token dari Lexer dan menyusunnya menjadi Abstract
 *  Syntax Tree (AST). Parser inilah yang menegakkan tata bahasa (grammar)
 *  resmi Bahasa Nusa — jika urutan token tidak sesuai aturan, ia akan
 *  melempar NusaParseError dengan pesan yang jelas.
 *
 *  Teknik: Recursive Descent Parser dengan precedence-climbing untuk
 *  ekspresi, dan backtracking (checkpoint) untuk menangkap ambiguitas lambda
 *  `(a, b) -> a + b` vs ekspresi berkurung biasa `(a + b)`.
 * =============================================================================
 */

import { lex } from "./lexer";
import { Token, TokenType } from "./tokens";
import { NusaParseError } from "./errors";
import * as A from "./ast";

export class Parser {
  private tokens: Token[];
  private pos = 0;

  constructor(tokens: Token[]) {
    this.tokens = tokens;
  }

  // ---------------------------------------------------------------------
  // Util token-stream
  // ---------------------------------------------------------------------
  private peek(offset = 0): Token {
    const idx = Math.min(this.pos + offset, this.tokens.length - 1);
    return this.tokens[idx];
  }
  private previous(): Token {
    return this.tokens[this.pos - 1];
  }
  private isAtEnd(): boolean {
    return this.peek().type === "EOF";
  }
  private check(type: TokenType): boolean {
    if (this.isAtEnd() && type !== "EOF") return false;
    return this.peek().type === type;
  }
  private advance(): Token {
    if (!this.isAtEnd()) this.pos++;
    return this.previous();
  }
  private match(...types: TokenType[]): boolean {
    for (const t of types) {
      if (this.check(t)) {
        this.advance();
        return true;
      }
    }
    return false;
  }
  private expect(type: TokenType, message: string): Token {
    if (this.check(type)) return this.advance();
    const tok = this.peek();
    throw new NusaParseError(
      `${message} (ditemukan '${tok.lexeme || tok.type}')`,
      tok.line,
      tok.col
    );
  }
  private checkpoint(): number {
    return this.pos;
  }
  private restore(mark: number) {
    this.pos = mark;
  }
  private loc(tok: Token) {
    return { line: tok.line, col: tok.col };
  }

  // ---------------------------------------------------------------------
  // Entry point
  // ---------------------------------------------------------------------
  public parseProgram(): A.Program {
    const start = this.peek();
    const body: A.Stmt[] = [];
    while (!this.isAtEnd()) {
      body.push(this.declaration());
    }
    return { kind: "Program", body, ...this.loc(start) };
  }

  // ---------------------------------------------------------------------
  // Pernyataan tingkat atas
  // ---------------------------------------------------------------------
  private declaration(): A.Stmt {
    if (this.check("SIMPAN") || this.check("TETAP")) return this.varDeclaration();
    if (this.check("ASINKRON") && this.peek(1).type === "FUNGSI") return this.functionDeclaration();
    if (this.check("FUNGSI")) return this.functionDeclaration();
    if (this.check("KELAS")) return this.classDeclaration();
    if (this.check("IMPOR")) return this.importStatement();
    if (this.check("EKSPOR")) return this.exportStatement();
    return this.statement();
  }

  private varDeclaration(): A.VarDeclStmt {
    const kw = this.advance(); // SIMPAN | TETAP
    const isConst = kw.type === "TETAP";
    const name = this.expect("IDENTIFIER", "Diharapkan nama variabel setelah 'simpan'/'tetap'").lexeme;
    let init: A.Expr | null = null;
    if (this.match("ASSIGN")) init = this.expression();
    this.consumeSemi();
    return { kind: "VarDecl", isConst, name, init, ...this.loc(kw) };
  }

  private functionDeclaration(): A.FunctionDeclStmt {
    let isAsync = false;
    let kw: Token;
    if (this.check("ASINKRON")) {
      kw = this.advance();
      isAsync = true;
      this.expect("FUNGSI", "Diharapkan 'fungsi' setelah 'asinkron'");
    } else {
      kw = this.expect("FUNGSI", "Diharapkan 'fungsi'");
    }
    const name = this.expect("IDENTIFIER", "Diharapkan nama fungsi").lexeme;
    this.expect("LPAREN", "Diharapkan '(' setelah nama fungsi");
    const params = this.parseParamList();
    this.expect("RPAREN", "Diharapkan ')' setelah daftar parameter");
    const body = this.block();
    return { kind: "FunctionDecl", name, params, body, isAsync, ...this.loc(kw) };
  }

  private parseParamList(): A.Param[] {
    const params: A.Param[] = [];
    if (!this.check("RPAREN")) {
      do {
        let rest = false;
        if (this.match("SPREAD")) rest = true;
        const pname = this.expect("IDENTIFIER", "Diharapkan nama parameter").lexeme;
        let def: A.Expr | undefined;
        if (!rest && this.match("ASSIGN")) def = this.expression();
        params.push({ name: pname, default: def, rest });
      } while (this.match("COMMA"));
    }
    return params;
  }

  private classDeclaration(): A.ClassDeclStmt {
    const kw = this.expect("KELAS", "Diharapkan 'kelas'");
    const name = this.expect("IDENTIFIER", "Diharapkan nama kelas").lexeme;
    let superClass: string | null = null;
    if (this.match("WARISI")) {
      superClass = this.expect("IDENTIFIER", "Diharapkan nama kelas induk setelah 'warisi'").lexeme;
    }
    this.expect("LBRACE", "Diharapkan '{' untuk membuka isi kelas");
    const methods: A.FunctionDeclStmt[] = [];
    const staticMethods: A.FunctionDeclStmt[] = [];
    while (!this.check("RBRACE") && !this.isAtEnd()) {
      let isStatic = false;
      if (this.check("IDENTIFIER") && this.peek().lexeme === "statis") {
        this.advance();
        isStatic = true;
      }
      const method = this.functionDeclaration();
      if (isStatic) staticMethods.push(method);
      else methods.push(method);
    }
    this.expect("RBRACE", "Diharapkan '}' untuk menutup isi kelas");
    return { kind: "ClassDecl", name, superClass, methods, staticMethods, ...this.loc(kw) };
  }

  private importStatement(): A.ImportStmt {
    const kw = this.expect("IMPOR", "Diharapkan 'impor'");
    const names: string[] = [];
    if (this.match("LBRACE")) {
      if (!this.check("RBRACE")) {
        do {
          names.push(this.expect("IDENTIFIER", "Diharapkan nama yang diimpor").lexeme);
        } while (this.match("COMMA"));
      }
      this.expect("RBRACE", "Diharapkan '}' setelah daftar impor");
    } else {
      names.push(this.expect("IDENTIFIER", "Diharapkan nama modul/identifier").lexeme);
    }
    this.expect("DARI", "Diharapkan 'dari' pada pernyataan impor");
    const from = this.expect("STRING", "Diharapkan path modul berupa teks").literal as string;
    this.consumeSemi();
    return { kind: "Import", names, from, ...this.loc(kw) };
  }

  private exportStatement(): A.ExportStmt {
    const kw = this.expect("EKSPOR", "Diharapkan 'ekspor'");
    const decl = this.declaration();
    return { kind: "Export", declaration: decl, ...this.loc(kw) };
  }

  private consumeSemi() {
    // Titik koma WAJIB untuk mengakhiri pernyataan sederhana. Ini sengaja dibuat wajib
    // (tidak memakai Automatic Semicolon Insertion ala JavaScript) demi menghindari
    // seluruh kelas bug ambiguitas baris baru yang terkenal rawan di bahasa lain.
    this.expect("SEMI", "Diharapkan ';' untuk mengakhiri pernyataan");
  }

  // ---------------------------------------------------------------------
  // Statement umum
  // ---------------------------------------------------------------------
  private statement(): A.Stmt {
    if (this.check("LBRACE")) return this.block();
    if (this.check("JIKA")) return this.ifStatement();
    if (this.check("SELAMA")) return this.whileStatement();
    if (this.check("ULANG")) return this.forStatement();
    if (this.check("UNTUK")) return this.forEachStatement();
    if (this.check("KEMBALI")) return this.returnStatement();
    if (this.check("BERHENTI")) return this.breakStatement();
    if (this.check("LANJUT")) return this.continueStatement();
    if (this.check("COBA")) return this.tryStatement();
    if (this.check("LEMPAR")) return this.throwStatement();
    return this.expressionStatement();
  }

  private block(): A.BlockStmt {
    const kw = this.expect("LBRACE", "Diharapkan '{' untuk membuka blok");
    const body: A.Stmt[] = [];
    while (!this.check("RBRACE") && !this.isAtEnd()) {
      body.push(this.declaration());
    }
    this.expect("RBRACE", "Diharapkan '}' untuk menutup blok");
    return { kind: "Block", body, ...this.loc(kw) };
  }

  private ifStatement(): A.IfStmt {
    const kw = this.expect("JIKA", "Diharapkan 'jika'");
    this.expect("LPAREN", "Diharapkan '(' setelah 'jika'");
    const test = this.expression();
    this.expect("RPAREN", "Diharapkan ')' setelah kondisi 'jika'");
    const consequent = this.statement();
    let alternate: A.Stmt | null = null;
    if (this.match("LAIN")) {
      if (this.check("JIKA")) {
        alternate = this.ifStatement();
      } else {
        alternate = this.statement();
      }
    }
    return { kind: "If", test, consequent, alternate, ...this.loc(kw) };
  }

  private whileStatement(): A.WhileStmt {
    const kw = this.expect("SELAMA", "Diharapkan 'selama'");
    this.expect("LPAREN", "Diharapkan '(' setelah 'selama'");
    const test = this.expression();
    this.expect("RPAREN", "Diharapkan ')' setelah kondisi 'selama'");
    const body = this.statement();
    return { kind: "While", test, body, ...this.loc(kw) };
  }

  private forStatement(): A.ForStmt {
    const kw = this.expect("ULANG", "Diharapkan 'ulang'");
    this.expect("LPAREN", "Diharapkan '(' setelah 'ulang'");
    let init: A.Stmt | null = null;
    if (this.check("SEMI")) {
      this.advance();
    } else if (this.check("SIMPAN") || this.check("TETAP")) {
      init = this.varDeclaration();
    } else {
      init = this.expressionStatement();
    }
    let test: A.Expr | null = null;
    if (!this.check("SEMI")) test = this.expression();
    this.expect("SEMI", "Diharapkan ';' setelah kondisi pada 'ulang'");
    let update: A.Expr | null = null;
    if (!this.check("RPAREN")) update = this.expression();
    this.expect("RPAREN", "Diharapkan ')' untuk menutup header 'ulang'");
    const body = this.statement();
    return { kind: "For", init, test, update, body, ...this.loc(kw) };
  }

  private forEachStatement(): A.ForEachStmt {
    const kw = this.expect("UNTUK", "Diharapkan 'untuk'");
    this.expect("SETIAP", "Diharapkan 'setiap' setelah 'untuk'");
    const varName = this.expect("IDENTIFIER", "Diharapkan nama variabel perulangan").lexeme;
    let indexName: string | undefined;
    if (this.match("COMMA")) {
      indexName = this.expect("IDENTIFIER", "Diharapkan nama indeks setelah ','").lexeme;
    }
    this.expect("DARI", "Diharapkan 'dari' pada perulangan 'untuk setiap'");
    const iterable = this.expression();
    const body = this.statement();
    return { kind: "ForEach", varName, indexName, iterable, body, ...this.loc(kw) };
  }

  private returnStatement(): A.ReturnStmt {
    const kw = this.expect("KEMBALI", "Diharapkan 'kembali'");
    let value: A.Expr | null = null;
    if (!this.check("SEMI") && !this.check("RBRACE") && !this.isAtEnd()) {
      value = this.expression();
    }
    this.consumeSemi();
    return { kind: "Return", value, ...this.loc(kw) };
  }

  private breakStatement(): A.BreakStmt {
    const kw = this.expect("BERHENTI", "Diharapkan 'berhenti'");
    this.consumeSemi();
    return { kind: "Break", ...this.loc(kw) };
  }

  private continueStatement(): A.ContinueStmt {
    const kw = this.expect("LANJUT", "Diharapkan 'lanjut'");
    this.consumeSemi();
    return { kind: "Continue", ...this.loc(kw) };
  }

  private tryStatement(): A.TryStmt {
    const kw = this.expect("COBA", "Diharapkan 'coba'");
    const block = this.block();
    let catchParam: string | null = null;
    let catchBlock: A.BlockStmt | null = null;
    let finallyBlock: A.BlockStmt | null = null;
    if (this.match("TANGKAP")) {
      if (this.match("LPAREN")) {
        catchParam = this.expect("IDENTIFIER", "Diharapkan nama variabel galat").lexeme;
        this.expect("RPAREN", "Diharapkan ')' setelah nama variabel galat");
      }
      catchBlock = this.block();
    }
    if (this.match("AKHIRNYA")) {
      finallyBlock = this.block();
    }
    if (!catchBlock && !finallyBlock) {
      throw new NusaParseError("Pernyataan 'coba' butuh setidaknya 'tangkap' atau 'akhirnya'", kw.line, kw.col);
    }
    return { kind: "Try", block, catchParam, catchBlock, finallyBlock, ...this.loc(kw) };
  }

  private throwStatement(): A.ThrowStmt {
    const kw = this.expect("LEMPAR", "Diharapkan 'lempar'");
    const argument = this.expression();
    this.consumeSemi();
    return { kind: "Throw", argument, ...this.loc(kw) };
  }

  private expressionStatement(): A.ExpressionStmt {
    const tok = this.peek();
    const expr = this.expression();
    this.consumeSemi();
    return { kind: "ExpressionStmt", expression: expr, ...this.loc(tok) };
  }

  // ---------------------------------------------------------------------
  // Ekspresi (precedence climbing, dari terendah ke tertinggi)
  // ---------------------------------------------------------------------
  private expression(): A.Expr {
    return this.assignment();
  }

  private assignment(): A.Expr {
    // Coba lambda terlebih dahulu (butuh backtracking)
    const lambda = this.tryParseLambda();
    if (lambda) return lambda;

    const expr = this.conditional();

    if (
      this.check("ASSIGN") ||
      this.check("PLUS_ASSIGN") ||
      this.check("MINUS_ASSIGN") ||
      this.check("STAR_ASSIGN") ||
      this.check("SLASH_ASSIGN")
    ) {
      const opTok = this.advance();
      const value = this.assignment();
      if (expr.kind !== "Identifier" && expr.kind !== "Member") {
        throw new NusaParseError("Target penugasan tidak valid", opTok.line, opTok.col);
      }
      const opMap: Record<string, A.AssignExpr["operator"]> = {
        ASSIGN: "=",
        PLUS_ASSIGN: "+=",
        MINUS_ASSIGN: "-=",
        STAR_ASSIGN: "*=",
        SLASH_ASSIGN: "/=",
      };
      return {
        kind: "Assign",
        operator: opMap[opTok.type],
        target: expr,
        value,
        ...this.loc(opTok),
      };
    }
    return expr;
  }

  /** Mencoba mem-parsing lambda `x -> expr` atau `(a, b) -> expr`. Backtrack jika gagal. */
  private tryParseLambda(): A.LambdaExpr | null {
    const mark = this.checkpoint();
    const startTok = this.peek();

    // Bentuk: IDENT -> ekspresi
    if (this.check("IDENTIFIER") && this.peek(1).type === "ARROW") {
      const pname = this.advance().lexeme;
      this.advance(); // ->
      const body = this.check("LBRACE") ? this.block() : this.expression();
      return { kind: "Lambda", params: [{ name: pname }], body, ...this.loc(startTok) };
    }

    // Bentuk: ( params ) -> ekspresi
    if (this.check("LPAREN")) {
      try {
        this.advance(); // (
        const params = this.parseParamList();
        if (!this.check("RPAREN")) {
          this.restore(mark);
          return null;
        }
        this.advance(); // )
        if (!this.check("ARROW")) {
          this.restore(mark);
          return null;
        }
        this.advance(); // ->
        const body = this.check("LBRACE") ? this.block() : this.expression();
        return { kind: "Lambda", params, body, ...this.loc(startTok) };
      } catch {
        this.restore(mark);
        return null;
      }
    }
    return null;
  }

  private conditional(): A.Expr {
    const test = this.logicalOr();
    if (this.match("QUESTION")) {
      const consequent = this.assignment();
      this.expect("COLON", "Diharapkan ':' pada ekspresi kondisional 'a ? b : c'");
      const alternate = this.assignment();
      return { kind: "Conditional", test, consequent, alternate, ...this.loc(this.previous()) };
    }
    return test;
  }

  private logicalOr(): A.Expr {
    let expr = this.logicalAnd();
    while (this.check("ATAU") || this.check("OR_OR")) {
      const opTok = this.advance();
      const right = this.logicalAnd();
      expr = { kind: "Logical", operator: "atau", left: expr, right, ...this.loc(opTok) };
    }
    return expr;
  }

  private logicalAnd(): A.Expr {
    let expr = this.equality();
    while (this.check("DAN") || this.check("AND_AND")) {
      const opTok = this.advance();
      const right = this.equality();
      expr = { kind: "Logical", operator: "dan", left: expr, right, ...this.loc(opTok) };
    }
    return expr;
  }

  private equality(): A.Expr {
    let expr = this.comparison();
    while (this.check("EQ") || this.check("NEQ")) {
      const opTok = this.advance();
      const right = this.comparison();
      expr = { kind: "Binary", operator: opTok.type === "EQ" ? "==" : "!=", left: expr, right, ...this.loc(opTok) };
    }
    return expr;
  }

  private comparison(): A.Expr {
    let expr = this.term();
    while (this.check("LT") || this.check("LTE") || this.check("GT") || this.check("GTE")) {
      const opTok = this.advance();
      const right = this.term();
      const opText = { LT: "<", LTE: "<=", GT: ">", GTE: ">=" }[opTok.type as "LT" | "LTE" | "GT" | "GTE"];
      expr = { kind: "Binary", operator: opText, left: expr, right, ...this.loc(opTok) };
    }
    return expr;
  }

  private term(): A.Expr {
    let expr = this.factor();
    while (this.check("PLUS") || this.check("MINUS")) {
      const opTok = this.advance();
      const right = this.factor();
      expr = { kind: "Binary", operator: opTok.type === "PLUS" ? "+" : "-", left: expr, right, ...this.loc(opTok) };
    }
    return expr;
  }

  private factor(): A.Expr {
    let expr = this.power();
    while (this.check("STAR") || this.check("SLASH") || this.check("PERSEN")) {
      const opTok = this.advance();
      const right = this.power();
      const opText = { STAR: "*", SLASH: "/", PERSEN: "%" }[opTok.type as "STAR" | "SLASH" | "PERSEN"];
      expr = { kind: "Binary", operator: opText, left: expr, right, ...this.loc(opTok) };
    }
    return expr;
  }

  private power(): A.Expr {
    const expr = this.unary();
    if (this.match("CARET")) {
      const opTok = this.previous();
      const right = this.power(); // kanan-asosiatif
      return { kind: "Binary", operator: "^", left: expr, right, ...this.loc(opTok) };
    }
    return expr;
  }

  private unary(): A.Expr {
    if (this.check("NOT") || this.check("TIDAK") || this.check("MINUS")) {
      const opTok = this.advance();
      const argument = this.unary();
      const op = opTok.type === "MINUS" ? "-" : opTok.type === "TIDAK" ? "tidak" : "!";
      return { kind: "Unary", operator: op as A.UnaryExpr["operator"], argument, ...this.loc(opTok) };
    }
    if (this.check("TUNGGU")) {
      const opTok = this.advance();
      const argument = this.unary();
      return { kind: "Await", argument, ...this.loc(opTok) };
    }
    if (this.check("SPREAD")) {
      const opTok = this.advance();
      const argument = this.unary();
      return { kind: "Spread", argument, ...this.loc(opTok) };
    }
    return this.callMember();
  }

  private callMember(): A.Expr {
    let expr = this.primary();
    for (;;) {
      if (this.match("LPAREN")) {
        const args = this.parseArgs();
        this.expect("RPAREN", "Diharapkan ')' setelah daftar argumen");
        expr = { kind: "Call", callee: expr, args, ...this.loc(this.previous()) };
      } else if (this.match("DOT")) {
        const name = this.expect("IDENTIFIER", "Diharapkan nama anggota setelah '.'").lexeme;
        expr = { kind: "Member", object: expr, property: name, computed: false, ...this.loc(this.previous()) };
      } else if (this.match("LBRACKET")) {
        const prop = this.expression();
        this.expect("RBRACKET", "Diharapkan ']' setelah indeks");
        expr = { kind: "Member", object: expr, property: prop, computed: true, ...this.loc(this.previous()) };
      } else {
        break;
      }
    }
    return expr;
  }

  private parseArgs(): A.Expr[] {
    const args: A.Expr[] = [];
    if (!this.check("RPAREN")) {
      do {
        args.push(this.expression());
      } while (this.match("COMMA"));
    }
    return args;
  }

  private primary(): A.Expr {
    const tok = this.peek();

    if (this.match("NUMBER")) return { kind: "Literal", value: this.previous().literal as number, ...this.loc(tok) };
    if (this.match("BENAR")) return { kind: "Literal", value: true, ...this.loc(tok) };
    if (this.match("SALAH")) return { kind: "Literal", value: false, ...this.loc(tok) };
    if (this.match("KOSONG")) return { kind: "Literal", value: null, ...this.loc(tok) };
    if (this.match("INI")) return { kind: "This", ...this.loc(tok) };
    if (this.match("INDUK")) return { kind: "Super", ...this.loc(tok) };

    if (this.match("STRING")) return this.buildTemplateLiteral(this.previous());

    if (this.match("IDENTIFIER")) return { kind: "Identifier", name: this.previous().lexeme, ...this.loc(tok) };

    if (this.match("BARU")) {
      const callee = this.callMemberNoCallArgsAllowedForNew();
      let args: A.Expr[] = [];
      if (this.match("LPAREN")) {
        args = this.parseArgs();
        this.expect("RPAREN", "Diharapkan ')' setelah argumen 'baru'");
      }
      return { kind: "New", callee, args, ...this.loc(tok) };
    }

    if (this.check("ASINKRON") && this.peek(1).type === "FUNGSI") {
      this.advance();
      const fnTok = this.advance(); // fungsi
      let name: string | undefined;
      if (this.check("IDENTIFIER")) name = this.advance().lexeme;
      this.expect("LPAREN", "Diharapkan '(' setelah 'fungsi'");
      const params = this.parseParamList();
      this.expect("RPAREN", "Diharapkan ')' setelah daftar parameter");
      const body = this.block();
      return { kind: "FunctionExpr", name, params, body, isAsync: true, ...this.loc(fnTok) };
    }

    if (this.match("FUNGSI")) {
      let name: string | undefined;
      if (this.check("IDENTIFIER")) name = this.advance().lexeme;
      this.expect("LPAREN", "Diharapkan '(' setelah 'fungsi'");
      const params = this.parseParamList();
      this.expect("RPAREN", "Diharapkan ')' setelah daftar parameter");
      const body = this.block();
      return { kind: "FunctionExpr", name, params, body, isAsync: false, ...this.loc(tok) };
    }

    if (this.match("LBRACKET")) {
      const elements: A.Expr[] = [];
      if (!this.check("RBRACKET")) {
        do {
          if (this.check("RBRACKET")) break; // trailing comma
          elements.push(this.expression());
        } while (this.match("COMMA"));
      }
      this.expect("RBRACKET", "Diharapkan ']' untuk menutup larik");
      return { kind: "Array", elements, ...this.loc(tok) };
    }

    if (this.match("LBRACE")) {
      const properties: A.ObjectExpr["properties"] = [];
      if (!this.check("RBRACE")) {
        do {
          if (this.check("RBRACE")) break; // trailing comma
          let key = "";
          let computed: A.Expr | undefined;
          if (this.match("LBRACKET")) {
            computed = this.expression();
            this.expect("RBRACKET", "Diharapkan ']' setelah kunci terkomputasi");
          } else if (this.check("STRING")) {
            key = this.advance().literal as string;
          } else {
            key = this.expect("IDENTIFIER", "Diharapkan nama kunci objek").lexeme;
          }
          let value: A.Expr;
          if (this.match("COLON")) {
            value = this.expression();
          } else {
            // shorthand { x } sama dengan { x: x }
            value = { kind: "Identifier", name: key, ...this.loc(this.previous()) };
          }
          properties.push({ key, computed, value });
        } while (this.match("COMMA"));
      }
      this.expect("RBRACE", "Diharapkan '}' untuk menutup objek");
      return { kind: "Object", properties, ...this.loc(tok) };
    }

    if (this.match("LPAREN")) {
      const expr = this.expression();
      this.expect("RPAREN", "Diharapkan ')' untuk menutup ekspresi berkurung");
      return expr;
    }

    throw new NusaParseError(
      `Ekspresi tidak diharapkan di sini (ditemukan '${tok.lexeme || tok.type}')`,
      tok.line,
      tok.col
    );
  }

  /** Parsing callee khusus untuk `baru X.Y(...)` tanpa langsung menelan tanda kurung panggilan */
  private callMemberNoCallArgsAllowedForNew(): A.Expr {
    let expr = this.primary();
    for (;;) {
      if (this.match("DOT")) {
        const name = this.expect("IDENTIFIER", "Diharapkan nama anggota setelah '.'").lexeme;
        expr = { kind: "Member", object: expr, property: name, computed: false, ...this.loc(this.previous()) };
      } else {
        break;
      }
    }
    return expr;
  }

  /** Membangun TemplateLiteral / Literal dari token STRING yang mungkin memiliki interpolasi */
  private buildTemplateLiteral(tok: Token): A.Expr {
    if (!tok.parts || tok.parts.length <= 1) {
      return { kind: "Literal", value: (tok.literal as string) ?? "", ...this.loc(tok) };
    }
    const parts: (A.LiteralExpr | A.Expr)[] = [];
    for (const part of tok.parts) {
      if (part.kind === "text") {
        parts.push({ kind: "Literal", value: part.value, line: tok.line, col: tok.col });
      } else {
        const subTokens = lex(part.source);
        const subParser = new Parser(subTokens);
        const expr = subParser.expression();
        parts.push(expr);
      }
    }
    return { kind: "TemplateLiteral", parts, ...this.loc(tok) };
  }
}

export function parse(source: string): A.Program {
  const tokens = lex(source);
  const parser = new Parser(tokens);
  return parser.parseProgram();
}
