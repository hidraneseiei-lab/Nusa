/**
 * NusaLang v2 — Lexer (Tokenizer)
 * Mengubah source code teks menjadi stream token
 * Mendukung: semua literal, semua operator, komentar, preprocessor directives
 */

'use strict';

// Dependency injection (browser: global, Node: require)
const _tok = (typeof module !== 'undefined') ? require('./tokens') : window._NK_TOKENS;
const _err = (typeof module !== 'undefined') ? require('./errors')  : window._NK_ERRORS;

const { TokenType: TT, KEYWORDS, MULTIWORD_KEYWORDS, Token } = _tok;
const { LexError } = _err;

class Lexer {
  constructor(source, fileName) {
    this.src      = source;
    this.fileName = fileName || '<input>';
    this.pos      = 0;
    this.line     = 1;
    this.col      = 1;
    this.tokens   = [];
    this.len      = source.length;
  }

  peek(offset = 0) {
    const idx = this.pos + offset;
    return idx < this.len ? this.src[idx] : '\0';
  }

  advance() {
    const ch = this.src[this.pos++];
    if (ch === '\n') { this.line++; this.col = 1; }
    else this.col++;
    return ch;
  }

  match(ch) {
    if (this.pos < this.len && this.src[this.pos] === ch) {
      this.advance();
      return true;
    }
    return false;
  }

  matchStr(s) {
    for (let i = 0; i < s.length; i++) {
      if (this.src[this.pos + i] !== s[i]) return false;
    }
    for (let i = 0; i < s.length; i++) this.advance();
    return true;
  }

  error(msg) {
    throw new LexError(msg, this.line, this.col, this.src);
  }

  addToken(type, value, raw) {
    this.tokens.push(new Token(type, value, this.line, this.col, raw));
  }

  isDigit(c)    { return c >= '0' && c <= '9'; }
  isHexDigit(c) { return (c >= '0' && c <= '9') || (c >= 'a' && c <= 'f') || (c >= 'A' && c <= 'F'); }
  isOctDigit(c) { return c >= '0' && c <= '7'; }
  isBinDigit(c) { return c === '0' || c === '1'; }
  isAlpha(c)    { return /[A-Za-z_\u00C0-\u024F]/.test(c); }
  isAlnum(c)    { return /[A-Za-z0-9_\u00C0-\u024F]/.test(c); }

  tokenize() {
    while (this.pos < this.len) {
      this.scanToken();
    }
    this.tokens.push(new Token(TT.EOF, null, this.line, this.col));
    return this.tokens;
  }

  scanToken() {
    const startLine = this.line;
    const startCol  = this.col;
    const c = this.advance();

    // Whitespace
    if (c === ' ' || c === '\r' || c === '\t' || c === '\n') return;

    // Line comment //
    if (c === '/' && this.peek() === '/') {
      while (this.pos < this.len && this.src[this.pos] !== '\n') this.advance();
      return;
    }

    // Block comment /* */
    if (c === '/' && this.peek() === '*') {
      this.advance(); // *
      let depth = 1;
      while (this.pos < this.len && depth > 0) {
        const x = this.advance();
        if (x === '/' && this.src[this.pos - 2] === '*') depth--;
        else if (x === '*' && this.peek() === '/') { this.advance(); depth--; }
        else if (x === '/' && this.peek() === '*') { this.advance(); depth++; }
      }
      if (depth !== 0) this.error('Komentar blok tidak ditutup (kurang */)');
      return;
    }

    // Doc comment ///
    // already handled above

    // Preprocessor / directive #
    if (c === '#') {
      this.tokens.push(new Token(TT.HASH, '#', startLine, startCol));
      return;
    }

    // String literal "..."
    if (c === '"') { this.scanString(startLine, startCol); return; }

    // Raw string r"..."
    if (c === 'r' && this.peek() === '"') {
      this.advance();
      this.scanRawString(startLine, startCol);
      return;
    }

    // Char literal '...'
    if (c === "'") { this.scanChar(startLine, startCol); return; }

    // Numbers
    if (this.isDigit(c) || (c === '0' && (this.peek() === 'x' || this.peek() === 'b' || this.peek() === 'o'))) {
      this.scanNumber(c, startLine, startCol);
      return;
    }

    // Identifier / Keyword
    if (this.isAlpha(c)) {
      this.scanIdent(c, startLine, startCol);
      return;
    }

    // Operators & Punctuation
    this.scanOperator(c, startLine, startCol);
  }

  scanString(startLine, startCol) {
    let s = '';
    while (this.pos < this.len && this.src[this.pos] !== '"') {
      const ch = this.advance();
      if (ch === '\\') {
        const esc = this.advance();
        switch (esc) {
          case 'n':  s += '\n'; break;
          case 't':  s += '\t'; break;
          case 'r':  s += '\r'; break;
          case '"':  s += '"';  break;
          case "'":  s += "'";  break;
          case '\\': s += '\\'; break;
          case '0':  s += '\0'; break;
          case 'a':  s += '\x07'; break;
          case 'b':  s += '\b'; break;
          case 'f':  s += '\f'; break;
          case 'v':  s += '\v'; break;
          case 'x': {
            let hex = '';
            for (let i = 0; i < 2 && this.isHexDigit(this.peek()); i++) hex += this.advance();
            s += String.fromCharCode(parseInt(hex, 16));
            break;
          }
          case 'u': {
            this.match('{');
            let hex = '';
            while (this.isHexDigit(this.peek())) hex += this.advance();
            this.match('}');
            s += String.fromCodePoint(parseInt(hex, 16));
            break;
          }
          default:
            this.error(`Karakter escape tidak dikenal: \\${esc}`);
        }
      } else if (ch === '\n') {
        this.error('String tidak boleh mengandung baris baru tanpa escape (gunakan \\n)');
      } else {
        s += ch;
      }
    }
    if (this.pos >= this.len) this.error('String tidak ditutup — kurang tanda petik (")')
    this.advance(); // closing "
    this.tokens.push(new Token(TT.STRING, s, startLine, startCol, `"${s}"`));
  }

  scanRawString(startLine, startCol) {
    let s = '';
    while (this.pos < this.len) {
      if (this.src[this.pos] === '"') { this.advance(); break; }
      s += this.advance();
    }
    this.tokens.push(new Token(TT.STRING, s, startLine, startCol));
  }

  scanChar(startLine, startCol) {
    let ch = '';
    if (this.peek() === '\\') {
      this.advance();
      const esc = this.advance();
      switch (esc) {
        case 'n': ch = '\n'; break; case 't': ch = '\t'; break;
        case '\\': ch = '\\'; break; case "'": ch = "'"; break;
        case '0': ch = '\0'; break; case 'r': ch = '\r'; break;
        default: ch = esc;
      }
    } else {
      ch = this.advance();
    }
    if (!this.match("'")) this.error("Karakter literal tidak ditutup — kurang tanda petik tunggal (')");
    this.tokens.push(new Token(TT.CHAR, ch, startLine, startCol));
  }

  scanNumber(first, startLine, startCol) {
    let num = first;
    let isFloat = false;
    let isUnsigned = false;
    let isLong = false;

    // Hex: 0x...
    if (first === '0' && (this.peek() === 'x' || this.peek() === 'X')) {
      num += this.advance();
      if (!this.isHexDigit(this.peek())) this.error('Digit hex diharapkan setelah 0x');
      while (this.isHexDigit(this.peek()) || this.peek() === '_') {
        const ch = this.advance();
        if (ch !== '_') num += ch;
      }
      const val = parseInt(num, 16);
      this.tokens.push(new Token(TT.INT, val, startLine, startCol, num));
      this.consumeIntSuffix();
      return;
    }

    // Binary: 0b...
    if (first === '0' && (this.peek() === 'b' || this.peek() === 'B')) {
      num += this.advance();
      if (!this.isBinDigit(this.peek())) this.error('Digit biner (0/1) diharapkan setelah 0b');
      while (this.isBinDigit(this.peek()) || this.peek() === '_') {
        const ch = this.advance();
        if (ch !== '_') num += ch;
      }
      const val = parseInt(num.slice(2), 2);
      this.tokens.push(new Token(TT.INT, val, startLine, startCol, num));
      this.consumeIntSuffix();
      return;
    }

    // Octal: 0o...
    if (first === '0' && (this.peek() === 'o' || this.peek() === 'O')) {
      num += this.advance();
      while (this.isOctDigit(this.peek()) || this.peek() === '_') {
        const ch = this.advance();
        if (ch !== '_') num += ch;
      }
      const val = parseInt(num.slice(2), 8);
      this.tokens.push(new Token(TT.INT, val, startLine, startCol, num));
      this.consumeIntSuffix();
      return;
    }

    // Decimal / float
    while (this.isDigit(this.peek()) || this.peek() === '_') {
      const ch = this.advance();
      if (ch !== '_') num += ch;
    }

    // Fractional part
    if (this.peek() === '.' && this.isDigit(this.peekAt(1))) {
      isFloat = true;
      num += this.advance(); // .
      while (this.isDigit(this.peek()) || this.peek() === '_') {
        const ch = this.advance();
        if (ch !== '_') num += ch;
      }
    }

    // Exponent
    if (this.peek() === 'e' || this.peek() === 'E') {
      isFloat = true;
      num += this.advance();
      if (this.peek() === '+' || this.peek() === '-') num += this.advance();
      if (!this.isDigit(this.peek())) this.error('Digit diharapkan setelah eksponen');
      while (this.isDigit(this.peek())) num += this.advance();
    }

    // Float suffix: f, F
    if (this.peek() === 'f' || this.peek() === 'F') {
      isFloat = true;
      this.advance();
    }

    if (isFloat) {
      this.tokens.push(new Token(TT.FLOAT, parseFloat(num), startLine, startCol, num));
    } else {
      this.consumeIntSuffix();
      this.tokens.push(new Token(TT.INT, parseInt(num, 10), startLine, startCol, num));
    }
  }

  peekAt(offset) {
    return this.pos + offset < this.len ? this.src[this.pos + offset] : '\0';
  }

  consumeIntSuffix() {
    // u, U, l, L, ul, UL etc.
    while (['u','U','l','L'].includes(this.peek())) this.advance();
  }

  scanIdent(first, startLine, startCol) {
    let id = first;
    while (this.pos < this.len && this.isAlnum(this.src[this.pos])) {
      id += this.advance();
    }

    // Check raw string prefix handled above

    // Keyword lookup — cek keyword multi-suku-kata dulu (misal: kalo_gak_klo, kalo_gak),
    // lalu keyword biasa
    const mwType = MULTIWORD_KEYWORDS.get(id);
    const kwType = mwType || KEYWORDS.get(id);
    if (kwType) {
      if (id === 'bener') {
        this.tokens.push(new Token(TT.BOOL, true, startLine, startCol, id));
      } else if (id === 'salah') {
        this.tokens.push(new Token(TT.BOOL, false, startLine, startCol, id));
      } else if (id === 'takAda') {
        this.tokens.push(new Token(TT.TAK_ADA, null, startLine, startCol, id));
      } else {
        this.tokens.push(new Token(kwType, id, startLine, startCol));
      }
    } else {
      this.tokens.push(new Token(TT.IDENT, id, startLine, startCol));
    }
  }

  scanOperator(c, startLine, startCol) {
    const push = (type, value) => {
      this.tokens.push(new Token(type, value, startLine, startCol));
    };

    switch (c) {
      // Tri-char / ellipsis
      case '.':
        if (this.peek() === '.' && this.peekAt(1) === '.') { this.advance(); this.advance(); push(TT.ELLIPSIS, '...'); }
        else push(TT.DOT, '.'); break;

      case '+':
        if (this.match('+'))       push(TT.INC, '++');
        else if (this.match('='))  push(TT.PLUS_ASSIGN, '+=');
        else                       push(TT.PLUS, '+');
        break;

      case '-':
        if (this.match('-'))       push(TT.DEC, '--');
        else if (this.match('>'))  push(TT.ARROW, '->');
        else if (this.match('='))  push(TT.MINUS_ASSIGN, '-=');
        else                       push(TT.MINUS, '-');
        break;

      case '*':
        if (this.match('*'))  push(TT.PANGKAT_OP, '**');
        else if (this.match('='))  push(TT.MUL_ASSIGN, '*=');
        else                  push(TT.BINTANG, '*');
        break;

      case '/':
        if (this.match('='))  push(TT.DIV_ASSIGN, '/=');
        else                  push(TT.BAGI, '/');
        break;

      case '%':
        if (this.match('='))  push(TT.MOD_ASSIGN, '%=');
        else                  push(TT.MODULO, '%');
        break;

      case '=':
        if (this.match('='))  push(TT.EQ, '==');
        else if (this.match('>')) push(TT.ARROW2, '=>');
        else                  push(TT.ASSIGN, '=');
        break;

      case '!':
        if (this.match('='))  push(TT.NEQ, '!=');
        else                  push(TT.NOT, '!');
        break;

      case '<':
        if (this.peek() === '<') {
          this.advance();
          if (this.match('='))   push(TT.LSHIFT_ASSIGN, '<<=');
          else                   push(TT.LSHIFT, '<<');
        } else if (this.match('=')) push(TT.LTE, '<=');
        else                    push(TT.LT, '<');
        break;

      case '>':
        if (this.peek() === '>') {
          this.advance();
          if (this.peek() === '>') {
            this.advance();
            if (this.match('=')) push(TT.URSHIFT_ASSIGN, '>>>=');
            else                 push(TT.URSHIFT, '>>>');
          } else if (this.match('=')) push(TT.RSHIFT_ASSIGN, '>>=');
          else                    push(TT.RSHIFT, '>>');
        } else if (this.match('=')) push(TT.GTE, '>=');
        else                    push(TT.GT, '>');
        break;

      case '&':
        if (this.match('&'))      push(TT.AND, '&&');
        else if (this.match('=')) push(TT.AND_ASSIGN, '&=');
        else                      push(TT.BIT_AND, '&');
        break;

      case '|':
        if (this.match('|'))      push(TT.OR, '||');
        else if (this.match('>')) push(TT.PIPE_OP, '|>');
        else if (this.match('=')) push(TT.OR_ASSIGN, '|=');
        else                      push(TT.BIT_OR, '|');
        break;

      case '^':
        if (this.match('='))  push(TT.XOR_ASSIGN, '^=');
        else                  push(TT.BIT_XOR, '^');
        break;

      case '~':  push(TT.BIT_NOT, '~'); break;
      case '?':
        if (this.match('.')) push(TT.OPTIONAL_CHAIN, '?.');
        else                  push(TT.QUESTION, '?');
        break;
      case '@':  push(TT.AT, '@'); break;

      case ':':
        if (this.match(':'))  push(TT.DOUBLE_COLON, '::');
        else                  push(TT.COLON, ':');
        break;

      case '(':  push(TT.LPAREN,    '('); break;
      case ')':  push(TT.RPAREN,    ')'); break;
      case '{':  push(TT.LBRACE,    '{'); break;
      case '}':  push(TT.RBRACE,    '}'); break;
      case '[':  push(TT.LBRACKET,  '['); break;
      case ']':  push(TT.RBRACKET,  ']'); break;
      case ';':  push(TT.SEMICOLON, ';'); break;
      case ',':  push(TT.COMMA,     ','); break;
      case '#':  push(TT.HASH,      '#'); break;

      default:
        this.error(`Karakter tidak dikenal: '${c}' (kode ASCII: ${c.charCodeAt(0)})`);
    }
  }
}

if (typeof module !== 'undefined') {
  module.exports = { Lexer };
} else {
  window._NK_LEXER = { Lexer };
}
