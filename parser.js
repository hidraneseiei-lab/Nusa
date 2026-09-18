/**
 * NusaLang v2 — Parser (Recursive Descent)
 * Mengubah token stream menjadi Abstract Syntax Tree (AST)
 * Mendukung: semua fitur C++ yang relevan dalam sintaks NusaLang
 */

'use strict';

const _tok = (typeof module !== 'undefined') ? require('./tokens') : window._NK_TOKENS;
const _err = (typeof module !== 'undefined') ? require('./errors')  : window._NK_ERRORS;

const { TokenType: TT, PRIMITIVE_TYPES, Token } = _tok;
const { ParseError } = _err;

class Parser {
  constructor(tokens, source) {
    this.tokens  = tokens;
    this.source  = source || '';
    this.pos     = 0;
    this.labels  = new Set();
  }

  // ─── Utilities ───
  peek(off = 0) {
    const idx = Math.min(this.pos + off, this.tokens.length - 1);
    return this.tokens[idx];
  }
  advance() {
    const t = this.tokens[this.pos];
    if (this.pos < this.tokens.length - 1) this.pos++;
    return t;
  }
  check(type) { return this.peek().type === type; }
  match(...types) {
    for (const t of types) if (this.check(t)) return this.advance();
    return null;
  }
  expect(type, msg) {
    if (!this.check(type)) {
      const tok = this.peek();
      throw new ParseError(
        msg || `Diharapkan '${type}' tetapi mendapat '${tok.value !== null ? tok.value : tok.type}'`,
        tok, this.source
      );
    }
    return this.advance();
  }
  error(msg, tok) {
    throw new ParseError(msg, tok || this.peek(), this.source);
  }

  // ─── Tipe Parsing ───
  isTypeStart() {
    const t = this.peek().type;
    if (t === TT.MUNGKIN) return true; // mungkin <tipe> ... -- selalu diikuti tipe beneran
    if (PRIMITIVE_TYPES.has(t)) return true;
    // user-defined type: IDENT followed by IDENT or * or [
    if (t === TT.IDENT) {
      const n = this.peek(1).type;
      return [TT.IDENT, TT.BINTANG, TT.BIT_AND, TT.LBRACKET, TT.DOUBLE_COLON].includes(n);
    }
    return false;
  }

  parseType() {
    // qualifiers
    let isConst = false, isVolatile = false, isStatic = false, isNullable = false;
    while (true) {
      if (this.check(TT.PAS))   { this.advance(); isConst = true; }
      else if (this.check(TT.STATIS)) { this.advance(); isStatic = true; }
      else if (this.check(TT.MUNGKIN)) { this.advance(); isNullable = true; }
      else break;
    }

    let baseName;
    const tok = this.peek();
    if (tok.type === TT.GAS) {
      // Function-type: fn(paramType, paramType, ...) -> returnType
      this.advance();
      this.expect(TT.LPAREN, "Diharapkan '(' setelah 'gas' pada tipe fungsi");
      const paramTypes = [];
      while (!this.check(TT.RPAREN) && !this.check(TT.EOF)) {
        paramTypes.push(this.parseType());
        if (!this.check(TT.RPAREN)) this.expect(TT.COMMA, 'Diharapkan koma antar tipe parameter');
      }
      this.expect(TT.RPAREN);
      let fnReturnType = { baseName: 'kosong', pointers: 0, isRef: false, isConst: false, templateArgs: null };
      if (this.match(TT.ARROW)) fnReturnType = this.parseType();
      // Pointer/ref on the function type itself (rare, but keep symmetry)
      let fnPointers = 0, fnIsRef = false;
      while (this.check(TT.BINTANG)) { this.advance(); fnPointers++; }
      if (this.check(TT.BIT_AND)) { this.advance(); fnIsRef = true; }
      return {
        baseName: 'fn', isFnType: true, paramTypes, returnType: fnReturnType,
        pointers: fnPointers, isRef: fnIsRef, isConst, isStatic, isNullable, templateArgs: null, line: tok.line,
      };
    } else if (PRIMITIVE_TYPES.has(tok.type)) {
      baseName = this.advance().value;
    } else if (tok.type === TT.IDENT) {
      baseName = this.advance().value;
      // namespace::Type
      while (this.check(TT.DOUBLE_COLON)) {
        this.advance();
        baseName += '::' + this.expect(TT.IDENT).value;
      }
    } else {
      this.error(`Diharapkan nama tipe, dapat '${tok.value || tok.type}'`, tok);
    }

    // Template: Tipe<T, U>
    let templateArgs = null;
    if (this.check(TT.LT)) {
      this.advance();
      templateArgs = [];
      while (!this.check(TT.GT) && !this.check(TT.EOF)) {
        templateArgs.push(this.parseType());
        if (!this.check(TT.GT)) this.expect(TT.COMMA);
      }
      this.expect(TT.GT);
    }

    // Pointer / ref: *, &, **
    let pointers = 0, isRef = false;
    while (this.check(TT.BINTANG)) { this.advance(); pointers++; }
    if (this.check(TT.BIT_AND))    { this.advance(); isRef = true; }

    // Array dimensions: [N] — parsed during varDecl
    return { baseName, pointers, isRef, isConst, isStatic, isNullable, templateArgs, line: tok.line };
  }

  // Check if current position is start of var declaration (lookahead)
  isVarDecl() {
    let p = this.pos;
    const toks = this.tokens;
    const len  = toks.length;

    // skip qualifiers
    while (p < len && [TT.PAS, TT.STATIS, TT.LUAR, TT.MUNGKIN].includes(toks[p].type)) p++;
    // type base
    if (!PRIMITIVE_TYPES.has(toks[p].type) && toks[p].type !== TT.IDENT) return false;
    p++;
    // namespace::
    while (p < len && toks[p].type === TT.DOUBLE_COLON) { p++; if (toks[p].type === TT.IDENT) p++; }
    // template args
    if (p < len && toks[p].type === TT.LT) {
      let depth = 1; p++;
      while (p < len && depth > 0) {
        if (toks[p].type === TT.LT) depth++;
        if (toks[p].type === TT.GT) depth--;
        p++;
      }
    }
    // * and &
    while (p < len && (toks[p].type === TT.BINTANG || toks[p].type === TT.BIT_AND)) p++;
    // must be followed by IDENT
    if (p >= len || toks[p].type !== TT.IDENT) return false;
    p++;
    // array dims, or = or ; or ,
    while (p < len && toks[p].type === TT.LBRACKET) {
      while (p < len && toks[p].type !== TT.RBRACKET) p++;
      p++;
    }
    return p < len && [TT.ASSIGN, TT.SEMICOLON, TT.COMMA, TT.LPAREN].includes(toks[p].type);
  }

  // ─── Top Level ───
  parse() {
    const body = [];
    while (!this.check(TT.EOF)) {
      body.push(this.topLevel());
    }
    return { type: 'Program', body };
  }

  topLevel() {
    if (this.check(TT.HASH))      return this.directive();
    if (this.check(TT.MUAT))      return this.muatStmt();
    if (this.check(TT.RUANG))     return this.namespaceDecl();
    if (this.check(TT.TES))       return this.tesDecl();
    if (this.check(TT.PAKAI))   return this.usingDecl();
    if (this.check(TT.CETAKAN))  return this.templateDecl();
    if (this.check(TT.BENTUK))      return this.structDecl();
    if (this.check(TT.KELAS))     return this.classDecl();
    if (this.check(TT.ANTARMUKA)) return this.interfaceDecl();
    if (this.check(TT.GABUNGAN))     return this.unionDecl();
    if (this.check(TT.PILIHAN))    return this.enumDecl();
    if (this.check(TT.GAS))        return this.funcDecl();
    if (this.check(TT.PAS) && this.peek(1).type !== TT.IDENT) return this.stmt();
    if (this.isTypeStart() && this.isVarDecl()) return this.varDecl();
    return this.stmt();
  }

  // ─── Muat (import/include, sintaks statement biasa) ───
  // muat "nama_file.nsk"; -- alternatif yang lebih ramah pemula dari #muat "..."
  muatStmt() {
    const tok = this.advance(); // 'muat'
    const path = this.expect(TT.STRING, "Diharapkan nama file (teks) setelah 'muat'").value;
    this.match(TT.SEMICOLON);
    return { type: 'Directive', name: 'muat', path, line: tok.line };
  }

  // ─── Directives ───
  directive() {
    const tok = this.advance(); // #
    const name = this.expect(TT.IDENT, 'Nama direktif diharapkan setelah #').value;
    if (name === 'muat') {
      const path = this.expect(TT.STRING, 'Path file diharapkan setelah #muat').value;
      return { type: 'Directive', name: 'muat', path, line: tok.line };
    }
    if (name === 'definisi') {
      const macroName = this.expect(TT.IDENT).value;
      let macroValue = null;
      if (!this.check(TT.SEMICOLON) && !this.check(TT.EOF)) macroValue = this.expr();
      this.match(TT.SEMICOLON);
      return { type: 'Directive', name: 'definisi', macroName, macroValue, line: tok.line };
    }
    if (name === 'jika_ada') {
      const macroName = this.expect(TT.IDENT).value;
      return { type: 'Directive', name: 'jika_ada', macroName, line: tok.line };
    }
    if (name === 'pragma') {
      const arg = this.check(TT.IDENT) ? this.advance().value : '';
      return { type: 'Directive', name: 'pragma', arg, line: tok.line };
    }
    return { type: 'Directive', name, line: tok.line };
  }

  // ─── Namespace ───
  namespaceDecl() {
    const tok = this.advance();
    const name = this.expect(TT.IDENT, 'Nama ruang (namespace) diharapkan').value;
    const body = this.block();
    return { type: 'NamespaceDecl', name, body, line: tok.line };
  }

  // ─── Tes bawaan: tes "nama tes" { pastikan(...); harusSama(a, b); } ───
  tesDecl() {
    const tok = this.advance(); // 'tes'
    const nameTok = this.expect(TT.STRING, "Diharapkan nama tes (teks) setelah 'tes'");
    const body = this.block();
    return { type: 'TesDecl', name: nameTok.value, body, line: tok.line };
  }

  usingDecl() {
    const tok = this.advance();
    let path = this.expect(TT.IDENT).value;
    while (this.check(TT.DOUBLE_COLON)) {
      this.advance(); path += '::' + this.expect(TT.IDENT).value;
    }
    this.expect(TT.SEMICOLON);
    return { type: 'UsingDecl', path, line: tok.line };
  }

  // ─── Template ───
  templateDecl() {
    const tok = this.advance(); // template
    this.expect(TT.LT, "Diharapkan '<' setelah template");
    const params = [];
    while (!this.check(TT.GT) && !this.check(TT.EOF)) {
      if (this.check(TT.JENIS) || this.check(TT.KELAS)) {
        this.advance();
        const name = this.expect(TT.IDENT).value;
        let defaultType = null;
        if (this.match(TT.ASSIGN)) defaultType = this.parseType();
        params.push({ kind: 'type', name, defaultType });
      } else {
        const pt = this.parseType();
        const name = this.expect(TT.IDENT).value;
        params.push({ kind: 'value', typeDef: pt, name });
      }
      if (!this.check(TT.GT)) this.expect(TT.COMMA);
    }
    this.expect(TT.GT);
    let decl;
    if (this.check(TT.GAS))       decl = this.funcDecl();
    else if (this.check(TT.KELAS)) decl = this.classDecl();
    else if (this.check(TT.BENTUK))  decl = this.structDecl();
    else this.error('Diharapkan gas, kelas, atau bentuk setelah cetakan<...>');
    return { type: 'TemplateDecl', params, decl, line: tok.line };
  }

  // ─── Operator overload: gas operator+(Titik lain) -> Titik { ... } ───
  // Method khusus di dalam bentuk/kelas yang namanya adalah simbol operator.
  // Nama internal disimpan sebagai 'operator+', 'operator==', dst supaya
  // gampang dicari saat _binaryOp() nemu operand berupa struct/objek.
  operatorDecl() {
    const tok = this.expect(TT.GAS, "Diharapkan 'gas'"); // 'gas operator+(...)'
    this.expect(TT.OPERATOR, "Diharapkan 'operator' setelah 'gas'");
    const opTokenTypes = [
      TT.PLUS, TT.MINUS, TT.BINTANG, TT.BAGI, TT.MODULO, TT.PANGKAT_OP,
      TT.EQ, TT.NEQ, TT.LT, TT.GT, TT.LTE, TT.GTE,
      TT.BIT_AND, TT.BIT_OR, TT.BIT_XOR, TT.LSHIFT, TT.RSHIFT,
    ];
    const opTok = this.peek();
    if (!opTokenTypes.includes(opTok.type)) {
      this.error(`Diharapkan simbol operator (+, -, *, /, ==, dst) setelah 'operator', dapat '${opTok.value}'`, opTok);
    }
    const opSymbol = this.advance().value;
    this.expect(TT.LPAREN, "Diharapkan '(' setelah operator" + opSymbol);
    const params = [];
    while (!this.check(TT.RPAREN) && !this.check(TT.EOF)) {
      const pt = this.parseType();
      const pname = this.expect(TT.IDENT, 'Nama parameter diharapkan').value;
      params.push({ typeDef: pt, name: pname, dims: [], defaultVal: null });
      if (!this.check(TT.RPAREN)) this.expect(TT.COMMA, 'Diharapkan koma antar parameter');
    }
    this.expect(TT.RPAREN);
    let returnType = { baseName: 'kosong', pointers: 0, isRef: false, isConst: false, templateArgs: null };
    if (this.match(TT.ARROW)) returnType = this.parseType();
    const body = this.block();
    return { type: 'FuncDecl', name: 'operator' + opSymbol, params, returnType, body, isVariadic: false, isOperator: true, opSymbol, line: tok.line };
  }

  // Lookahead: apakah token saat ini memulai 'gas operator<simbol>(...)'?
  isOperatorDeclStart() {
    return this.check(TT.GAS) && this.peek(1).type === TT.OPERATOR;
  }

  // ─── Struct / Class / Interface / Union ───
  structDecl(isUnion = false) {
    const tok = this.advance();
    const name = this.expect(TT.IDENT, 'Nama tipe diharapkan').value;
    let base = null;
    if (this.match(TT.TURUNAN)) base = this.parseType();
    this.expect(TT.LBRACE);
    const fields = [], methods = [];
    let currentAccess = 'publik';

    while (!this.check(TT.RBRACE) && !this.check(TT.EOF)) {
      if ([TT.PUBLIK, TT.PRIVAT, TT.LINDUNG].includes(this.peek().type)) {
        currentAccess = this.advance().value;
        this.match(TT.COLON);
        continue;
      }
      if (this.isOperatorDeclStart()) {
        const m = this.operatorDecl();
        m.access = currentAccess;
        methods.push(m);
      } else if (this.check(TT.GAS) || this.check(TT.VIRTUAL) || this.check(TT.STATIS) || this.check(TT.TEMAN)) {
        const m = this.methodDecl(name);
        m.access = currentAccess;
        methods.push(m);
      } else if (this.check(TT.BENTUK)) {
        methods.push(this.structDecl()); // nested struct
      } else if (this.isTypeStart()) {
        const f = this.fieldDecl();
        f.access = currentAccess;
        fields.push(f);
      } else {
        this.error(`Deklarasi tidak valid di dalam ${isUnion ? 'union' : 'tipe'} '${name}'`);
      }
    }
    this.expect(TT.RBRACE);
    this.match(TT.SEMICOLON);
    return { type: isUnion ? 'UnionDecl' : 'StructDecl', name, base, fields, methods, line: tok.line };
  }

  unionDecl() { return this.structDecl(true); }

  classDecl() {
    const tok = this.advance(); // kelas
    const name = this.expect(TT.IDENT).value;
    let bases = [];
    if (this.match(TT.TURUNAN)) {
      bases.push(this.parseType());
      while (this.match(TT.COMMA)) bases.push(this.parseType());
    }
    if (this.check(TT.IDENT) && this.peek().value === 'punyaSifat') {
      this.advance();
      let iface = this.parseType();
      bases.push({ ...iface, isInterface: true });
      while (this.match(TT.COMMA)) {
        iface = this.parseType();
        bases.push({ ...iface, isInterface: true });
      }
    }
    const isFinal = this.match(TT.AKHIR); // kelas Nama akhir { ... } -- gak boleh diturunin lagi
    this.expect(TT.LBRACE);
    const fields = [], methods = [], ctors = [], dtor = null;
    let currentAccess = 'privat';

    while (!this.check(TT.RBRACE) && !this.check(TT.EOF)) {
      if ([TT.PUBLIK, TT.PRIVAT, TT.LINDUNG].includes(this.peek().type)) {
        currentAccess = this.advance().value; this.match(TT.COLON); continue;
      }
      if (this.check(TT.TEMAN)) {
        this.advance(); const fd = this.funcDecl(); fd.isFriend = true; methods.push(fd); continue;
      }
      if (this.check(TT.BIT_NOT)) {
        this.error(`Destructor (~${name}) belum didukung di NusaKids. NusaKids pakai garbage collector otomatis (kayak JavaScript), jadi gak ada cara pasti buat tahu kapan objek "dihapus" -- gak seperti C++. Kalau perlu bersihin sesuatu manual, bikin method biasa (misal gas tutup() { ... }) dan panggil sendiri pas udah selesai pakai objeknya.`);
      }
      if (this.isOperatorDeclStart()) {
        const m = this.operatorDecl();
        m.access = currentAccess;
        methods.push(m);
        continue;
      }
      if (this.check(TT.VIRTUAL) || this.check(TT.GAS) || this.check(TT.STATIS) || this.check(TT.TIMPA) || this.check(TT.ABSTRAK)) {
        const m = this.methodDecl(name);
        m.access = currentAccess;
        methods.push(m);
      } else if (this.isTypeStart()) {
        const f = this.fieldDecl(); f.access = currentAccess; fields.push(f);
      } else {
        this.error(`Deklarasi tidak valid di dalam kelas '${name}'`);
      }
    }
    this.expect(TT.RBRACE);
    this.match(TT.SEMICOLON);
    return { type: 'ClassDecl', name, bases, fields, methods, isFinal, line: tok.line };
  }

  interfaceDecl() {
    const tok = this.advance();
    const name = this.expect(TT.IDENT).value;
    this.expect(TT.LBRACE);
    const methods = [];
    while (!this.check(TT.RBRACE) && !this.check(TT.EOF)) {
      const m = this.methodDecl(name, true);
      methods.push(m);
    }
    this.expect(TT.RBRACE);
    this.match(TT.SEMICOLON);
    return { type: 'InterfaceDecl', name, methods, line: tok.line };
  }

  fieldDecl() {
    const typeDef = this.parseType();
    const names = [];
    do {
      const name = this.expect(TT.IDENT, 'Nama field diharapkan').value;
      let dims = [], bitWidth = null;
      while (this.check(TT.LBRACKET)) {
        this.advance();
        dims.push(this.check(TT.RBRACKET) ? null : this.expr());
        this.expect(TT.RBRACKET);
      }
      let init = null;
      if (this.match(TT.ASSIGN)) init = this.expr();
      names.push({ name, dims, init, bitWidth });
    } while (this.match(TT.COMMA));
    this.expect(TT.SEMICOLON);
    return { type: 'FieldDecl', typeDef, names, line: typeDef.line };
  }

  methodDecl(className, isAbstract = false) {
    let isVirtual = false, isStatic = false, isOverride = false, isAbstractFn = false, isFriend = false;
    while (true) {
      if (this.check(TT.VIRTUAL))   { this.advance(); isVirtual = true; }
      else if (this.check(TT.STATIS)) { this.advance(); isStatic = true; }
      else if (this.check(TT.TIMPA)) { this.advance(); isOverride = true; }
      else if (this.check(TT.ABSTRAK)) { this.advance(); isAbstractFn = true; }
      else break;
    }
    const fn = this.funcDecl();
    fn.isVirtual = isVirtual;
    fn.isStatic  = isStatic;
    fn.isOverride= isOverride;
    fn.isAbstract= isAbstractFn || isAbstract;
    fn.isFriend  = isFriend;
    return fn;
  }

  // ─── Enum ───
  enumDecl() {
    const tok = this.advance();
    // daftar kelas? (enum class)
    const isClass = this.match(TT.KELAS) !== null;
    const name = this.expect(TT.IDENT, 'Nama daftar diharapkan').value;
    let baseType = null;
    if (this.match(TT.COLON)) baseType = this.parseType();
    this.expect(TT.LBRACE);
    const members = [];
    let counter = 0;
    while (!this.check(TT.RBRACE) && !this.check(TT.EOF)) {
      const mname = this.expect(TT.IDENT, 'Nama anggota daftar diharapkan').value;
      let value = null;
      if (this.match(TT.ASSIGN)) {
        value = this.expr();
        counter = null;
      } else {
        value = { type: 'Literal', kind: 'angka', value: counter++, line: tok.line };
      }
      members.push({ name: mname, value });
      if (!this.check(TT.RBRACE)) this.match(TT.COMMA);
    }
    this.expect(TT.RBRACE);
    this.match(TT.SEMICOLON);
    return { type: 'EnumDecl', name, isClass, baseType, members, line: tok.line };
  }

  // ─── Function Declaration ───
  funcDecl() {
    const tok = this.expect(TT.GAS, "Diharapkan 'gas'");
    const name = this.expect(TT.IDENT, 'Nama fungsi diharapkan').value;
    this.expect(TT.LPAREN, "Diharapkan '(' setelah nama fungsi");

    const params = [];
    let isVariadic = false;

    while (!this.check(TT.RPAREN) && !this.check(TT.EOF)) {
      if (this.check(TT.ELLIPSIS)) { this.advance(); isVariadic = true; break; }
      const pt = this.parseType();
      const pname = this.expect(TT.IDENT, 'Nama parameter diharapkan').value;
      let dims = [];
      while (this.check(TT.LBRACKET)) {
        this.advance();
        dims.push(this.check(TT.RBRACKET) ? null : this.expr());
        this.expect(TT.RBRACKET);
      }
      let defaultVal = null;
      if (this.match(TT.ASSIGN)) defaultVal = this.expr();
      params.push({ typeDef: pt, name: pname, dims, defaultVal });
      if (!this.check(TT.RPAREN)) this.expect(TT.COMMA, 'Diharapkan koma antar parameter');
    }
    this.expect(TT.RPAREN, "Diharapkan ')'");

    let returnType = { baseName: 'kosong', pointers: 0, isRef: false, isConst: false, templateArgs: null };
    if (this.match(TT.ARROW)) returnType = this.parseType();

    // 'akhir' (final) — method gak boleh ditimpa turunannya. Ditulis setelah
    // return type, sebelum body: gas suara() -> kata akhir { ... }
    const isFinal = this.match(TT.AKHIR);

    // noexcept keyword
    const noexcept = this.check(TT.IDENT) && this.peek().value === 'noexcept' ? (this.advance(), true) : false;

    // = 0 (pure virtual)
    let isPure = false;
    if (this.check(TT.ASSIGN) && this.peek(1).value === 0) { this.advance(); this.advance(); isPure = true; }

    let body = null;
    if (this.check(TT.LBRACE)) body = this.block();
    else this.match(TT.SEMICOLON); // forward declaration

    return { type: 'FuncDecl', name, params, returnType, body, isVariadic, noexcept, isPure, isFinal, line: tok.line };
  }

  // ─── Variable Declaration ───
  varDecl() {
    const startTok = this.peek();
    let isStatic = false, isExtern = false, isConst = false;
    if (this.check(TT.STATIS)) { this.advance(); isStatic = true; }
    if (this.check(TT.LUAR))   { this.advance(); isExtern = true; }
    if (this.check(TT.PAS))  { this.advance(); isConst  = true; }

    const typeDef = this.parseType();
    if (isConst || typeDef.isConst) typeDef.isConst = true;

    const decls = [];
    do {
      const name = this.expect(TT.IDENT, 'Nama variabel diharapkan').value;
      // Array dimensions after name: bil arr[10]
      const dims = [];
      while (this.check(TT.LBRACKET)) {
        this.advance();
        dims.push(this.check(TT.RBRACKET) ? null : this.expr());
        this.expect(TT.RBRACKET);
      }
      // Constructor call: Tipe obj(args)
      let init = null, arrayInit = null, ctorArgs = null;
      if (dims.length > 0) {
        if (this.match(TT.ASSIGN)) {
          this.expect(TT.LBRACE, "Diharapkan '{' untuk inisialisasi array");
          arrayInit = this.initList();
          this.expect(TT.RBRACE);
        } else if (this.check(TT.LBRACE)) {
          this.advance();
          arrayInit = this.initList();
          this.expect(TT.RBRACE);
        }
      } else if (this.match(TT.ASSIGN)) {
        if (this.check(TT.LBRACE)) { this.advance(); arrayInit = this.initList(); this.expect(TT.RBRACE); }
        else init = this.expr();
      } else if (this.check(TT.LBRACE)) {
        this.advance();
        arrayInit = this.initList();
        this.expect(TT.RBRACE);
      } else if (this.check(TT.LPAREN)) {
        this.advance();
        ctorArgs = [];
        if (!this.check(TT.RPAREN)) {
          ctorArgs.push(this.expr());
          while (this.match(TT.COMMA)) ctorArgs.push(this.expr());
        }
        this.expect(TT.RPAREN);
      }
      decls.push({ name, dims, init, arrayInit, ctorArgs });
    } while (this.match(TT.COMMA));

    this.expect(TT.SEMICOLON, "Diharapkan ';' setelah deklarasi variabel");

    if (decls.length === 1) {
      const d = decls[0];
      return {
        type: 'VarDecl', typeDef, name: d.name, dims: d.dims,
        init: d.init, arrayInit: d.arrayInit, ctorArgs: d.ctorArgs,
        isStatic, isExtern, isConst: typeDef.isConst, line: startTok.line
      };
    }
    return { type: 'MultiVarDecl', typeDef, decls, isStatic, isConst: typeDef.isConst, line: startTok.line };
  }

  initList() {
    const elems = [];
    while (!this.check(TT.RBRACE) && !this.check(TT.EOF)) {
      if (this.check(TT.LBRACE)) {
        this.advance(); elems.push({ type: 'InitList', elements: this.initList() }); this.expect(TT.RBRACE);
      } else {
        elems.push(this.expr());
      }
      if (!this.check(TT.RBRACE)) this.match(TT.COMMA);
    }
    return elems;
  }

  // ─── Block ───
  block() {
    const tok = this.expect(TT.LBRACE, "Diharapkan '{'");
    const stmts = [];
    while (!this.check(TT.RBRACE) && !this.check(TT.EOF)) {
      stmts.push(this.stmt());
    }
    this.expect(TT.RBRACE, "Diharapkan '}' penutup blok");
    return { type: 'Block', body: stmts, line: tok.line };
  }

  // ─── Statement ───
  stmt() {
    const t = this.peek();

    if (this.check(TT.LBRACE))     return this.block();
    if (this.check(TT.GAS))         return this.funcDecl();
    if (this.check(TT.BENTUK))       return this.structDecl();
    if (this.check(TT.KELAS))      return this.classDecl();
    if (this.check(TT.PILIHAN))     return this.enumDecl();
    if (this.check(TT.KLO))       return this.ifStmt();
    if (this.check(TT.SELAMA))     return this.whileStmt();
    if (this.check(TT.ULANG))      return this.forStmt();
    if (this.check(TT.LAKUKAN))    return this.doWhileStmt();
    if (this.check(TT.PILIH))      return this.switchStmt();
    if (this.check(TT.BALIK)) return this.returnStmt();
    if (this.check(TT.STOP))   { this.advance(); const lbl = this.check(TT.IDENT) ? this.advance().value : null; this.expect(TT.SEMICOLON); return { type: 'Break', label: lbl, line: t.line }; }
    if (this.check(TT.LANJUT))     { this.advance(); const lbl = this.check(TT.IDENT) ? this.advance().value : null; this.expect(TT.SEMICOLON); return { type: 'Continue', label: lbl, line: t.line }; }
    if (this.check(TT.LONCAT))      return this.gotoStmt();
    if (this.check(TT.ERROR_NYA))     return this.throwStmt();
    if (this.check(TT.COBA))       return this.tryStmt();
    if (this.check(TT.BUANG)) return this.deleteStmt();
    if (this.check(TT.HASH))       return this.directive();
    if (this.check(TT.SEMICOLON))  { this.advance(); return { type: 'EmptyStmt', line: t.line }; }

    // Labeled statement: label:
    if (t.type === TT.IDENT && this.peek(1).type === TT.COLON && this.peek(2).type !== TT.COLON) {
      const label = this.advance().value;
      this.advance(); // :
      return { type: 'LabeledStmt', label, body: this.stmt(), line: t.line };
    }

    if (this.isTypeStart() && this.isVarDecl()) return this.varDecl();
    if (this.check(TT.PAS) && this.isVarDecl()) return this.varDecl();

    const e = this.expr();
    this.expect(TT.SEMICOLON, `Diharapkan ';' setelah ekspresi pada baris ${t.line}`);
    return { type: 'ExprStmt', expr: e, line: t.line };
  }

  ifStmt() {
    const tok = this.advance();
    this.expect(TT.LPAREN, "Diharapkan '(' setelah klo");
    // init statement in if: jika (bil x = f(); x > 0)
    let init = null;
    if (this.isTypeStart() && this.isVarDecl()) init = this.varDecl();
    const cond = this.expr();
    this.expect(TT.RPAREN, "Diharapkan ')'");
    const then = this.block();
    const elseIfs = [];
    let els = null;
    while (this.check(TT.KALO_GAK)) {
      this.advance();
      if (this.check(TT.KLO)) {
        this.advance();
        this.expect(TT.LPAREN);
        const ec = this.expr();
        this.expect(TT.RPAREN);
        elseIfs.push({ cond: ec, body: this.block() });
      } else {
        els = this.block();
        break;
      }
    }
    return { type: 'IfStmt', init, cond, then, elseIfs, els, line: tok.line };
  }

  whileStmt() {
    const tok = this.advance();
    this.expect(TT.LPAREN, "Diharapkan '(' setelah selama");
    const cond = this.expr();
    this.expect(TT.RPAREN);
    const body = this.block();
    return { type: 'WhileStmt', cond, body, line: tok.line };
  }

  doWhileStmt() {
    const tok = this.advance();
    const body = this.block();
    this.expect(TT.SELAMA, "Diharapkan 'selama' setelah blok lakukan");
    this.expect(TT.LPAREN);
    const cond = this.expr();
    this.expect(TT.RPAREN);
    this.expect(TT.SEMICOLON);
    return { type: 'DoWhileStmt', cond, body, line: tok.line };
  }

  forStmt() {
    const tok = this.advance();
    this.expect(TT.LPAREN, "Diharapkan '(' setelah ulang");

    // Range-based for: untuk (oto item : koleksi)
    if (this.isTypeStart()) {
      const savedPos = this.pos;
      try {
        const elemType = this.parseType();
        const elemName = this.expect(TT.IDENT).value;
        if (this.check(TT.COLON)) {
          this.advance();
          const range = this.expr();
          this.expect(TT.RPAREN);
          const body = this.block();
          return { type: 'ForRangeStmt', elemType, elemName, range, body, line: tok.line };
        }
        this.pos = savedPos;
      } catch (e) { this.pos = savedPos; }
    }

    // Standard for
    let init = null;
    if (!this.check(TT.SEMICOLON)) {
      if (this.isTypeStart() && this.isVarDecl()) init = this.varDecl();
      else { init = { type: 'ExprStmt', expr: this.expr(), line: tok.line }; this.expect(TT.SEMICOLON); }
    } else this.advance();

    let cond = null;
    if (!this.check(TT.SEMICOLON)) cond = this.expr();
    this.expect(TT.SEMICOLON);

    let update = null;
    if (!this.check(TT.RPAREN)) update = this.expr();
    this.expect(TT.RPAREN);
    const body = this.block();
    return { type: 'ForStmt', init, cond, update, body, line: tok.line };
  }

  switchStmt() {
    const tok = this.advance();
    this.expect(TT.LPAREN);
    const disc = this.expr();
    this.expect(TT.RPAREN);
    this.expect(TT.LBRACE);
    const cases = [], defaults = [];
    while (!this.check(TT.RBRACE) && !this.check(TT.EOF)) {
      if (this.check(TT.KASUS)) {
        this.advance();
        const val = this.expr();
        this.expect(TT.COLON);
        const stmts = [];
        while (!this.check(TT.KASUS) && !this.check(TT.DEFAULT) && !this.check(TT.RBRACE) && !this.check(TT.EOF)) {
          stmts.push(this.stmt());
        }
        cases.push({ val, stmts });
      } else if (this.check(TT.DEFAULT)) {
        this.advance(); this.expect(TT.COLON);
        const stmts = [];
        while (!this.check(TT.KASUS) && !this.check(TT.DEFAULT) && !this.check(TT.RBRACE) && !this.check(TT.EOF)) {
          stmts.push(this.stmt());
        }
        defaults.push({ stmts });
      } else break;
    }
    this.expect(TT.RBRACE);
    return { type: 'SwitchStmt', discriminant: disc, cases, defaultBody: defaults[0]?.stmts || null, line: tok.line };
  }

  returnStmt() {
    const tok = this.advance();
    let val = null;
    if (!this.check(TT.SEMICOLON)) val = this.expr();
    this.expect(TT.SEMICOLON, "Diharapkan ';' setelah kembali");
    return { type: 'ReturnStmt', value: val, line: tok.line };
  }

  gotoStmt() {
    const tok = this.advance();
    const label = this.expect(TT.IDENT, 'Label tujuan diharapkan setelah pergi').value;
    this.expect(TT.SEMICOLON);
    return { type: 'GotoStmt', label, line: tok.line };
  }

  throwStmt() {
    const tok = this.advance();
    let val = null;
    if (!this.check(TT.SEMICOLON)) val = this.expr();
    this.expect(TT.SEMICOLON);
    return { type: 'ThrowStmt', value: val, line: tok.line };
  }

  tryStmt() {
    const tok = this.advance();
    const body = this.block();
    const catches = [];
    while (this.check(TT.KALO_ERROR)) {
      this.advance();
      this.expect(TT.LPAREN);
      let catchType = null, catchName = null;
      if (!this.check(TT.ELLIPSIS)) {
        // Dukung dua gaya: `kalo_error (e)` tanpa tipe (gampang buat pemula)
        // dan `kalo_error (Tipe e)` dengan tipe eksplisit (gaya lanjutan/C++).
        if (this.check(TT.IDENT) && this.peek(1).type === TT.RPAREN) {
          catchName = this.advance().value;
        } else {
          catchType = this.parseType();
          catchName = this.check(TT.IDENT) ? this.advance().value : null;
        }
      } else {
        this.advance(); // ... (catch all)
      }
      this.expect(TT.RPAREN);
      catches.push({ catchType, catchName, body: this.block() });
    }
    let finallyBody = null;
    if (this.check(TT.APAPUN_HASILNYA)) {
      this.advance();
      finallyBody = this.block();
    }
    if (catches.length === 0 && !finallyBody) this.error("Diharapkan 'tangkap' atau 'akhiri' setelah 'coba'");
    return { type: 'TryStmt', body, catches, finallyBody, line: tok.line };
  }

  deleteStmt() {
    const tok = this.advance();
    const isArray = this.match(TT.LBRACKET) ? (this.expect(TT.RBRACKET), true) : false;
    const target = this.expr();
    this.expect(TT.SEMICOLON);
    return { type: 'DeleteStmt', target, isArray, line: tok.line };
  }

  // ─── Expressions ───
  expr() { return this.assignment(); }

  assignment() {
    const left = this.pipe();
    const assignOps = new Set([
      TT.ASSIGN, TT.PLUS_ASSIGN, TT.MINUS_ASSIGN, TT.MUL_ASSIGN, TT.DIV_ASSIGN,
      TT.MOD_ASSIGN, TT.AND_ASSIGN, TT.OR_ASSIGN, TT.XOR_ASSIGN,
      TT.LSHIFT_ASSIGN, TT.RSHIFT_ASSIGN, TT.URSHIFT_ASSIGN,
    ]);
    if (assignOps.has(this.peek().type)) {
      const op = this.advance();
      const right = this.assignment();
      return { type: 'Assign', op: op.type, left, right, line: op.line };
    }
    return left;
  }

  // Pipeline: nilai |> fn setara fn(nilai) -- gampangin baca rantai fungsi
  // dari kiri-ke-kanan (urutan eksekusi) alih-alih ditumpuk dari dalam
  // (fn2(fn1(nilai))). Left-associative: a |> f |> g = g(f(a)).
  // Sisi kanan boleh nama fungsi polos (f) atau panggilan dengan argumen
  // tambahan (f(x, y)) -- nilai kiri selalu disisipkan sebagai ARGUMEN
  // PERTAMA.
  pipe() {
    let left = this.ternary();
    while (this.check(TT.PIPE_OP)) {
      const tok = this.advance();
      const rhs = this.ternary(); // boleh Ident biasa atau Call parsial
      let callee, extraArgs;
      if (rhs.type === 'Call') { callee = rhs.callee; extraArgs = rhs.args; }
      else { callee = rhs; extraArgs = []; }
      left = { type: 'Call', callee, args: [left, ...extraArgs], line: tok.line };
    }
    return left;
  }

  ternary() {
    const cond = this.kalauKosong();
    if (this.match(TT.QUESTION)) {
      const then = this.expr();
      this.expect(TT.COLON, "Diharapkan ':' dalam ekspresi ternary");
      const els = this.ternary();
      return { type: 'Ternary', cond, then, els, line: cond.line };
    }
    return cond;
  }

  // nilai kalauKosong default -- kalau 'nilai' takAda (null), pakai 'default'.
  // Right-associative: a kalauKosong b kalauKosong c = a kalauKosong (b kalauKosong c)
  kalauKosong() {
    const left = this.logOr();
    if (this.check(TT.KALAU_KOSONG)) {
      const tok = this.advance();
      const right = this.kalauKosong();
      return { type: 'KalauKosong', left, right, line: tok.line };
    }
    return left;
  }

  logOr()  { return this._binary(() => this.logAnd(),  [[TT.OR, '||'], [TT.ATAU_KATA, '||']]); }
  logAnd() { return this._binary(() => this.bitOr(),   [[TT.AND, '&&'], [TT.DAN_KATA, '&&']]); }
  bitOr()  { return this._binary(() => this.bitXor(),  [[TT.BIT_OR, '|']]); }
  bitXor() { return this._binary(() => this.bitAnd(),  [[TT.BIT_XOR, '^']]); }
  bitAnd() { return this._binary(() => this.equality(), [[TT.BIT_AND, '&']]); }
  equality()   { return this._binary(() => this.relational(), [[TT.EQ,'=='],[TT.NEQ,'!=']]); }
  relational() { return this._binary(() => this.shift(), [[TT.LT,'<'],[TT.GT,'>'],[TT.LTE,'<='],[TT.GTE,'>='],]); }
  shift()      { return this._binary(() => this.additive(), [[TT.LSHIFT,'<<'],[TT.RSHIFT,'>>'],[TT.URSHIFT,'>>>'],]); }
  additive()   { return this._binary(() => this.multiplicative(), [[TT.PLUS,'+'],[TT.MINUS,'-']]); }
  multiplicative() { return this._binary(() => this.castExpr(), [[TT.BINTANG,'*'],[TT.BAGI,'/'],[TT.MODULO,'%']]); }

  _binary(sub, ops) {
    let left = sub();
    while (true) {
      let matched = false;
      for (const [type, sym] of ops) {
        if (this.check(type)) {
          const op = this.advance();
          const right = sub();
          left = { type: 'Binary', op: sym, left, right, line: op.line };
          matched = true;
          break;
        }
      }
      if (!matched) break;
    }
    return left;
  }

  castExpr() {
    // (type) expr
    if (this.check(TT.LPAREN)) {
      const saved = this.pos;
      try {
        this.advance();
        const ct = this.parseType();
        if (this.check(TT.RPAREN)) {
          this.advance();
          if (!this.check(TT.LPAREN) && !this.check(TT.SEMICOLON) && !this.check(TT.COMMA) && !this.check(TT.RBRACE)) {
            const operand = this.unary();
            return { type: 'Cast', castType: ct, operand, line: ct.line };
          }
        }
      } catch (e) {}
      this.pos = saved;
    }
    // jadiTetap<T>(expr) / jadiDinamis<T>(expr)
    const casts = { [TT.JADI_TETAP]: 'static', [TT.JADI_DINAMIS]: 'dynamic' };
    if (casts[this.peek().type]) {
      const kind = casts[this.advance().type];
      this.expect(TT.LT);
      const castType = this.parseType();
      this.expect(TT.GT);
      this.expect(TT.LPAREN);
      const operand = this.expr();
      this.expect(TT.RPAREN);
      return { type: 'Cast', kind, castType, operand, line: castType.line };
    }
    return this.power();
  }

  // Pangkat (**) — mengikat lebih erat dari unary minus di sisi kiri tapi
  // right-associative: 2**3**2 = 2**(3**2) = 512, dan -2**2 = -(2**2) = -4
  // (unary di sisi kiri dievaluasi setelah pangkat, sesuai konvensi matematika).
  power() {
    const base = this.unary();
    if (this.check(TT.PANGKAT_OP)) {
      const tok = this.advance();
      const exponent = this.power(); // right-associative: rekursi ke power(), bukan unary()
      return { type: 'Binary', op: '**', left: base, right: exponent, line: tok.line };
    }
    return base;
  }

  unary() {
    const t = this.peek();
    if (this.check(TT.NOT) || this.check(TT.BUKAN_KATA)) { this.advance(); return { type: 'Unary', op: '!',  right: this.unary(), line: t.line }; }
    if (this.check(TT.MINUS))   { this.advance(); return { type: 'Unary', op: '-',  right: this.unary(), line: t.line }; }
    if (this.check(TT.PLUS))    { this.advance(); return { type: 'Unary', op: '+',  right: this.unary(), line: t.line }; }
    if (this.check(TT.BIT_NOT)) { this.advance(); return { type: 'Unary', op: '~',  right: this.unary(), line: t.line }; }
    if (this.check(TT.BIT_AND)) { this.advance(); return { type: 'AddressOf', operand: this.unary(), line: t.line }; }
    if (this.check(TT.BINTANG)) { this.advance(); return { type: 'Deref', operand: this.unary(), line: t.line }; }
    if (this.check(TT.INC))     { this.advance(); return { type: 'PreInc', operand: this.unary(), line: t.line }; }
    if (this.check(TT.DEC))     { this.advance(); return { type: 'PreDec', operand: this.unary(), line: t.line }; }
    if (this.check(TT.UKURAN_DARI))  {
      this.advance();
      if (this.match(TT.LPAREN)) {
        const inner = this.isTypeStart() ? this.parseType() : this.expr();
        this.expect(TT.RPAREN);
        return { type: 'Sizeof', inner, line: t.line };
      }
      return { type: 'Sizeof', inner: this.unary(), line: t.line };
    }
    if (this.check(TT.JENIS_APA)) {
      this.advance();
      this.expect(TT.LPAREN);
      const inner = this.isTypeStart() ? this.parseType() : this.expr();
      this.expect(TT.RPAREN);
      return { type: 'Typeid', inner, line: t.line };
    }
    return this.postfix();
  }

  postfix() {
    let e = this.primary();
    while (true) {
      if (this.check(TT.LBRACKET)) {
        const tok = this.advance();
        const idx = this.expr();
        this.expect(TT.RBRACKET, "Diharapkan ']'");
        e = { type: 'Index', object: e, index: idx, line: tok.line };
      } else if (this.check(TT.DOT)) {
        const tok = this.advance();
        const field = this.expect(TT.IDENT, 'Nama field/metode diharapkan').value;
        e = { type: 'FieldAccess', object: e, field, line: tok.line };
      } else if (this.check(TT.OPTIONAL_CHAIN)) {
        const tok = this.advance();
        const field = this.expect(TT.IDENT, 'Nama field/metode diharapkan setelah ?.').value;
        e = { type: 'FieldAccess', object: e, field, optional: true, line: tok.line };
      } else if (this.check(TT.ARROW)) {
        const tok = this.advance();
        const field = this.expect(TT.IDENT, 'Nama field diharapkan setelah ->').value;
        e = { type: 'PtrField', object: e, field, line: tok.line };
      } else if (this.check(TT.DOUBLE_COLON)) {
        const tok = this.advance();
        const member = this.expect(TT.IDENT, 'Nama anggota diharapkan setelah ::').value;
        e = { type: 'ScopeAccess', object: e, member, line: tok.line };
      } else if (this.check(TT.LPAREN)) {
        const tok = this.advance();
        const args = [];
        const parseArg = () => {
          if (this.check(TT.ELLIPSIS)) {
            const spreadTok = this.advance();
            return { type: 'Spread', arg: this.expr(), line: spreadTok.line };
          }
          return this.expr();
        };
        if (!this.check(TT.RPAREN)) {
          args.push(parseArg());
          while (this.match(TT.COMMA)) args.push(parseArg());
        }
        this.expect(TT.RPAREN, "Diharapkan ')' setelah argumen");
        e = { type: 'Call', callee: e, args, line: tok.line };
      } else if (this.check(TT.INC)) {
        const tok = this.advance();
        e = { type: 'PostInc', operand: e, line: tok.line };
      } else if (this.check(TT.DEC)) {
        const tok = this.advance();
        e = { type: 'PostDec', operand: e, line: tok.line };
      } else break;
    }
    return e;
  }

  primary() {
    const t = this.peek();

    if (this.check(TT.INT))    { this.advance(); return { type: 'Literal', kind: 'angka',  value: t.value, line: t.line }; }
    if (this.check(TT.FLOAT))  { this.advance(); return { type: 'Literal', kind: 'desimal',  value: t.value, line: t.line }; }
    if (this.check(TT.STRING)) { this.advance(); return { type: 'Literal', kind: 'kata', value: t.value, line: t.line }; }
    if (this.check(TT.CHAR))   { this.advance(); return { type: 'Literal', kind: 'huruf',  value: t.value, line: t.line }; }
    if (this.check(TT.BOOL) || this.check(TT.BENER) || this.check(TT.SALAH)) {
      this.advance();
      return { type: 'Literal', kind: 'iyaGak', value: t.value === true || t.value === 'bener', line: t.line };
    }
    if (this.check(TT.TAK_ADA)) { this.advance(); return { type: 'Literal', kind: 'null', value: null, line: t.line }; }

    if (this.check(TT.DIRI))   { this.advance(); return { type: 'ThisExpr', line: t.line }; }
    if (this.check(TT.INDUK)) { this.advance(); return { type: 'SuperExpr', line: t.line }; }

    if (this.check(TT.IDENT)) {
      this.advance();
      // ident<T>(args) — template call
      if (this.check(TT.LT) && this.isTemplateCall()) {
        this.advance();
        const targs = [];
        while (!this.check(TT.GT) && !this.check(TT.EOF)) {
          targs.push(this.parseType());
          if (!this.check(TT.GT)) this.match(TT.COMMA);
        }
        this.expect(TT.GT);
        return { type: 'Ident', name: t.value, templateArgs: targs, line: t.line };
      }
      return { type: 'Ident', name: t.value, line: t.line };
    }

    if (this.check(TT.BIKIN)) {
      this.advance();
      const nt = this.parseType();
      let args = [];
      if (this.check(TT.LPAREN)) {
        this.advance();
        if (!this.check(TT.RPAREN)) {
          args.push(this.expr());
          while (this.match(TT.COMMA)) args.push(this.expr());
        }
        this.expect(TT.RPAREN);
      } else if (this.check(TT.LBRACE)) {
        this.advance();
        args = this.initList();
        this.expect(TT.RBRACE);
      }
      return { type: 'NewExpr', newType: nt, args, line: t.line };
    }

    if (this.check(TT.LPAREN)) {
      this.advance();
      const e = this.expr();
      this.expect(TT.RPAREN, "Diharapkan ')' penutup");
      return { ...e, _paren: true };
    }

    // Initializer list
    if (this.check(TT.LBRACE)) {
      this.advance();
      const elems = this.initList();
      this.expect(TT.RBRACE);
      return { type: 'InitList', elements: elems, line: t.line };
    }

    // '[' starts either a lambda [capture](params)->ret{body} or an array literal [a, b, c]
    if (this.check(TT.LBRACKET)) {
      if (this.isLambdaStart()) return this.lambdaExpr();
      return this.arrayLiteral();
    }

    this.error(`Ekspresi tidak valid: '${t.value !== null ? t.value : t.type}' pada baris ${t.line}`, t);
  }

  // Lookahead: does '[' begin a lambda? A lambda's capture list is only ever
  // empty, '&', '*', or a comma-separated list of bare identifiers, and the
  // closing ']' is immediately followed by '('. Anything else (numbers,
  // strings, nested expressions, or no '(' after ']') is an array literal.
  isLambdaStart() {
    let p = this.pos + 1; // skip '['
    const toks = this.tokens;
    const len = toks.length;
    while (p < len && toks[p].type !== TT.RBRACKET) {
      const tt = toks[p].type;
      if (tt === TT.IDENT || tt === TT.BIT_AND || tt === TT.BINTANG || tt === TT.COMMA) { p++; continue; }
      return false; // anything else (numbers, strings, operators) => array literal
    }
    if (p >= len || toks[p].type !== TT.RBRACKET) return false;
    p++;
    return p < len && toks[p].type === TT.LPAREN;
  }

  // Array literal: [expr, expr, ...]
  arrayLiteral() {
    const tok = this.advance(); // '['
    const elements = [];
    while (!this.check(TT.RBRACKET) && !this.check(TT.EOF)) {
      if (this.check(TT.ELLIPSIS)) {
        const spreadTok = this.advance();
        const arg = this.expr();
        elements.push({ type: 'Spread', arg, line: spreadTok.line });
      } else {
        elements.push(this.expr());
      }
      if (!this.check(TT.RBRACKET)) this.expect(TT.COMMA, "Diharapkan ',' antar elemen array");
    }
    this.expect(TT.RBRACKET, "Diharapkan ']' penutup array literal");
    return { type: 'ArrayLiteral', elements, line: tok.line };
  }

  lambdaExpr() {
    const tok = this.advance(); // [
    // capture list
    const captures = [];
    while (!this.check(TT.RBRACKET) && !this.check(TT.EOF)) {
      if (this.check(TT.BIT_AND)) { this.advance(); captures.push({ byRef: true, name: this.check(TT.IDENT) ? this.advance().value : null }); }
      else if (this.check(TT.BINTANG)) { this.advance(); captures.push({ all: true, byRef: false }); }
      else if (this.check(TT.IDENT)) { captures.push({ name: this.advance().value, byRef: false }); }
      if (!this.check(TT.RBRACKET)) this.match(TT.COMMA);
    }
    this.expect(TT.RBRACKET);
    this.expect(TT.LPAREN);
    const params = [];
    while (!this.check(TT.RPAREN) && !this.check(TT.EOF)) {
      const pt = this.parseType();
      const pn = this.expect(TT.IDENT).value;
      params.push({ typeDef: pt, name: pn });
      if (!this.check(TT.RPAREN)) this.match(TT.COMMA);
    }
    this.expect(TT.RPAREN);
    let returnType = null;
    if (this.match(TT.ARROW)) returnType = this.parseType();
    const body = this.block();
    return { type: 'Lambda', captures, params, returnType, body, line: tok.line };
  }

  isTemplateCall() {
    // Simple lookahead: if after IDENT<, we see type then >
    let depth = 0, p = this.pos;
    while (p < this.tokens.length) {
      const tt = this.tokens[p].type;
      if (tt === TT.LT) depth++;
      if (tt === TT.GT) { depth--; if (depth === 0) return true; }
      if ([TT.SEMICOLON, TT.LBRACE, TT.RBRACE].includes(tt)) return false;
      p++;
    }
    return false;
  }
}

if (typeof module !== 'undefined') {
  module.exports = { Parser };
} else {
  window._NK_PARSER = { Parser };
}
