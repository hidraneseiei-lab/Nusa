/**
 * NusaKids — Token Definitions
 * Bahasa pemrograman Indonesia yang gampang & akrab buat pemula.
 * Dialek "adik" dari NusaLang — sintaks lebih santai, fitur berat disembunyikan
 * di balik #jago biar pemula gak overwhelmed di awal.
 */

'use strict';

const TokenType = {
  // ─── Literal ───
  INT:        'INT',
  FLOAT:      'FLOAT',
  STRING:     'STRING',
  CHAR:       'CHAR',
  BOOL:       'BOOL',

  // ─── Identifier ───
  IDENT:      'IDENT',

  // ─── Tipe Data (nama akrab, gampang diinget) ───
  T_ANGKA:    'angka',      // int
  T_DESIMAL:  'desimal',    // double/float
  T_KATA:     'kata',       // string
  T_HURUF:    'huruf',      // char
  T_IYAGAK:   'iyaGak',     // bool
  T_KOSONG:   'kosong',     // void
  T_ANGKA_GEDE: 'angkaGede',// long
  T_ANGKA_KECIL:'angkaKecil',// short
  T_BYTE:     'byte',       // unsigned 8-bit
  T_DESIMAL32:'desimalKecil', // float 32-bit
  T_ANGKA_POS:'angkaPos',   // unsigned int (selalu positif)
  T_APAAJA:   'apaAja',     // auto/var (auto-detect tipe)

  // ─── Deklarasi Inti ───
  GAS:        'gas',        // function (mulai ngerjain)
  BALIK:      'balik',      // return
  PAS:        'pas',        // const
  STATIS:     'statis',     // static
  LUAR:       'luar',       // extern
  PILIHAN:    'pilihan',    // enum
  BENTUK:     'bentuk',     // struct
  GABUNGAN:   'gabungan',   // union
  MUAT:       'muat',       // include/import
  RUANG:      'ruang',      // namespace
  PAKAI:      'pakai',      // using

  // ─── Mode Jago (fitur OOP/lanjutan, aktif dgn #jago) ───
  KELAS:      'kelas',      // class
  TURUNAN:    'turunan',    // extends/inherit ("nurunin sifat dari...")
  PUNYA_SIFAT:'punyaSifat', // implements ("harus punya sifat interface ini")
  ANTARMUKA:  'antarmuka',  // interface
  PUBLIK:     'publik',     // public
  PRIVAT:     'privat',     // private
  LINDUNG:    'lindung',    // protected
  VIRTUAL:    'virtual',    // virtual
  TIMPA:      'timpa',      // override ("nimpa fungsi induknya")
  ABSTRAK:    'abstrak',    // abstract
  AKHIR:      'akhir',      // final
  TEMAN:      'teman',      // friend
  OPERATOR:   'operator',   // operator overload
  CETAKAN:    'cetakan',    // template ("cetakan buat banyak tipe")
  JENIS:      'jenis',      // typename
  UKURAN_DARI:'ukuranDari', // sizeof
  JENIS_APA:  'jenisApa',   // typeid
  JADI_TETAP: 'jadiTetap',  // static_cast (disederhanakan jadi 1 keyword umum)
  JADI_DINAMIS:'jadiDinamis', // dynamic_cast
  TAK_ADA:    'takAda',     // nullptr
  DIRI:       'diri',       // this
  INDUK:      'induk',      // super/base

  // ─── Null-safety ───
  MUNGKIN:     'mungkin',      // modifier tipe: boleh takAda (mirip T? di Kotlin/Swift)
  KALAU_KOSONG:'kalauKosong',  // operator kata: nilai kalauKosong default (??)
  OPTIONAL_CHAIN: '?.',        // akses aman: obj?.field (gak error kalau obj takAda)
  PIPE_OP:     '|>',           // pipeline: nilai |> fn1 |> fn2 (gampangin baca rantai fungsi)

  // ─── Testing bawaan bahasa ───
  TES:         'tes',          // blok tes: tes "nama" { ... }
  PASTIKAN:    'pastikan',     // assertion: pastikan(kondisi)
  HARUS_SAMA:  'harusSama',    // assertion perbandingan: harusSama(hasil, diharapkan)

  // ─── Kontrol Alur ───
  KLO:        'klo',        // if
  KALO_GAK:   'kalo_gak',   // else
  KALO_GAK_KLO:'kalo_gak_klo', // else if
  SELAMA:     'selama',     // while
  ULANG:      'ulang',      // for
  LAKUKAN:    'lakukan',    // do
  PILIH:      'pilih',      // switch
  KASUS:      'kasus',      // case
  DEFAULT:    'biasanya',   // default
  STOP:       'stop',       // break
  LANJUT:     'lanjut',     // continue
  LONCAT:     'loncat',     // goto
  ERROR_NYA:  'errorNya',   // throw
  COBA:       'coba',       // try
  KALO_ERROR: 'kalo_error', // catch
  APAPUN_HASILNYA:'apapun_hasilnya', // finally
  BIKIN:      'bikin',      // new
  BUANG:      'buang',      // delete

  // ─── Nilai Boolean ───
  BENER:      'bener',
  SALAH:      'salah',

  // ─── Operator Aritmatika ───
  PLUS:       '+',
  MINUS:      '-',
  BINTANG:    '*',
  BAGI:       '/',
  MODULO:     '%',
  PANGKAT_OP: '**',         // shorthand pangkat (fitur baru, tak ada di NusaLang)

  // ─── Operator Perbandingan ───
  EQ:         '==',
  NEQ:        '!=',
  LT:         '<',
  GT:         '>',
  LTE:        '<=',
  GTE:        '>=',

  // ─── Operator Logika ───
  AND:        '&&',
  OR:         '||',
  NOT:        '!',
  DAN_KATA:   'dan',        // alias kata untuk &&
  ATAU_KATA:  'atau',       // alias kata untuk ||
  BUKAN_KATA: 'bukan',      // alias kata untuk !

  // ─── Operator Bitwise ───
  BIT_AND:    '&',
  BIT_OR:     '|',
  BIT_XOR:    '^',
  BIT_NOT:    '~',
  LSHIFT:     '<<',
  RSHIFT:     '>>',
  URSHIFT:    '>>>',

  // ─── Operator Penugasan ───
  ASSIGN:           '=',
  PLUS_ASSIGN:      '+=',
  MINUS_ASSIGN:     '-=',
  MUL_ASSIGN:       '*=',
  DIV_ASSIGN:       '/=',
  MOD_ASSIGN:       '%=',
  AND_ASSIGN:       '&=',
  OR_ASSIGN:        '|=',
  XOR_ASSIGN:       '^=',
  LSHIFT_ASSIGN:    '<<=',
  RSHIFT_ASSIGN:    '>>=',
  URSHIFT_ASSIGN:   '>>>=',

  // ─── Kenaikan / Penurunan ───
  INC:        '++',
  DEC:        '--',

  // ─── Penanda Kalimat (punctuation) ───
  LPAREN:     '(',
  RPAREN:     ')',
  LBRACE:     '{',
  RBRACE:     '}',
  LBRACKET:   '[',
  RBRACKET:   ']',
  SEMICOLON:  ';',
  COMMA:      ',',
  DOT:        '.',
  COLON:      ':',
  DOUBLE_COLON: '::',
  ARROW:      '->',
  ARROW2:     '=>',
  QUESTION:   '?',
  HASH:       '#',
  ELLIPSIS:   '...',
  AT:         '@',

  // ─── EOF ───
  EOF:        'EOF',
};

// Peta kata kunci → jenis token
const KEYWORDS = new Map([
  ['angka',       TokenType.T_ANGKA],
  ['desimal',     TokenType.T_DESIMAL],
  ['kata',        TokenType.T_KATA],
  ['huruf',       TokenType.T_HURUF],
  ['iyaGak',      TokenType.T_IYAGAK],
  ['kosong',      TokenType.T_KOSONG],
  ['angkaGede',   TokenType.T_ANGKA_GEDE],
  ['angkaKecil',  TokenType.T_ANGKA_KECIL],
  ['byte',        TokenType.T_BYTE],
  ['desimalKecil',TokenType.T_DESIMAL32],
  ['angkaPos',    TokenType.T_ANGKA_POS],
  ['apaAja',      TokenType.T_APAAJA],

  ['gas',         TokenType.GAS],
  ['balik',       TokenType.BALIK],
  ['pas',         TokenType.PAS],
  ['statis',      TokenType.STATIS],
  ['luar',        TokenType.LUAR],
  ['pilihan',     TokenType.PILIHAN],
  ['bentuk',      TokenType.BENTUK],
  ['gabungan',    TokenType.GABUNGAN],
  ['muat',        TokenType.MUAT],
  ['ruang',       TokenType.RUANG],
  ['pakai',       TokenType.PAKAI],

  ['kelas',       TokenType.KELAS],
  ['turunan',     TokenType.TURUNAN],
  ['antarmuka',   TokenType.ANTARMUKA],
  ['publik',      TokenType.PUBLIK],
  ['privat',      TokenType.PRIVAT],
  ['lindung',     TokenType.LINDUNG],
  ['virtual',     TokenType.VIRTUAL],
  ['timpa',       TokenType.TIMPA],
  ['abstrak',     TokenType.ABSTRAK],
  ['akhir',       TokenType.AKHIR],
  ['teman',       TokenType.TEMAN],
  ['operator',    TokenType.OPERATOR],
  ['cetakan',     TokenType.CETAKAN],
  ['jenis',       TokenType.JENIS],
  ['ukuranDari',  TokenType.UKURAN_DARI],
  ['jenisApa',    TokenType.JENIS_APA],
  ['jadiTetap',   TokenType.JADI_TETAP],
  ['jadiDinamis', TokenType.JADI_DINAMIS],
  ['takAda',      TokenType.TAK_ADA],
  ['mungkin',     TokenType.MUNGKIN],
  ['tes',         TokenType.TES],
  ['kalauKosong', TokenType.KALAU_KOSONG],
  ['diri',        TokenType.DIRI],
  ['induk',       TokenType.INDUK],

  ['klo',         TokenType.KLO],
  ['selama',      TokenType.SELAMA],
  ['ulang',       TokenType.ULANG],
  ['lakukan',     TokenType.LAKUKAN],
  ['pilih',       TokenType.PILIH],
  ['kasus',       TokenType.KASUS],
  ['biasanya',    TokenType.DEFAULT],
  ['stop',        TokenType.STOP],
  ['lanjut',      TokenType.LANJUT],
  ['loncat',      TokenType.LONCAT],
  ['errorNya',    TokenType.ERROR_NYA],
  ['coba',        TokenType.COBA],
  ['bikin',       TokenType.BIKIN],
  ['buang',       TokenType.BUANG],

  ['bener',       TokenType.BENER],
  ['salah',       TokenType.SALAH],

  ['dan',         TokenType.DAN_KATA],
  ['atau',        TokenType.ATAU_KATA],
  ['bukan',       TokenType.BUKAN_KATA],
]);

// Kata kunci dua-suku-kata (multi-word) yang perlu ditangani khusus di lexer
// karena mengandung underscore sebagai bagian dari satu token logis.
const MULTIWORD_KEYWORDS = new Map([
  ['kalo_gak_klo', TokenType.KALO_GAK_KLO],
  ['kalo_gak',     TokenType.KALO_GAK],
  ['kalo_error',   TokenType.KALO_ERROR],
  ['apapun_hasilnya', TokenType.APAPUN_HASILNYA],
]);

// Catatan: `punyaSifat` (implements) sengaja TIDAK didaftarkan sebagai keyword
// global — dicek dari teksnya secara kontekstual, hanya tepat setelah nama
// kelas/turunan di classDecl() milik parser. Ini supaya kata itu tetap bebas
// dipakai sebagai nama variabel/fungsi biasa di luar deklarasi kelas.

// Tipe primitif untuk parser
const PRIMITIVE_TYPES = new Set([
  TokenType.T_ANGKA, TokenType.T_DESIMAL, TokenType.T_KATA, TokenType.T_HURUF,
  TokenType.T_IYAGAK, TokenType.T_KOSONG, TokenType.T_ANGKA_GEDE, TokenType.T_ANGKA_KECIL,
  TokenType.T_BYTE, TokenType.T_DESIMAL32, TokenType.T_ANGKA_POS, TokenType.T_APAAJA,
]);

class Token {
  constructor(type, value, line, col, raw) {
    this.type  = type;
    this.value = value;
    this.line  = line;
    this.col   = col;
    this.raw   = raw !== undefined ? raw : value;
  }
  toString() {
    return `Token(${this.type}, ${JSON.stringify(this.value)}, L${this.line}:C${this.col})`;
  }
}

// Export
if (typeof module !== 'undefined') {
  module.exports = { TokenType, KEYWORDS, MULTIWORD_KEYWORDS, PRIMITIVE_TYPES, Token };
} else {
  window._NK_TOKENS = { TokenType, KEYWORDS, MULTIWORD_KEYWORDS, PRIMITIVE_TYPES, Token };
}
