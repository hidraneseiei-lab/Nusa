/**
 * NusaKids — Error Classes
 * Semua jenis error dalam bahasa akrab & gampang dimengerti pemula
 */

'use strict';

class NusaError extends Error {
  constructor(message, line, col, source) {
    super(message);
    this.namaError = 'Waduh';
    this.line      = line || 0;
    this.col       = col  || 0;
    this.source    = source || null;
    this.hint      = null;
    this.stack_    = [];
  }

  format() {
    let msg = `\n╔══ ${this.namaError} ══\n`;
    if (this.line) msg += `║ Baris ${this.line}${this.col ? ':' + this.col : ''}\n`;
    msg += `║ ${this.message}\n`;
    if (this.hint) msg += `║ 💡 Coba: ${this.hint}\n`;
    if (this.source) {
      const lines = this.source.split('\n');
      const ln = this.line - 1;
      if (lines[ln] !== undefined) {
        msg += `║\n║ ${this.line.toString().padStart(4)} │ ${lines[ln]}\n`;
        const arrowPos = ' '.repeat((this.col || 1) - 1 + 9);
        msg += `║ ${arrowPos}^\n`;
      }
    }
    if (this.stack_.length > 0) {
      msg += `║\n║ Ceritanya gini urutannya:\n`;
      for (const s of this.stack_) {
        msg += `║   di ${s.name} (baris ${s.line})\n`;
      }
    }
    msg += `╚${'═'.repeat(40)}`;
    return msg;
  }
}

class LexError extends NusaError {
  constructor(message, line, col, source) {
    super(message, line, col, source);
    this.namaError = 'Eh, ada karakter aneh';
  }
}

class ParseError extends NusaError {
  constructor(message, token, source) {
    super(message, token ? token.line : 0, token ? token.col : 0, source);
    this.namaError = 'Eh, kodenya belum lengkap';
    this.token = token;
  }
}

class TypeError_ extends NusaError {
  constructor(message, line, col, source) {
    super(message, line, col, source);
    this.namaError = 'Tipe datanya kayaknya salah';
  }
}

class RuntimeError extends NusaError {
  constructor(message, line, col) {
    super(message, line, col);
    this.namaError = 'Ada yang error pas dijalanin';
  }
}

class RangeError_ extends RuntimeError {
  constructor(message, line) {
    super(message, line);
    this.namaError = 'Kelewat batas nih';
  }
}

class NullError extends RuntimeError {
  constructor(message, line) {
    super(message, line);
    this.namaError = 'Isinya kosong nih';
  }
}

class DivisionError extends RuntimeError {
  constructor(line) {
    super('Gak boleh bagi sama nol ya', line);
    this.namaError = 'Pembagian nol';
    this.hint = 'Cek dulu, jangan sampai angka pembaginya 0';
  }
}

class OverflowError extends RuntimeError {
  constructor(message, line) {
    super(message || 'Angkanya kegedean, kelewat batas tipe datanya', line);
    this.namaError = 'Angkanya kebesaran';
  }
}

class StackOverflowError extends RuntimeError {
  constructor(line) {
    super('Fungsinya manggil dirinya sendiri kebanyakan (rekursi kebablasan)', line);
    this.namaError = 'Muter-muter terus nih';
    this.hint = 'Cek lagi kondisi yang bikin fungsi rekursif ini berhenti';
  }
}

class IterationError extends RuntimeError {
  constructor(line) {
    super('Perulangannya kebanyakan muter, kayaknya gak berhenti-berhenti', line);
    this.namaError = 'Loop-nya gak berhenti';
    this.hint = 'Cek lagi kondisi buat keluar dari perulangan ini';
  }
}

class NotCallableError extends RuntimeError {
  constructor(name, line) {
    super(`'${name}' itu bukan fungsi, jadi gak bisa dipanggil pake ()`, line);
    this.namaError = 'Itu bukan fungsi';
  }
}

class UndefinedError extends RuntimeError {
  constructor(name, line) {
    super(`'${name}' belum pernah dibikin/dideklarasikan`, line);
    this.namaError = 'Belum kenal nih';
    this.hint = `Pastikan udah bikin '${name}' duluan sebelum dipakai`;
  }
}

class ConstError extends RuntimeError {
  constructor(name, line) {
    super(`'${name}' itu udah 'pas' (tetap), gak bisa diubah-ubah lagi`, line);
    this.namaError = 'Ini gak boleh diubah';
    this.hint = `Kalau emang mau bisa diubah, pakai 'apaAja' aja, jangan 'pas'`;
  }
}

class TestFailError extends RuntimeError {
  constructor(message, line) {
    super(message, line);
    this.namaError = 'Tes gagal';
  }
}

class ReturnSignal {
  constructor(value) { this.value = value; }
}
class BreakSignal {
  constructor(label) { this.label = label; }
}
class ContinueSignal {
  constructor(label) { this.label = label; }
}
class GotoSignal {
  constructor(label) { this.label = label; }
}
class ThrowSignal {
  constructor(value, line) { this.value = value; this.line = line; }
}

if (typeof module !== 'undefined') {
  module.exports = {
    NusaError, LexError, ParseError, TypeError_, RuntimeError,
    RangeError_, NullError, DivisionError, OverflowError,
    StackOverflowError, IterationError, NotCallableError,
    UndefinedError, ConstError, TestFailError,
    ReturnSignal, BreakSignal, ContinueSignal, GotoSignal, ThrowSignal,
  };
} else {
  window._NK_ERRORS = {
    NusaError, LexError, ParseError, TypeError_, RuntimeError,
    RangeError_, NullError, DivisionError, OverflowError,
    StackOverflowError, IterationError, NotCallableError,
    UndefinedError, ConstError, TestFailError,
    ReturnSignal, BreakSignal, ContinueSignal, GotoSignal, ThrowSignal,
  };
}
