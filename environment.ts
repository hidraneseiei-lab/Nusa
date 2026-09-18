/**
 * =============================================================================
 *  BAHASA NUSA — Lingkungan (Environment / Scope)
 * =============================================================================
 *  Merepresentasikan "ruang memori" tempat variabel disimpan. Setiap blok
 *  kode, fungsi, dan modul memiliki Environment sendiri yang terhubung ke
 *  Environment induknya (lexical scoping / closures).
 * =============================================================================
 */

import { NusaRuntimeError } from "./errors";

interface Binding {
  value: unknown;
  isConst: boolean;
}

export class Environment {
  private values = new Map<string, Binding>();
  public readonly parent: Environment | null;

  constructor(parent: Environment | null = null) {
    this.parent = parent;
  }

  /** Membuat variabel baru di scope ini */
  define(name: string, value: unknown, isConst = false) {
    if (this.values.has(name)) {
      throw new NusaRuntimeError(`Variabel '${name}' sudah dideklarasikan di ruang lingkup ini`);
    }
    this.values.set(name, { value, isConst });
  }

  /** Mendefinisikan ulang tanpa cek duplikat — dipakai internal (parameter fungsi, dsb) */
  defineForce(name: string, value: unknown, isConst = false) {
    this.values.set(name, { value, isConst });
  }

  private resolve(name: string): Environment {
    // eslint-disable-next-line @typescript-eslint/no-this-alias
    let env: Environment | null = this;
    while (env) {
      if (env.values.has(name)) return env;
      env = env.parent;
    }
    throw new NusaRuntimeError(`Variabel '${name}' tidak dikenali (belum dideklarasikan)`);
  }

  get(name: string): unknown {
    const env = this.resolve(name);
    return env.values.get(name)!.value;
  }

  has(name: string): boolean {
    let env: Environment | null = this;
    while (env) {
      if (env.values.has(name)) return true;
      env = env.parent;
    }
    return false;
  }

  assign(name: string, value: unknown) {
    const env = this.resolve(name);
    const binding = env.values.get(name)!;
    if (binding.isConst) {
      throw new NusaRuntimeError(`Tidak dapat mengubah nilai konstanta '${name}' (dideklarasikan dengan 'tetap')`);
    }
    env.values.set(name, { value, isConst: false });
  }

  child(): Environment {
    return new Environment(this);
  }
}
