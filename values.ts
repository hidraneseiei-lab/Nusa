/**
 * =============================================================================
 *  BAHASA NUSA — Model Nilai Runtime
 * =============================================================================
 *  Mendefinisikan representasi nilai saat program Nusa dieksekusi: fungsi,
 *  kelas, instance, objek, serta fungsi-fungsi bantu (stringify, kesetaraan,
 *  pengecekan tipe, dsb).
 * =============================================================================
 */

import type * as A from "./ast";
import type { Environment } from "./environment";
import type { Interpreter } from "./interpreter";
import { NusaRuntimeError } from "./errors";

// ---------------------------------------------------------------------------
// Objek Nusa (literal {} dan instance runtime)
// ---------------------------------------------------------------------------
export class NusaObject {
  public props = new Map<string, unknown>();
  constructor(entries?: Iterable<[string, unknown]>) {
    if (entries) for (const [k, v] of entries) this.props.set(k, v);
  }
  get(key: string): unknown {
    return this.props.has(key) ? this.props.get(key) : null;
  }
  set(key: string, value: unknown) {
    this.props.set(key, value);
  }
}

// ---------------------------------------------------------------------------
// Callable — antarmuka umum untuk segala sesuatu yang bisa "dipanggil()"
// ---------------------------------------------------------------------------
export interface NusaCallable {
  nusaCallableName: string;
  arity(): number;
  call(interpreter: Interpreter, args: unknown[]): unknown | Promise<unknown>;
}

export function isCallable(v: unknown): v is NusaCallable {
  return !!v && typeof v === "object" && typeof (v as NusaCallable).call === "function" && "nusaCallableName" in (v as object);
}

// ---------------------------------------------------------------------------
// Fungsi native (bagian dari pustaka standar / stdlib)
// ---------------------------------------------------------------------------
export class NativeFunction implements NusaCallable {
  nusaCallableName: string;
  private fn: (interpreter: Interpreter, args: unknown[]) => unknown;
  private minArity: number;

  constructor(name: string, minArity: number, fn: (interpreter: Interpreter, args: unknown[]) => unknown) {
    this.nusaCallableName = name;
    this.fn = fn;
    this.minArity = minArity;
  }
  arity(): number {
    return this.minArity;
  }
  call(interpreter: Interpreter, args: unknown[]): unknown {
    return this.fn(interpreter, args);
  }
}

// ---------------------------------------------------------------------------
// Fungsi buatan pengguna (fungsi/lambda hasil deklarasi kode Nusa)
// ---------------------------------------------------------------------------
export class NusaFunction implements NusaCallable {
  nusaCallableName: string;
  /** Kelas tempat metode ini didefinisikan — dipakai untuk resolusi 'induk' (super) */
  homeClass: NusaClass | null = null;
  constructor(
    public declaration: A.FunctionDeclStmt | A.FunctionExpr | A.LambdaExpr,
    public closure: Environment,
    public isAsync: boolean = false,
    public boundThis: NusaInstance | null = null,
    public isInitializer: boolean = false
  ) {
    this.nusaCallableName =
      "name" in declaration && declaration.name ? declaration.name : "<fungsi anonim>";
  }

  arity(): number {
    return this.declaration.params.filter((p) => !p.default && !p.rest).length;
  }

  bind(instance: NusaInstance): NusaFunction {
    const fn = new NusaFunction(this.declaration, this.closure, this.isAsync, instance, this.isInitializer);
    fn.homeClass = this.homeClass;
    return fn;
  }

  call(interpreter: Interpreter, args: unknown[]): unknown {
    return interpreter.callNusaFunction(this, args);
  }
}

// ---------------------------------------------------------------------------
// Kelas & Instance (OOP di Bahasa Nusa)
// ---------------------------------------------------------------------------
export class NusaClass implements NusaCallable {
  nusaCallableName: string;
  methods = new Map<string, NusaFunction>();
  staticMethods = new Map<string, NusaFunction>();

  constructor(public name: string, public superClass: NusaClass | null) {
    this.nusaCallableName = name;
  }

  findMethod(name: string): NusaFunction | undefined {
    if (this.methods.has(name)) return this.methods.get(name);
    if (this.superClass) return this.superClass.findMethod(name);
    return undefined;
  }

  findStatic(name: string): NusaFunction | undefined {
    if (this.staticMethods.has(name)) return this.staticMethods.get(name);
    if (this.superClass) return this.superClass.findStatic(name);
    return undefined;
  }

  arity(): number {
    const ctor = this.findMethod("konstruktor");
    return ctor ? ctor.arity() : 0;
  }

  call(interpreter: Interpreter, args: unknown[]): unknown {
    return interpreter.instantiateClass(this, args);
  }
}

export class NusaInstance {
  fields = new Map<string, unknown>();
  constructor(public klass: NusaClass) {}

  get(name: string): unknown {
    if (this.fields.has(name)) return this.fields.get(name);
    const method = this.klass.findMethod(name);
    if (method) return method.bind(this);
    throw new NusaRuntimeError(`Properti/metode '${name}' tidak ditemukan pada instance kelas '${this.klass.name}'`);
  }

  set(name: string, value: unknown) {
    this.fields.set(name, value);
  }

  toString(): string {
    return `<${this.klass.name} instance>`;
  }
}

// ---------------------------------------------------------------------------
// Nilai Promise pembungkus (agar tunggu/asinkron konsisten)
// ---------------------------------------------------------------------------
export function isPromiseLike(v: unknown): v is Promise<unknown> {
  return !!v && typeof v === "object" && typeof (v as Promise<unknown>).then === "function";
}

// ---------------------------------------------------------------------------
// Util nilai
// ---------------------------------------------------------------------------
export function isTruthy(value: unknown): boolean {
  if (value === null || value === undefined) return false;
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value !== 0 && !Number.isNaN(value);
  if (typeof value === "string") return value.length > 0;
  if (Array.isArray(value)) return true;
  return true;
}

export function typeName(value: unknown): string {
  if (value === null || value === undefined) return "kosong";
  if (typeof value === "boolean") return "boolean";
  if (typeof value === "number") return "angka";
  if (typeof value === "string") return "teks";
  if (Array.isArray(value)) return "larik";
  if (value instanceof NusaClass) return "kelas";
  if (value instanceof NusaInstance) return `instance<${value.klass.name}>`;
  if (isCallable(value)) return "fungsi";
  if (value instanceof NusaObject) return "objek";
  return "objek";
}

export function nusaEquals(a: unknown, b: unknown): boolean {
  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) return false;
    return a.every((v, i) => nusaEquals(v, b[i]));
  }
  return a === b;
}

/** Mengubah nilai runtime Nusa menjadi representasi teks untuk ditampilkan */
export function stringify(value: unknown, seen: Set<unknown> = new Set()): string {
  if (value === null || value === undefined) return "kosong";
  if (typeof value === "string") return value;
  if (typeof value === "boolean") return value ? "benar" : "salah";
  if (typeof value === "number") {
    if (Number.isInteger(value)) return value.toString();
    return String(value);
  }
  if (Array.isArray(value)) {
    if (seen.has(value)) return "[...]";
    seen.add(value);
    return `[${value.map((v) => stringify(v, seen)).join(", ")}]`;
  }
  if (value instanceof NusaObject) {
    if (seen.has(value)) return "{...}";
    seen.add(value);
    const parts: string[] = [];
    for (const [k, v] of value.props) parts.push(`${k}: ${stringify(v, seen)}`);
    return `{ ${parts.join(", ")} }`;
  }
  if (value instanceof NusaInstance) {
    return value.toString();
  }
  if (value instanceof NusaClass) {
    return `<kelas ${value.name}>`;
  }
  if (isCallable(value)) {
    return `<fungsi ${value.nusaCallableName}>`;
  }
  if (value instanceof Map) {
    const parts: string[] = [];
    for (const [k, v] of value) parts.push(`${stringify(k, seen)}: ${stringify(v, seen)}`);
    return `{ ${parts.join(", ")} }`;
  }
  return String(value);
}

/** Representasi lebih detail (dipakai untuk debug / tab AST-JSON di playground) */
export function inspect(value: unknown): string {
  if (typeof value === "string") return `"${value}"`;
  return stringify(value);
}
