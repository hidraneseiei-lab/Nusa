/**
 * =============================================================================
 *  BAHASA NUSA — Definisi Token
 * =============================================================================
 * File ini mendefinisikan seluruh jenis token yang dikenali oleh Lexer bahasa
 * Nusa. Setiap potongan kode sumber akan dipecah menjadi unit-unit token di
 * sinilah "kosakata dasar" bahasa Nusa didefinisikan.
 *
 * Repo resmi: https://github.com/hidraneseiei-lab/Nusa
 * =============================================================================
 */

export type TokenType =
  // Literal
  | "NUMBER"
  | "STRING"
  | "IDENTIFIER"
  // Kata kunci deklarasi
  | "SIMPAN" // let
  | "TETAP" // const
  | "FUNGSI" // function
  | "KELAS" // class
  | "BARU" // new
  | "WARISI" // extends
  | "INDUK" // super
  | "INI" // this
  | "ASINKRON" // async
  | "TUNGGU" // await
  | "IMPOR" // import
  | "EKSPOR" // export
  | "DARI" // from / for-each "of"
  // Kontrol alur
  | "JIKA" // if
  | "LAIN" // else
  | "SELAMA" // while
  | "ULANG" // for (classic)
  | "UNTUK" // for (each) -> "untuk setiap"
  | "SETIAP" // each
  | "KEMBALI" // return
  | "BERHENTI" // break
  | "LANJUT" // continue
  | "COBA" // try
  | "TANGKAP" // catch
  | "AKHIRNYA" // finally
  | "LEMPAR" // throw
  // Literal boolean & null
  | "BENAR" // true
  | "SALAH" // false
  | "KOSONG" // null
  // Operator logika berkata
  | "DAN" // &&
  | "ATAU" // ||
  | "TIDAK" // !
  // Operator & simbol
  | "PLUS"
  | "MINUS"
  | "STAR"
  | "SLASH"
  | "PERSEN"
  | "CARET"
  | "ASSIGN"
  | "PLUS_ASSIGN"
  | "MINUS_ASSIGN"
  | "STAR_ASSIGN"
  | "SLASH_ASSIGN"
  | "EQ"
  | "NEQ"
  | "LT"
  | "LTE"
  | "GT"
  | "GTE"
  | "AND_AND"
  | "OR_OR"
  | "NOT"
  | "LPAREN"
  | "RPAREN"
  | "LBRACE"
  | "RBRACE"
  | "LBRACKET"
  | "RBRACKET"
  | "COMMA"
  | "SEMI"
  | "COLON"
  | "DOT"
  | "SPREAD"
  | "ARROW"
  | "QUESTION"
  | "EOF";

/** Bagian dari sebuah literal string — teks biasa atau ekspresi ter-interpolasi `{expr}` */
export type StringPart =
  | { kind: "text"; value: string }
  | { kind: "expr"; source: string; line: number };

export interface Token {
  type: TokenType;
  lexeme: string;
  literal?: unknown;
  parts?: StringPart[];
  line: number;
  col: number;
}

/** Peta kata kunci resmi Bahasa Nusa -> jenis token */
export const KEYWORDS: Record<string, TokenType> = {
  simpan: "SIMPAN",
  tetap: "TETAP",
  fungsi: "FUNGSI",
  kelas: "KELAS",
  baru: "BARU",
  warisi: "WARISI",
  induk: "INDUK",
  ini: "INI",
  asinkron: "ASINKRON",
  tunggu: "TUNGGU",
  impor: "IMPOR",
  ekspor: "EKSPOR",
  dari: "DARI",
  jika: "JIKA",
  lain: "LAIN",
  selama: "SELAMA",
  ulang: "ULANG",
  untuk: "UNTUK",
  setiap: "SETIAP",
  kembali: "KEMBALI",
  berhenti: "BERHENTI",
  lanjut: "LANJUT",
  coba: "COBA",
  tangkap: "TANGKAP",
  akhirnya: "AKHIRNYA",
  lempar: "LEMPAR",
  benar: "BENAR",
  salah: "SALAH",
  kosong: "KOSONG",
  dan: "DAN",
  atau: "ATAU",
  tidak: "TIDAK",
};

/** Deskripsi ramah-manusia untuk pesan galat */
export const TOKEN_DESCRIPTIONS: Partial<Record<TokenType, string>> = {
  EOF: "akhir berkas",
  IDENTIFIER: "pengenal (identifier)",
  NUMBER: "angka",
  STRING: "teks",
};
