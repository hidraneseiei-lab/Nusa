/**
 * =============================================================================
 *  BAHASA NUSA — Interpreter (Tree-Walking Evaluator)
 * =============================================================================
 *  Interpreter membaca AST hasil Parser dan benar-benar MENGEKSEKUSINYA:
 *  membuat variabel di memori, menjalankan percabangan, perulangan, memanggil
 *  fungsi, membuat instance kelas, dan seterusnya.
 *
 *  Catatan desain model eksekusi asinkron:
 *  Bahasa Nusa menjalankan program secara berurutan & deterministik. Operasi
 *  asinkron (mis. permintaan jaringan lewat `Jaringan.ambil`) SELALU otomatis
 *  ditunggu hasilnya oleh interpreter sebelum melanjutkan ke baris berikutnya.
 *  Kata kunci `asinkron` dan `tunggu` tersedia penuh secara sintaks & gaya
 *  penulisan (agar kode terbaca jelas maksudnya), dan tetap 100% aman dipakai
 *  — inilah yang membuat Nusa bebas dari kelas bug "race condition" maupun
 *  "unhandled promise rejection" yang umum terjadi di bahasa lain.
 * =============================================================================
 */

import * as A from "./ast";
import { Environment } from "./environment";
import { BreakSignal, ContinueSignal, NusaRuntimeError, NusaThrow, ReturnSignal } from "./errors";
import {
  NusaCallable,
  NusaClass,
  NusaFunction,
  NusaInstance,
  NusaObject,
  isCallable,
  isPromiseLike,
  isTruthy,
  nusaEquals,
  stringify,
  typeName,
} from "./values";
import { createGlobalEnvironment, OutputSink } from "./stdlib";

export class Interpreter {
  public globals: Environment;
  public environment: Environment;
  private output: OutputSink;
  private steps = 0;
  private readonly MAX_STEPS = 5_000_000;

  constructor(output: OutputSink, fetchImpl: typeof fetch = fetch.bind(globalThis)) {
    this.output = output;
    this.globals = createGlobalEnvironment(output, fetchImpl);
    this.environment = this.globals;
  }

  // -----------------------------------------------------------------------
  // Titik masuk
  // -----------------------------------------------------------------------
  async run(program: A.Program): Promise<void> {
    for (const stmt of program.body) {
      await this.execute(stmt);
    }
  }

  private tick(line: number, col: number) {
    this.steps++;
    if (this.steps > this.MAX_STEPS) {
      throw new NusaRuntimeError(
        "Batas eksekusi terlampaui (kemungkinan perulangan tak terhingga). Program dihentikan demi keamanan.",
        line,
        col
      );
    }
  }

  // -----------------------------------------------------------------------
  // Statement
  // -----------------------------------------------------------------------
  async execute(stmt: A.Stmt): Promise<void> {
    this.tick(stmt.line, stmt.col);
    switch (stmt.kind) {
      case "ExpressionStmt":
        await this.evaluate(stmt.expression);
        return;
      case "VarDecl": {
        const value = stmt.init !== null ? await this.evaluate(stmt.init) : null;
        this.environment.define(stmt.name, value, stmt.isConst);
        return;
      }
      case "Block": {
        await this.executeBlock(stmt, this.environment.child());
        return;
      }
      case "If": {
        if (isTruthy(await this.evaluate(stmt.test))) {
          await this.execute(stmt.consequent);
        } else if (stmt.alternate) {
          await this.execute(stmt.alternate);
        }
        return;
      }
      case "While": {
        while (isTruthy(await this.evaluate(stmt.test))) {
          this.tick(stmt.line, stmt.col);
          try {
            await this.execute(stmt.body);
          } catch (signal) {
            if (signal instanceof BreakSignal) break;
            if (signal instanceof ContinueSignal) continue;
            throw signal;
          }
        }
        return;
      }
      case "For": {
        const prevEnv = this.environment;
        const loopEnv = this.environment.child();
        this.environment = loopEnv;
        try {
          if (stmt.init) await this.execute(stmt.init);
          while (stmt.test === null || isTruthy(await this.evaluate(stmt.test))) {
            this.tick(stmt.line, stmt.col);
            try {
              await this.execute(stmt.body);
            } catch (signal) {
              if (signal instanceof BreakSignal) break;
              if (!(signal instanceof ContinueSignal)) throw signal;
            }
            if (stmt.update) await this.evaluate(stmt.update);
          }
        } finally {
          this.environment = prevEnv;
        }
        return;
      }
      case "ForEach": {
        const iterableVal = await this.evaluate(stmt.iterable);
        const items = this.toIterableList(iterableVal, stmt);
        const prevEnv = this.environment;
        for (let idx = 0; idx < items.length; idx++) {
          this.tick(stmt.line, stmt.col);
          const iterEnv = prevEnv.child();
          iterEnv.define(stmt.varName, items[idx]);
          if (stmt.indexName) iterEnv.define(stmt.indexName, idx);
          this.environment = iterEnv;
          try {
            await this.execute(stmt.body);
          } catch (signal) {
            if (signal instanceof BreakSignal) {
              this.environment = prevEnv;
              return;
            }
            if (signal instanceof ContinueSignal) {
              this.environment = prevEnv;
              continue;
            }
            this.environment = prevEnv;
            throw signal;
          }
          this.environment = prevEnv;
        }
        return;
      }
      case "FunctionDecl": {
        const fn = new NusaFunction(stmt, this.environment, stmt.isAsync);
        this.environment.define(stmt.name, fn);
        return;
      }
      case "ClassDecl": {
        this.declareClass(stmt);
        return;
      }
      case "Return": {
        const value = stmt.value !== null ? await this.evaluate(stmt.value) : null;
        throw new ReturnSignal(value);
      }
      case "Break":
        throw new BreakSignal();
      case "Continue":
        throw new ContinueSignal();
      case "Throw": {
        const val = await this.evaluate(stmt.argument);
        throw new NusaThrow(val);
      }
      case "Try": {
        try {
          try {
            await this.executeBlock(stmt.block, this.environment.child());
          } catch (e) {
            if (e instanceof BreakSignal || e instanceof ContinueSignal || e instanceof ReturnSignal) throw e;
            if (!stmt.catchBlock) throw e;
            const catchEnv = this.environment.child();
            if (stmt.catchParam) catchEnv.define(stmt.catchParam, this.extractErrorValue(e));
            await this.executeBlock(stmt.catchBlock, catchEnv);
          }
        } finally {
          if (stmt.finallyBlock) await this.executeBlock(stmt.finallyBlock, this.environment.child());
        }
        return;
      }
      case "Import": {
        this.output(
          `Catatan: 'impor \"${stmt.from}\"' diabaikan pada lingkungan Playground satu-berkas. Seluruh pustaka standar Nusa (Matematika, Teks, Larik, Objek, Waktu, JSON, Acak, Jaringan) sudah otomatis tersedia secara global tanpa perlu impor.`,
          "warn"
        );
        return;
      }
      case "Export": {
        await this.execute(stmt.declaration);
        return;
      }
      default: {
        const _exhaustive: never = stmt;
        throw new NusaRuntimeError(`Pernyataan tidak dikenal: ${JSON.stringify(_exhaustive)}`);
      }
    }
  }

  async executeBlock(block: A.BlockStmt, env: Environment): Promise<void> {
    const previous = this.environment;
    this.environment = env;
    try {
      for (const s of block.body) {
        await this.execute(s);
      }
    } finally {
      this.environment = previous;
    }
  }

  private toIterableList(value: unknown, stmt: A.ForEachStmt): unknown[] {
    if (Array.isArray(value)) return value;
    if (typeof value === "string") return value.split("");
    if (value instanceof NusaObject) {
      return Array.from(value.props.entries()).map(([k, v]) => {
        const pair = new NusaObject();
        pair.set("kunci", k);
        pair.set("nilai", v);
        return pair;
      });
    }
    throw new NusaRuntimeError(
      `Nilai bertipe '${typeName(value)}' tidak dapat digunakan pada 'untuk setiap ... dari ...'`,
      stmt.line,
      stmt.col
    );
  }

  private extractErrorValue(e: unknown): unknown {
    if (e instanceof NusaThrow) return e.value;
    if (e instanceof NusaRuntimeError) return e.message;
    if (e instanceof Error) return e.message;
    return String(e);
  }

  private declareClass(stmt: A.ClassDeclStmt) {
    let superClass: NusaClass | null = null;
    if (stmt.superClass) {
      const sc = this.environment.get(stmt.superClass);
      if (!(sc instanceof NusaClass)) {
        throw new NusaRuntimeError(
          `'${stmt.superClass}' bukan merupakan kelas, tidak dapat diwarisi`,
          stmt.line,
          stmt.col
        );
      }
      superClass = sc;
    }
    const klass = new NusaClass(stmt.name, superClass);
    for (const m of stmt.methods) {
      const fn = new NusaFunction(m, this.environment, m.isAsync, null, m.name === "konstruktor");
      fn.homeClass = klass;
      klass.methods.set(m.name, fn);
    }
    for (const m of stmt.staticMethods) {
      const fn = new NusaFunction(m, this.environment, m.isAsync, null, false);
      fn.homeClass = klass;
      klass.staticMethods.set(m.name, fn);
    }
    this.environment.define(stmt.name, klass);
  }

  // -----------------------------------------------------------------------
  // Ekspresi
  // -----------------------------------------------------------------------
  async evaluate(expr: A.Expr): Promise<unknown> {
    this.tick(expr.line, expr.col);
    switch (expr.kind) {
      case "Literal":
        return expr.value;
      case "TemplateLiteral": {
        let out = "";
        for (const part of expr.parts) {
          if (part.kind === "Literal") out += String(part.value);
          else out += stringify(await this.evaluate(part));
        }
        return out;
      }
      case "Identifier":
        return this.environment.get(expr.name);
      case "This": {
        if (!this.environment.has("ini")) {
          throw new NusaRuntimeError("'ini' hanya dapat digunakan di dalam metode kelas", expr.line, expr.col);
        }
        return this.environment.get("ini");
      }
      case "Super":
        throw new NusaRuntimeError(
          "'induk' hanya dapat digunakan bersama pemanggilan metode, contoh: induk.metode(...) atau induk(...)",
          expr.line,
          expr.col
        );
      case "Array": {
        const out: unknown[] = [];
        for (const el of expr.elements) {
          if (el.kind === "Spread") {
            const spreadVal = await this.evaluate(el.argument);
            out.push(...this.spreadToArray(spreadVal, el));
          } else {
            out.push(await this.evaluate(el));
          }
        }
        return out;
      }
      case "Object": {
        const obj = new NusaObject();
        for (const prop of expr.properties) {
          const key = prop.computed ? stringify(await this.evaluate(prop.computed)) : prop.key;
          obj.set(key, await this.evaluate(prop.value));
        }
        return obj;
      }
      case "Unary": {
        if (expr.operator === "-") {
          const v = await this.evaluate(expr.argument);
          if (typeof v !== "number") {
            throw new NusaRuntimeError(`Operator '-' unary butuh angka, mendapat ${typeName(v)}`, expr.line, expr.col);
          }
          return -v;
        }
        const v = await this.evaluate(expr.argument);
        return !isTruthy(v);
      }
      case "Binary":
        return this.evalBinary(expr);
      case "Logical": {
        const left = await this.evaluate(expr.left);
        if (expr.operator === "dan") {
          return isTruthy(left) ? await this.evaluate(expr.right) : left;
        }
        return isTruthy(left) ? left : await this.evaluate(expr.right);
      }
      case "Conditional": {
        const t = await this.evaluate(expr.test);
        return isTruthy(t) ? await this.evaluate(expr.consequent) : await this.evaluate(expr.alternate);
      }
      case "Assign":
        return this.evalAssign(expr);
      case "Call":
        return this.evalCall(expr);
      case "Member":
        return this.evalMemberGet(expr);
      case "FunctionExpr": {
        let closure = this.environment;
        if (expr.name) {
          closure = this.environment.child();
        }
        const fn = new NusaFunction(expr, closure, expr.isAsync);
        if (expr.name) closure.define(expr.name, fn);
        return fn;
      }
      case "Lambda":
        return new NusaFunction(expr, this.environment, false);
      case "New":
        return this.evalNew(expr);
      case "Await": {
        const v = await this.evaluate(expr.argument);
        return isPromiseLike(v) ? await v : v;
      }
      case "Spread":
        throw new NusaRuntimeError(
          "Operator sebar '...' hanya boleh dipakai di dalam literal larik atau daftar argumen fungsi",
          expr.line,
          expr.col
        );
      default: {
        const _exhaustive: never = expr;
        throw new NusaRuntimeError(`Ekspresi tidak dikenal: ${JSON.stringify(_exhaustive)}`);
      }
    }
  }

  private spreadToArray(value: unknown, node: A.Node): unknown[] {
    if (Array.isArray(value)) return value;
    if (typeof value === "string") return value.split("");
    throw new NusaRuntimeError(`Operator sebar '...' butuh larik atau teks, mendapat ${typeName(value)}`, node.line, node.col);
  }

  private async evalArgs(nodes: A.Expr[]): Promise<unknown[]> {
    const out: unknown[] = [];
    for (const n of nodes) {
      if (n.kind === "Spread") {
        const v = await this.evaluate(n.argument);
        out.push(...this.spreadToArray(v, n));
      } else {
        out.push(await this.evaluate(n));
      }
    }
    return out;
  }

  private async evalBinary(expr: A.BinaryExpr): Promise<unknown> {
    const left = await this.evaluate(expr.left);
    const right = await this.evaluate(expr.right);
    const op = expr.operator;

    if (op === "+") {
      if (typeof left === "number" && typeof right === "number") return left + right;
      if (Array.isArray(left) && Array.isArray(right)) return [...left, ...right];
      if (typeof left === "string" || typeof right === "string") return stringify(left) + stringify(right);
      throw new NusaRuntimeError(
        `Operator '+' tidak mendukung kombinasi tipe ${typeName(left)} dan ${typeName(right)}`,
        expr.line,
        expr.col
      );
    }

    if (op === "==") return nusaEquals(left, right);
    if (op === "!=") return !nusaEquals(left, right);

    if (op === "<" || op === ">" || op === "<=" || op === ">=") {
      if (typeof left === "number" && typeof right === "number") {
        switch (op) {
          case "<":
            return left < right;
          case ">":
            return left > right;
          case "<=":
            return left <= right;
          case ">=":
            return left >= right;
        }
      }
      if (typeof left === "string" && typeof right === "string") {
        switch (op) {
          case "<":
            return left < right;
          case ">":
            return left > right;
          case "<=":
            return left <= right;
          case ">=":
            return left >= right;
        }
      }
      throw new NusaRuntimeError(
        `Operator '${op}' butuh dua angka atau dua teks, mendapat ${typeName(left)} dan ${typeName(right)}`,
        expr.line,
        expr.col
      );
    }

    // Operator aritmetika murni angka: - * / % ^
    if (typeof left !== "number" || typeof right !== "number") {
      throw new NusaRuntimeError(
        `Operator '${op}' butuh dua angka, mendapat ${typeName(left)} dan ${typeName(right)}`,
        expr.line,
        expr.col
      );
    }
    switch (op) {
      case "-":
        return left - right;
      case "*":
        return left * right;
      case "/":
        if (right === 0) throw new NusaRuntimeError("Pembagian dengan nol tidak diperbolehkan", expr.line, expr.col);
        return left / right;
      case "%":
        if (right === 0) throw new NusaRuntimeError("Modulo dengan nol tidak diperbolehkan", expr.line, expr.col);
        return left % right;
      case "^":
        return Math.pow(left, right);
      default:
        throw new NusaRuntimeError(`Operator biner tidak dikenal: '${op}'`, expr.line, expr.col);
    }
  }

  private async evalAssign(expr: A.AssignExpr): Promise<unknown> {
    let newValue: unknown;

    const computeCompound = async (current: unknown): Promise<unknown> => {
      if (expr.operator === "=") return this.evaluate(expr.value);
      const rhs = await this.evaluate(expr.value);
      if (expr.operator === "+=") {
        if (typeof current === "number" && typeof rhs === "number") return current + rhs;
        if (typeof current === "string" || typeof rhs === "string") return stringify(current) + stringify(rhs);
        if (Array.isArray(current) && Array.isArray(rhs)) return [...current, ...rhs];
        throw new NusaRuntimeError(`Operator '+=' tidak mendukung tipe ${typeName(current)} dan ${typeName(rhs)}`, expr.line, expr.col);
      }
      if (typeof current !== "number" || typeof rhs !== "number") {
        throw new NusaRuntimeError(`Operator '${expr.operator}' butuh angka`, expr.line, expr.col);
      }
      switch (expr.operator) {
        case "-=":
          return current - rhs;
        case "*=":
          return current * rhs;
        case "/=":
          if (rhs === 0) throw new NusaRuntimeError("Pembagian dengan nol tidak diperbolehkan", expr.line, expr.col);
          return current / rhs;
      }
      return current;
    };

    if (expr.target.kind === "Identifier") {
      const name = expr.target.name;
      const current = expr.operator === "=" ? undefined : this.environment.get(name);
      newValue = await computeCompound(current);
      this.environment.assign(name, newValue);
      return newValue;
    }

    // Target adalah Member (mis. objek.properti atau larik[indeks])
    const memberExpr = expr.target as A.MemberExpr;
    const objVal = await this.evaluate(memberExpr.object);
    const key = memberExpr.computed ? await this.evaluate(memberExpr.property as A.Expr) : (memberExpr.property as string);
    const current = expr.operator === "=" ? undefined : this.getMember(objVal, key, memberExpr);
    newValue = await computeCompound(current);
    this.setMember(objVal, key, newValue, memberExpr);
    return newValue;
  }

  private async evalCall(expr: A.CallExpr): Promise<unknown> {
    // Pemanggilan konstruktor induk: induk(args)
    if (expr.callee.kind === "Super") {
      const homeClass = this.environment.has("@homeClass") ? (this.environment.get("@homeClass") as NusaClass | null) : null;
      const thisInstance = this.environment.has("ini") ? (this.environment.get("ini") as NusaInstance) : null;
      if (!homeClass || !homeClass.superClass || !thisInstance) {
        throw new NusaRuntimeError("'induk(...)' hanya bisa dipakai di dalam konstruktor kelas turunan", expr.line, expr.col);
      }
      const ctor = homeClass.superClass.findMethod("konstruktor");
      const args = await this.evalArgs(expr.args);
      if (ctor) await this.callCallable(ctor.bind(thisInstance), args);
      return null;
    }

    const args = await this.evalArgs(expr.args);
    const calleeVal = await this.evaluate(expr.callee);
    if (!isCallable(calleeVal)) {
      throw new NusaRuntimeError(
        `Nilai ini bukan fungsi dan tidak dapat dipanggil (tipe: ${typeName(calleeVal)})`,
        expr.line,
        expr.col
      );
    }
    return this.callCallable(calleeVal, args);
  }

  private async evalNew(expr: A.NewExpr): Promise<unknown> {
    const klassVal = await this.evaluate(expr.callee);
    if (!(klassVal instanceof NusaClass)) {
      throw new NusaRuntimeError(`'baru' hanya bisa dipakai pada kelas, mendapat ${typeName(klassVal)}`, expr.line, expr.col);
    }
    const args = await this.evalArgs(expr.args);
    return this.instantiateClass(klassVal, args);
  }

  private async evalMemberGet(expr: A.MemberExpr): Promise<unknown> {
    if (expr.object.kind === "Super") {
      return this.getSuperMethod(expr.property as string, expr);
    }
    const objVal = await this.evaluate(expr.object);
    const key = expr.computed ? await this.evaluate(expr.property as A.Expr) : (expr.property as string);
    return this.getMember(objVal, key, expr);
  }

  private getSuperMethod(name: string, node: A.Node): NusaFunction {
    const homeClass = this.environment.has("@homeClass") ? (this.environment.get("@homeClass") as NusaClass | null) : null;
    const thisInstance = this.environment.has("ini") ? (this.environment.get("ini") as NusaInstance) : null;
    if (!homeClass || !homeClass.superClass || !thisInstance) {
      throw new NusaRuntimeError("'induk' hanya bisa dipakai di dalam metode kelas turunan", node.line, node.col);
    }
    const method = homeClass.superClass.findMethod(name);
    if (!method) {
      throw new NusaRuntimeError(`Metode '${name}' tidak ditemukan pada kelas induk '${homeClass.superClass.name}'`, node.line, node.col);
    }
    return method.bind(thisInstance);
  }

  private getMember(objVal: unknown, key: unknown, node: A.Node): unknown {
    if (objVal === null || objVal === undefined) {
      throw new NusaRuntimeError(`Tidak dapat mengambil properti '${String(key)}' dari nilai kosong`, node.line, node.col);
    }
    if (typeof objVal === "string") {
      if (typeof key === "number") return objVal[key] ?? null;
      if (key === "panjang") return objVal.length;
      throw new NusaRuntimeError(`Teks tidak memiliki properti '${String(key)}'. Gunakan namespace 'Teks.*'`, node.line, node.col);
    }
    if (Array.isArray(objVal)) {
      if (typeof key === "number") return objVal[key] ?? null;
      if (key === "panjang") return objVal.length;
      throw new NusaRuntimeError(`Larik tidak memiliki properti '${String(key)}'. Gunakan namespace 'Larik.*'`, node.line, node.col);
    }
    if (objVal instanceof NusaObject) return objVal.get(String(key));
    if (objVal instanceof NusaInstance) return objVal.get(String(key));
    if (objVal instanceof NusaClass) {
      const m = objVal.findStatic(String(key));
      if (m) return m;
      throw new NusaRuntimeError(`Kelas '${objVal.name}' tidak punya metode statis '${String(key)}'`, node.line, node.col);
    }
    if (isCallable(objVal)) {
      if (key === "nama") return objVal.nusaCallableName;
      throw new NusaRuntimeError(`Fungsi tidak memiliki properti '${String(key)}'`, node.line, node.col);
    }
    throw new NusaRuntimeError(`Tidak dapat mengambil properti '${String(key)}' dari tipe ${typeName(objVal)}`, node.line, node.col);
  }

  private setMember(objVal: unknown, key: unknown, value: unknown, node: A.Node) {
    if (Array.isArray(objVal)) {
      if (typeof key !== "number" || !Number.isInteger(key) || key < 0) {
        throw new NusaRuntimeError("Indeks larik harus berupa bilangan bulat tidak negatif", node.line, node.col);
      }
      while (objVal.length < key) objVal.push(null);
      objVal[key] = value;
      return;
    }
    if (objVal instanceof NusaObject) {
      objVal.set(String(key), value);
      return;
    }
    if (objVal instanceof NusaInstance) {
      objVal.set(String(key), value);
      return;
    }
    throw new NusaRuntimeError(`Tidak dapat menetapkan properti pada tipe ${typeName(objVal)}`, node.line, node.col);
  }

  // -----------------------------------------------------------------------
  // Pemanggilan fungsi / instansiasi kelas — dipakai internal & oleh stdlib
  // -----------------------------------------------------------------------
  async callCallable(callee: NusaCallable, args: unknown[]): Promise<unknown> {
    let result = callee.call(this, args);
    if (isPromiseLike(result)) result = await result;
    return result;
  }

  /** API publik dipakai oleh fungsi native stdlib untuk memanggil callback milik pengguna */
  async invoke(fn: unknown, args: unknown[]): Promise<unknown> {
    if (!isCallable(fn)) {
      throw new NusaRuntimeError(`Nilai yang diberikan sebagai callback bukan fungsi (tipe: ${typeName(fn)})`);
    }
    return this.callCallable(fn, args);
  }

  async callNusaFunction(fn: NusaFunction, args: unknown[]): Promise<unknown> {
    const env = fn.closure.child();
    if (fn.boundThis) {
      env.defineForce("ini", fn.boundThis);
      env.defineForce("@homeClass", fn.homeClass ?? null);
    } else if (fn.homeClass) {
      env.defineForce("@homeClass", fn.homeClass);
    }

    const params = fn.declaration.params;
    let i = 0;
    for (const p of params) {
      if (p.rest) {
        env.defineForce(p.name, args.slice(i));
        i = args.length;
        continue;
      }
      if (i < args.length && args[i] !== undefined) {
        env.defineForce(p.name, args[i]);
      } else if (p.default) {
        env.defineForce(p.name, await this.evaluate(p.default));
      } else {
        env.defineForce(p.name, null);
      }
      i++;
    }

    if (fn.declaration.kind === "Lambda" && fn.declaration.body.kind !== "Block") {
      return this.evaluate(fn.declaration.body as A.Expr);
    }

    const body = fn.declaration.body as A.BlockStmt;
    try {
      await this.executeBlock(body, env);
    } catch (signal) {
      if (signal instanceof ReturnSignal) {
        return fn.isInitializer ? fn.boundThis : signal.value;
      }
      throw signal;
    }
    return fn.isInitializer ? fn.boundThis : null;
  }

  async instantiateClass(klass: NusaClass, args: unknown[]): Promise<NusaInstance> {
    const instance = new NusaInstance(klass);
    const ctor = klass.findMethod("konstruktor");
    if (ctor) {
      await this.callCallable(ctor.bind(instance), args);
    }
    return instance;
  }
}
