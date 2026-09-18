/**
 * =============================================================================
 *  BAHASA NUSA — Sistem Galat (Error System)
 * =============================================================================
 * Bahasa Nusa membedakan tiga jenis galat, persis mengikuti tiga tahap pipa
 * eksekusi bahasa: Leksikal, Sintaksis (Parser), dan Runtime (Interpreter).
 * Semua pesan galat ditulis dalam Bahasa Indonesia agar konsisten dengan
 * identitas bahasa ini.
 * =============================================================================
 */

export class NusaError extends Error {
  public readonly tahap: "Leksikal" | "Sintaksis" | "Eksekusi";
  public readonly line: number;
  public readonly col: number;

  constructor(
    tahap: "Leksikal" | "Sintaksis" | "Eksekusi",
    message: string,
    line: number,
    col: number
  ) {
    super(message);
    this.name = "NusaError";
    this.tahap = tahap;
    this.line = line;
    this.col = col;
  }

  /** Format pesan yang rapi untuk ditampilkan pada konsol keluaran Nusa */
  toDisplayString(): string {
    return `[Galat ${this.tahap}] Baris ${this.line}, Kolom ${this.col}: ${this.message}`;
  }
}

export class NusaLexError extends NusaError {
  constructor(message: string, line: number, col: number) {
    super("Leksikal", message, line, col);
    this.name = "NusaLexError";
  }
}

export class NusaParseError extends NusaError {
  constructor(message: string, line: number, col: number) {
    super("Sintaksis", message, line, col);
    this.name = "NusaParseError";
  }
}

export class NusaRuntimeError extends NusaError {
  constructor(message: string, line: number = 0, col: number = 0) {
    super("Eksekusi", message, line, col);
    this.name = "NusaRuntimeError";
  }
}

/**
 * Nilai yang dilempar oleh pernyataan `lempar` milik pengguna.
 * Dibungkus agar bisa dibedakan dari galat internal interpreter.
 */
export class NusaThrow {
  constructor(public value: unknown) {}
}

/** Sinyal kontrol-alur internal (bukan galat sungguhan) — dipakai oleh interpreter */
export class ReturnSignal {
  constructor(public value: unknown) {}
}
export class BreakSignal {}
export class ContinueSignal {}
