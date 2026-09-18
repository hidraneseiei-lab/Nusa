/**
 * NusaLang v2 — Interpreter (Tree-Walking AST Executor)
 * Mengeksekusi AST langsung, mendukung semua fitur bahasa
 */

'use strict';

const _err = (typeof module !== 'undefined') ? require('./errors')      : window._NK_ERRORS;
const _env = (typeof module !== 'undefined') ? require('./environment')  : window._NK_ENV;
const _bi  = (typeof module !== 'undefined') ? require('./builtins')     : window._NK_BUILTINS;

const {
  RuntimeError, RangeError_, NullError, DivisionError, OverflowError,
  StackOverflowError, IterationError, NotCallableError, UndefinedError,
  TestFailError,
  ReturnSignal, BreakSignal, ContinueSignal, GotoSignal, ThrowSignal,
} = _err;
const { Environment } = _env;
const { registerBuiltins } = _bi;

const MAX_CALL_DEPTH = 800;
const MAX_ITERATIONS = 5_000_000;

// ─── NusaObject: Instance kelas/struct ───
class NusaObject {
  constructor(typeName, fields, methods, env) {
    this.__class  = typeName;
    this.__fields = new Map(Object.entries(fields || {}));
    this.__methods = methods || new Map();
    this.__env    = env;
    this.__proto_chain = [];
  }
  get(name) {
    if (this.__fields.has(name)) return this.__fields.get(name);
    if (this.__methods.has(name)) return this.__methods.get(name);
    for (const base of this.__proto_chain) {
      const v = base.get(name);
      if (v !== undefined) return v;
    }
    return undefined;
  }
  set(name, value) { this.__fields.set(name, value); }
  has(name) { return this.__fields.has(name) || this.__methods.has(name); }
  toPlain() {
    const o = { __struct: this.__class };
    for (const [k, v] of this.__fields) o[k] = v;
    return o;
  }
}

class NusaInterpreter {
  constructor(options = {}) {
    this.outputFn    = options.output    || ((s) => console.log(s));
    this.errorFn     = options.error     || ((s) => console.error(s));
    this.onPause     = options.onPause   || null;
    this.onStep      = options.onStep    || null;

    this.global      = new Environment(null, 'global', 'global');
    this.callStack   = [];
    this.breakpoints = new Set();
    this.debugMode   = false;
    this.stepping    = false;
    this.paused      = false;
    this.stepResolve = null;
    this.terminated  = false;
    this._iterCount  = 0;
    this._macros     = new Map();
    this._modules    = new Map(); // imported modules cache
    this._labels     = new Map(); // goto labels

    registerBuiltins(this.global, this);
    this._setupExtraBuiltins();
  }

  _setupExtraBuiltins() {
    // callNative helper — bisa dipanggil dari builtins
    this.callNative = (fn, args) => {
      if (!fn) throw new RuntimeError('Fungsi null dipanggil');
      if (fn.type === 'native') return fn.fn(...args);
      if (fn.type === 'function' || fn.type === 'lambda') {
        // Sync call (untuk map/filter/sort)
        return this._callFnSync(fn, args, 0, fn.name || 'anonim');
      }
      throw new NotCallableError(String(fn), 0);
    };
  }

  _callFnSync(fn, args, line, name) {
    if (this.callStack.length >= MAX_CALL_DEPTH) throw new StackOverflowError(line);
    const fenv = new Environment(fn.closure, fn.name || name, 'function');
    const params = fn.params || [];
    for (let i = 0; i < params.length; i++) {
      const p = params[i];
      let val;
      if (i < args.length) val = args[i];
      else if (p.defaultVal !== null && p.defaultVal !== undefined) val = this._evalSync(p.defaultVal, fn.closure);
      else val = this._defaultVal(p.typeDef);
      if (p.dims && p.dims.length > 0) val = args[i]; // pass array by ref
      else val = this._coerce(val, p.typeDef);
      fenv.define(p.name, val, p.typeDef);
    }
    // Variadic args -- konsisten dengan _callFn (jalur async), lihat catatan di sana.
    if (fn.isVariadic) {
      fenv.define('args', args.length > params.length ? args.slice(params.length) : []);
    }
    // this binding -- WAJIB supaya 'diri' di dalam constructor/method yang
    // dipanggil lewat jalur sync (mis. dari dalam setiap_frame/map/filter)
    // beneran nunjuk ke objek yang benar, bukan undefined.
    if (fn.thisVal !== undefined) fenv.define('__this', fn.thisVal);

    this.callStack.push({ name: fn.name || name, line, env: fenv });
    try {
      this._execBlockSync(fn.body, fenv);
    } catch (e) {
      this.callStack.pop();
      if (e instanceof ReturnSignal) return e.value;
      throw e;
    }
    this.callStack.pop();
    return null;
  }

  _execBlockSync(block, env) {
    const stmts = block.body || block;
    for (const s of stmts) this._execStmtSync(s, env);
  }

  _execStmtSync(node, env) {
    if (this.terminated) return;
    switch (node.type) {
      case 'Block': { const be = new Environment(env, 'blok'); this._execBlockSync(node, be); break; }
      case 'ExprStmt': this._evalSync(node.expr, env); break;
      case 'VarDecl':  this._varDeclSync(node, env); break;
      case 'MultiVarDecl': for (const d of node.decls) this._varDeclSync(d, env); break;
      case 'ReturnStmt': throw new ReturnSignal(node.value ? this._evalSync(node.value, env) : null);
      case 'Break':      throw new BreakSignal(node.label);
      case 'Continue':   throw new ContinueSignal(node.label);
      case 'GotoStmt':   throw new GotoSignal(node.label);
      case 'ThrowStmt':  throw new ThrowSignal(node.value ? this._evalSync(node.value, env) : null, node.line);
      case 'DeleteStmt': this._evalSync(node.target, env); break;
      case 'EmptyStmt':  break;
      case 'IfStmt': {
        if (this.toBool(this._evalSync(node.cond, env))) this._execStmtSync(node.then, env);
        else {
          let done = false;
          for (const ei of (node.elseIfs || [])) {
            if (this.toBool(this._evalSync(ei.cond, env))) { this._execStmtSync(ei.body, env); done = true; break; }
          }
          if (!done && node.els) this._execStmtSync(node.els, env);
        }
        break;
      }
      case 'WhileStmt': {
        while (this.toBool(this._evalSync(node.cond, env))) {
          try { this._execStmtSync(node.body, new Environment(env, 'selama')); }
          catch (e) { if (e instanceof BreakSignal) break; if (e instanceof ContinueSignal) continue; throw e; }
        }
        break;
      }
      case 'DoWhileStmt': {
        do {
          try { this._execStmtSync(node.body, new Environment(env, 'lakukan')); }
          catch (e) { if (e instanceof BreakSignal) break; if (e instanceof ContinueSignal) continue; throw e; }
        } while (!this.terminated && this.toBool(this._evalSync(node.cond, env)));
        break;
      }
      case 'ForStmt': {
        const fe = new Environment(env, 'untuk');
        if (node.init) this._execStmtSync(node.init, fe);
        while (!node.cond || this.toBool(this._evalSync(node.cond, fe))) {
          try { this._execStmtSync(node.body, new Environment(fe, 'untuk_blok')); }
          catch (e) { if (e instanceof BreakSignal) break; if (e instanceof ContinueSignal) { if (node.update) this._evalSync(node.update, fe); continue; } throw e; }
          if (node.update) this._evalSync(node.update, fe);
        }
        break;
      }
      case 'ForRangeStmt': {
        const range = this._evalSync(node.range, env);
        let iterable;
        if (Array.isArray(range)) iterable = range;
        else if (typeof range === 'string') iterable = range.split('');
        else if (range instanceof Map) iterable = [...range.entries()];
        else if (range instanceof Set) iterable = [...range];
        else throw new RuntimeError('Ekspresi bukan iterable untuk untuk-range', node.line);
        for (const item of iterable) {
          if (this.terminated) break;
          const ienv = new Environment(env, 'untuk_range');
          ienv.define(node.elemName, item, node.elemType);
          try { this._execStmtSync(node.body, ienv); }
          catch (e) { if (e instanceof BreakSignal) break; if (e instanceof ContinueSignal) continue; throw e; }
        }
        break;
      }
      case 'SwitchStmt': {
        const disc = this._evalSync(node.discriminant, env);
        let matched = false;
        for (const c of node.cases) {
          const cv = this._evalSync(c.val, env);
          if (!matched && disc === cv) matched = true;
          if (matched) {
            try {
              const cenv = new Environment(env, 'kasus');
              for (const s of c.stmts) this._execStmtSync(s, cenv);
            } catch (e) { if (e instanceof BreakSignal) break; throw e; }
          }
        }
        if (!matched && node.defaultBody) {
          try {
            const denv = new Environment(env, 'bawaan');
            for (const s of node.defaultBody) this._execStmtSync(s, denv);
          } catch (e) { if (e instanceof BreakSignal) break; throw e; }
        }
        break;
      }
      case 'TryStmt': {
        try {
          this._execStmtSync(node.body, new Environment(env, 'coba'));
        } catch (e) {
          if (e instanceof ReturnSignal || e instanceof BreakSignal || e instanceof ContinueSignal) throw e;
          let caught = false;
          const errVal = e instanceof ThrowSignal ? e.value : (e instanceof RuntimeError ? e.message : String(e.message));
          for (const c of node.catches) {
            if (!c.catchType || true) {
              caught = true;
              const cenv = new Environment(env, 'tangkap');
              if (c.catchName) cenv.define(c.catchName, errVal);
              this._execStmtSync(c.body, cenv);
              break;
            }
          }
          if (!caught && !(e instanceof ThrowSignal)) throw e;
        } finally {
          if (node.finallyBody) this._execStmtSync(node.finallyBody, new Environment(env, 'akhiri'));
        }
        break;
      }
      case 'LabeledStmt': {
        this._labels = this._labels || new Map();
        this._labels.set(node.label, node.body);
        this._execStmtSync(node.body, env);
        break;
      }
      case 'FuncDecl': this._funcDeclSync(node, env); break;
      case 'ClassDecl':  this._registerClass(node, env); break;
      case 'StructDecl': this._registerStruct(node, env); break;
      case 'UnionDecl':  this._registerStruct(node, env); break;
      case 'EnumDecl':   this._registerEnum(node, env); break;
      case 'InterfaceDecl': this._registerInterface(node, env); break;
      case 'TemplateDecl': this._registerTemplate(node, env); break;
      case 'NamespaceDecl': {
        const nsEnv = new Environment(env, node.name, 'namespace');
        this._execBlockSync(node.body, nsEnv);
        const nsObj = {};
        for (const [k, v] of nsEnv.vars) nsObj[k] = v.value;
        env.define(node.name, nsObj);
        break;
      }
      case 'UsingDecl': {
        const val = env.get(node.path.split('::')[0], node.line);
        if (val && typeof val === 'object') for (const k of Object.keys(val)) if (!env.hasLocal(k)) env.define(k, val[k]);
        break;
      }
      case 'Directive': break; // 'muat' butuh fs async; directive lain (definisi macro) gak umum dipakai di jalur sync
      case 'Program': this._execBlockSync(node, env); break;
      default: break; // Node yang bener2 belum ada padanan sync-nya (jarang dipakai di callback)
    }
  }

  _varDeclSync(node, env) {
    let val = node.init ? this._evalSync(node.init, env) : this._defaultVal(node.typeDef);
    if (node.arrayInit) val = node.arrayInit.map(e => this._evalSync(e, env));
    val = this._coerce(val, node.typeDef);
    env.define(node.name, val, node.typeDef, node.isConst);
  }

  _funcDeclSync(node, env) {
    env.define(node.name, { type: 'function', name: node.name, params: node.params, body: node.body, closure: env, returnType: node.returnType });
  }

  _evalSync(node, env) {
    if (!node) return null;
    switch (node.type) {
      case 'Literal': return node.value;
      case 'Ident': return env.get(node.name, node.line);
      case 'Binary': return this._binaryOp(this._evalSync(node.left, env), this._evalSync(node.right, env), node.op, node.line);
      case 'Unary': {
        const r = this._evalSync(node.right, env);
        if (node.op === '-') return -Number(r);
        if (node.op === '!') return !this.toBool(r);
        if (node.op === '~') return ~(Number(r) | 0);
        if (node.op === '+') return +Number(r);
        return r;
      }
      case 'Assign': {
        const val = this._evalSync(node.right, env);
        this._assignSync(node.left, node.op, val, env, node.line);
        return val;
      }
      case 'Call': {
        // obj?.metode(...) -- kalau callee itu FieldAccess optional dan objeknya
        // takAda, short-circuit sebelum sempat coba manggil apapun.
        if (node.callee.type === 'FieldAccess' && node.callee.optional) {
          const obj = this._evalSync(node.callee.object, env);
          if (obj === null || obj === undefined) return null;
        }
        const fn = this._evalSync(node.callee, env);
        const args = this._evalArgsSync(node.args, env);
        return this._callAnySync(fn, args, node.line, node.callee.name || '?');
      }
      case 'FieldAccess': {
        const obj = this._evalSync(node.object, env);
        if (node.optional && (obj === null || obj === undefined)) return null; // ?. -- aman kalau objek takAda
        return this._getField(obj, node.field, node.line);
      }
      case 'Index': {
        const arr = this._evalSync(node.object, env);
        const idx = Number(this._evalSync(node.index, env));
        return this._getIndex(arr, idx, node.line);
      }
      case 'PostInc': { const v = this._evalSync(node.operand, env); this._incDecSync(node.operand, 1, env); return v; }
      case 'PostDec': { const v = this._evalSync(node.operand, env); this._incDecSync(node.operand, -1, env); return v; }
      case 'PreInc':  { return this._incDecSync(node.operand, 1, env); }
      case 'PreDec':  { return this._incDecSync(node.operand, -1, env); }
      case 'Ternary': return this.toBool(this._evalSync(node.cond, env)) ? this._evalSync(node.then, env) : this._evalSync(node.els, env);
      case 'KalauKosong': {
        const l = this._evalSync(node.left, env);
        return (l === null || l === undefined) ? this._evalSync(node.right, env) : l;
      }
      case 'InitList': return node.elements.map(e => this._evalSync(e, env));
      case 'ArrayLiteral': {
        const out = [];
        for (const el of node.elements) {
          if (el.type === 'Spread') {
            const spread = this._evalSync(el.arg, env);
            if (!Array.isArray(spread)) throw new RuntimeError('Cuma bisa sebar (...) isi array', el.line);
            out.push(...spread);
          } else out.push(this._evalSync(el, env));
        }
        return out;
      }
      case 'NewExpr': return this._newExprSync(node, env);
      case 'ThisExpr': return env.get('__this', node.line);
      case 'SuperExpr': return env.get('__super', node.line);
      case 'Lambda': return this._makeLambda(node, env);
      case 'Cast': {
        const val = this._evalSync(node.operand, env);
        return this._coerce(val, node.castType);
      }
      case 'AddressOf': {
        const operand = node.operand;
        if (operand.type === 'Ident') {
          return { __ptr: true, __ref_name: operand.name, __ref_env: env };
        }
        return { __ptr: true, __val: this._evalSync(operand, env) };
      }
      case 'Deref': {
        const ptr = this._evalSync(node.operand, env);
        if (ptr && ptr.__ptr) {
          if (ptr.__ref_name) return ptr.__ref_env.get(ptr.__ref_name, node.line);
          return ptr.__val;
        }
        throw new RuntimeError('Dereferensi pointer null atau tidak valid', node.line);
      }
      case 'Sizeof': {
        if (node.inner && node.inner.baseName) {
          const sizes = { angka: 4, desimal: 8, huruf: 1, iyaGak: 1, angkaKecil: 2, angkaGede: 8, byte: 1, desimalKecil: 4 };
          return sizes[node.inner.baseName] || 8;
        }
        const v = this._evalSync(node.inner, env);
        if (typeof v === 'number') return Number.isInteger(v) ? 4 : 8;
        if (typeof v === 'string') return v.length;
        if (Array.isArray(v)) return v.length;
        return 8;
      }
      case 'Typeid': {
        const v = this._evalSync(node.inner, env);
        return this.global.get('tipe_dari').fn(v);
      }
      case 'PtrField': {
        const ptr = this._evalSync(node.object, env);
        const obj = ptr && ptr.__ptr && ptr.__ref_name ? ptr.__ref_env.get(ptr.__ref_name) : ptr;
        return this._getField(obj, node.field, node.line);
      }
      case 'ScopeAccess': {
        const obj = this._evalSync(node.object, env);
        if (obj && typeof obj === 'object') {
          if (obj.members && obj.members[node.member] !== undefined) return obj.members[node.member];
          if (obj[node.member] !== undefined) return obj[node.member];
        }
        const nsKey = `${node.object.name}::${node.member}`;
        if (env.has(nsKey)) return env.get(nsKey);
        throw new RuntimeError(`'${node.member}' tidak ditemukan dalam '${node.object.name}'`, node.line);
      }
      default: return null;
    }
  }

  // Evaluasi daftar argumen pemanggilan, meratakan elemen ...spread jadi
  // argumen individual (dipakai bareng oleh semua jalur pemanggilan fungsi/
  // method, sync maupun async, biar konsisten satu tempat).
  _evalArgsSync(argNodes, env) {
    const out = [];
    for (const a of argNodes) {
      if (a.type === 'Spread') {
        const spread = this._evalSync(a.arg, env);
        if (!Array.isArray(spread)) throw new RuntimeError('Cuma bisa sebar (...) isi array', a.line);
        out.push(...spread);
      } else out.push(this._evalSync(a, env));
    }
    return out;
  }

  async _evalArgs(argNodes, env) {
    const out = [];
    for (const a of argNodes) {
      if (a.type === 'Spread') {
        const spread = await this._eval(a.arg, env);
        if (!Array.isArray(spread)) throw new RuntimeError('Cuma bisa sebar (...) isi array', a.line);
        out.push(...spread);
      } else out.push(await this._eval(a, env));
    }
    return out;
  }

  _callAnySync(fn, args, line, name) {
    if (!fn) throw new RuntimeError(`Fungsi '${name}' tidak ditemukan`, line);
    if (fn.type === 'native') {
      try { return fn.fn(...args); } catch (e) { if (e instanceof RuntimeError) throw e; throw new RuntimeError(e.message, line); }
    }
    if (fn.type === 'function' || fn.type === 'lambda') return this._callFnSync(fn, args, line, name);
    throw new NotCallableError(name, line);
  }

  _assignSync(target, op, val, env, line) {
    const apply = (cur, v, op) => this._applyAssignOp(cur, v, op, line);
    if (target.type === 'Ident') {
      env.set(target.name, apply(env.get(target.name, line), val, op), line);
    } else if (target.type === 'Index') {
      const arr = this._evalSync(target.object, env);
      const idx = Number(this._evalSync(target.index, env));
      if (!Array.isArray(arr)) throw new RuntimeError('Bukan array', line);
      arr[idx] = apply(arr[idx], val, op);
    } else if (target.type === 'FieldAccess') {
      const obj = this._evalSync(target.object, env);
      if (obj instanceof NusaObject) obj.set(target.field, apply(obj.get(target.field), val, op));
      else if (typeof obj === 'object' && obj !== null) obj[target.field] = apply(obj[target.field], val, op);
    }
  }

  _incDecSync(target, delta, env) {
    if (target.type === 'Ident') {
      const cur = Number(env.get(target.name, target.line));
      env.set(target.name, cur + delta);
      return cur + delta;
    }
    if (target.type === 'Index') {
      const arr = this._evalSync(target.object, env);
      const idx = Number(this._evalSync(target.index, env));
      arr[idx] = Number(arr[idx]) + delta;
      return arr[idx];
    }
    return 0;
  }

  // ═══════════════════════════════════════════════════════════
  // ASYNC EXECUTION — Main execution path
  // ═══════════════════════════════════════════════════════════
  async run(ast, extraEnv) {
    this.terminated  = false;
    this._iterCount  = 0;
    this.callStack   = [{ name: '<program>', line: 0, env: this.global }];

    // Merge extra env
    if (extraEnv) {
      for (const [k, v] of Object.entries(extraEnv)) this.global.define(k, v);
    }

    // First pass: hoist semua FuncDecl dan StructDecl ke global.
    // InterfaceDecl didaftarkan LEBIH DULU dari ClassDecl (loop terpisah),
    // supaya class yang 'punyaSifat InterfaceX' bisa divalidasi dengan benar
    // walau ditulis sebelum interface-nya di source code.
    const tesList = [];
    for (const node of ast.body) {
      if (node.type === 'Directive' && node.name === 'muat') await this._directive(node, this.global);
      if (node.type === 'InterfaceDecl') this._registerInterface(node, this.global);
      if (node.type === 'StructDecl') this._registerStruct(node, this.global);
      if (node.type === 'EnumDecl')  this._registerEnum(node, this.global);
      if (node.type === 'TesDecl') tesList.push(node);
    }
    for (const node of ast.body) {
      if (node.type === 'FuncDecl')  this._hoistFunc(node, this.global);
      if (node.type === 'ClassDecl') this._registerClass(node, this.global);
      if (node.type === 'TemplateDecl') this._registerTemplate(node, this.global);
      if (node.type === 'NamespaceDecl') await this._execNamespace(node, this.global);
    }

    try {
      // Blok 'tes' dikecualikan dari eksekusi program biasa (dijalankan
      // terpisah di bawah, bukan tercampur urutan statement biasa).
      const bodyTanpaTes = { ...ast, body: ast.body.filter(n => n.type !== 'TesDecl') };
      await this._execBlock(bodyTanpaTes, this.global);
    } catch (e) {
      if (e instanceof ReturnSignal) return e.value;
      if (e instanceof ThrowSignal)  throw new RuntimeError('Eksepsi tidak ditangkap: ' + this.stringify(e.value), e.line);
      throw e;
    }

    // Jalankan semua blok 'tes' SETELAH program utama selesai, laporkan
    // hasilnya (berapa lulus/gagal) dengan jelas. Satu tes gagal TIDAK
    // menghentikan tes lain -- semua tetap dijalankan supaya laporan lengkap.
    if (tesList.length > 0) await this._runAllTests(tesList);

    return null;
  }

  _hoistFunc(node, env) {
    env.define(node.name, {
      type: 'function', name: node.name, params: node.params,
      body: node.body, closure: env, returnType: node.returnType,
      isVariadic: node.isVariadic,
    });
  }

  _registerStruct(node, env) {
    env.defineType(node.name, {
      kind: 'struct', name: node.name, fields: node.fields,
      methods: node.methods, base: node.base,
    });
  }

  _registerClass(node, env) {
    // Build method map — mulai dari method milik base class (kalau ada),
    // supaya method yang tidak di-override tetap bisa dipanggil lewat objek turunan.
    const methodMap = new Map();
    const finalMethods = new Set(); // nama method yang ditandai 'akhir' -- gak boleh ditimpa turunannya
    if (node.bases && node.bases.length) {
      for (const baseRef of node.bases) {
        if (baseRef.isInterface) continue; // interface hanya kontrak, tidak punya implementasi
        const baseDef = env.getType(baseRef.baseName) || this.global.getType(baseRef.baseName);
        if (baseDef && baseDef.kind === 'class') {
          if (baseDef.isFinal) {
            throw new RuntimeError(`Kelas '${node.name}' gak boleh nurunin '${baseRef.baseName}' — '${baseRef.baseName}' sudah ditandai 'akhir' (gak boleh diturunin lagi)`, node.line);
          }
          if (baseDef.methods) for (const [mname, mdef] of baseDef.methods) {
            methodMap.set(mname, mdef);
            if (baseDef.finalMethods && baseDef.finalMethods.has(mname)) finalMethods.add(mname);
          }
        }
      }
    }
    for (const m of node.methods) {
      if (finalMethods.has(m.name)) {
        throw new RuntimeError(`Method '${m.name}' di kelas '${node.name}' gak boleh nimpa method induk — method itu ditandai 'akhir' (gak boleh ditimpa)`, node.line);
      }
      methodMap.set(m.name, {
        type: 'function', name: m.name, params: m.params,
        body: m.body, closure: env, returnType: m.returnType,
        access: m.access, isVirtual: m.isVirtual, isStatic: m.isStatic,
        isAbstract: m.isAbstract,
      });
      if (m.isFinal) finalMethods.add(m.name);
    }

    // Cek 'punyaSifat' (implements): kelas WAJIB punya semua method yang
    // dituntut interface-nya, kalau enggak -- gak masuk akal diklaim "punya
    // sifat" itu. Ini yang bikin punyaSifat beneran ngecek sesuatu, bukan
    // cuma dekorasi tanpa arti.
    if (node.bases && node.bases.length) {
      for (const baseRef of node.bases) {
        if (!baseRef.isInterface) continue;
        const ifaceDef = env.getType(baseRef.baseName) || this.global.getType(baseRef.baseName);
        if (!ifaceDef || ifaceDef.kind !== 'interface') continue; // interface belum/gak terdaftar, lewati aja (gak block program)
        const missing = ifaceDef.methods.filter(m => !methodMap.has(m.name));
        if (missing.length) {
          const namaMethod = missing.map(m => m.name).join(', ');
          throw new RuntimeError(`Kelas '${node.name}' ngaku 'punyaSifat ${baseRef.baseName}' tapi belum bikin method: ${namaMethod}`, node.line);
        }
      }
    }

    env.defineType(node.name, {
      kind: 'class', name: node.name, fields: node.fields,
      methods: methodMap, bases: node.bases, isFinal: node.isFinal, finalMethods,
    });
    // Also define constructor as callable
    env.define(node.name, {
      type: 'class_ctor', name: node.name, classDef: env.getType(node.name), closure: env,
    });
  }

  // Interface (antarmuka) cuma daftar kontrak method yang wajib ada -- gak
  // punya implementasi sendiri, jadi cukup didaftarkan sebagai tipe supaya
  // bisa dicek pas ada kelas yang klaim 'punyaSifat' interface ini.
  _registerInterface(node, env) {
    env.defineType(node.name, { kind: 'interface', name: node.name, methods: node.methods });
  }

  _registerEnum(node, env) {
    const members = {};
    let counter = 0;
    for (const m of node.members) {
      const val = m.value ? this._evalSync(m.value, env) : counter++;
      members[m.name] = val;
      env.define(`${node.name}::${m.name}`, val);
      // For non-class enum, also export flat
      if (!node.isClass) env.define(m.name, val);
    }
    env.defineType(node.name, { kind: 'enum', name: node.name, members });
    env.define(node.name, { type: 'enum_obj', name: node.name, members });
  }

  _registerTemplate(node, env) {
    env.defineType(`template::${node.decl.name}`, { kind: 'template', params: node.params, decl: node.decl });
    // NusaKids adalah interpreter dinamis (bukan compiler statis seperti C++ asli),
    // jadi 'cetakan' (template) tidak perlu instansiasi tipe konkret di compile-time —
    // definisi gas/kelas/bentuk di dalamnya langsung didaftarkan sebagai fungsi/tipe
    // normal, dan bisa dipanggil dengan tipe data apapun (mirip generic function di
    // bahasa dinamis lain). Ini membuat 'cetakan' benar-benar bisa dipakai, bukan
    // cuma terdaftar tanpa bisa dipanggil.
    if (node.decl.type === 'FuncDecl') this._hoistFunc(node.decl, env);
    else if (node.decl.type === 'ClassDecl') this._registerClass(node.decl, env);
    else if (node.decl.type === 'StructDecl') this._registerStruct(node.decl, env);
  }

  // Jalankan semua blok 'tes' satu-satu, tiap tes dapat environment sendiri
  // (turunan dari global, jadi tetap bisa akses fungsi/kelas yang udah
  // didefinisikan, tapi variabel di dalam tes gak bocor ke tes lain).
  // Satu tes gagal (pastikan/harusSama gak terpenuhi, atau error lain)
  // TIDAK menghentikan tes berikutnya -- semua dijalankan, hasilnya
  // dilaporkan bareng di akhir.
  async _runAllTests(tesList) {
    let lulus = 0, gagal = 0;
    const hasilGagal = [];
    this.outputFn('\n╔══ 🧪 Menjalankan Tes ══\n');
    for (const node of tesList) {
      const tesEnv = new Environment(this.global, `tes:${node.name}`, 'tes');
      try {
        await this._execBlock(node.body, tesEnv);
        lulus++;
        this.outputFn(`║ ✅ ${node.name}\n`);
      } catch (e) {
        gagal++;
        const pesan = e instanceof TestFailError ? e.message : `Error tak terduga: ${e.message}`;
        hasilGagal.push({ name: node.name, pesan });
        this.outputFn(`║ ❌ ${node.name} — ${pesan}\n`);
      }
    }
    this.outputFn(`╚══ Hasil: ${lulus} lulus, ${gagal} gagal (dari ${tesList.length} tes) ══\n`);
  }

  async _execNamespace(node, env) {
    const nsEnv = new Environment(env, node.name, 'namespace');
    await this._execBlock(node.body, nsEnv);
    // Export namespace as object
    const nsObj = {};
    for (const [k, v] of nsEnv.vars) nsObj[k] = v.value;
    env.define(node.name, nsObj);
  }

  async _execBlock(block, env) {
    const stmts = block.body || block;
    for (const stmt of stmts) {
      if (this.terminated) return;
      await this._execStmt(stmt, env);
    }
  }

  async _execStmt(node, env) {
    if (this.terminated) return;
    this._iterCount++;
    if (this._iterCount > MAX_ITERATIONS) throw new IterationError(node.line);

    // Debug pause
    if (this.debugMode && node.line) {
      const shouldPause = this.stepping || this.breakpoints.has(node.line);
      if (shouldPause) {
        this.stepping = false;
        await this._pause(node.line, env);
      }
    }

    switch (node.type) {
      case 'Program':   await this._execBlock(node, env); break;
      case 'Block':     { const be = new Environment(env, 'blok'); await this._execBlock(node, be); break; }
      case 'EmptyStmt': break;

      case 'FuncDecl':   this._hoistFunc(node, env); break;
      case 'StructDecl': this._registerStruct(node, env); break;
      case 'ClassDecl':  this._registerClass(node, env); break;
      case 'UnionDecl':  this._registerStruct(node, env); break;
      case 'EnumDecl':   this._registerEnum(node, env); break;
      case 'TemplateDecl': this._registerTemplate(node, env); break;
      case 'InterfaceDecl': this._registerInterface(node, env); break;
      case 'NamespaceDecl': await this._execNamespace(node, env); break;
      case 'UsingDecl': {
        const val = env.get(node.path.split('::')[0], node.line);
        // Flatten namespace into current scope
        if (val && typeof val === 'object') {
          for (const k of Object.keys(val)) if (!env.hasLocal(k)) env.define(k, val[k]);
        }
        break;
      }
      case 'Directive': await this._directive(node, env); break;

      case 'VarDecl':      await this._varDecl(node, env); break;
      case 'MultiVarDecl': await this._multiVarDecl(node, env); break;

      case 'IfStmt':       await this._ifStmt(node, env); break;
      case 'WhileStmt':    await this._whileStmt(node, env); break;
      case 'DoWhileStmt':  await this._doWhileStmt(node, env); break;
      case 'ForStmt':      await this._forStmt(node, env); break;
      case 'ForRangeStmt': await this._forRangeStmt(node, env); break;
      case 'SwitchStmt':   await this._switchStmt(node, env); break;

      case 'ReturnStmt': throw new ReturnSignal(node.value ? await this._eval(node.value, env) : null);
      case 'Break':      throw new BreakSignal(node.label);
      case 'Continue':   throw new ContinueSignal(node.label);
      case 'GotoStmt':   throw new GotoSignal(node.label);
      case 'ThrowStmt':  throw new ThrowSignal(node.value ? await this._eval(node.value, env) : null, node.line);
      case 'TryStmt':    await this._tryStmt(node, env); break;
      case 'DeleteStmt': await this._eval(node.target, env); break;

      case 'LabeledStmt': {
        this._labels.set(node.label, node.body);
        await this._execStmt(node.body, env);
        break;
      }

      case 'ExprStmt': await this._eval(node.expr, env); break;

      default:
        throw new RuntimeError(`Statement tidak dikenal: '${node.type}'`, node.line);
    }
  }

  async _directive(node, env) {
    if (node.name === 'definisi') {
      const val = node.macroValue ? await this._eval(node.macroValue, env) : true;
      this._macros.set(node.macroName, val);
      env.define(node.macroName, val);
    } else if (node.name === 'muat') {
      await this._loadModule(node.path, node.line);
    }
  }

  // Memuat & menjalankan hoisting deklarasi top-level dari file .nsk/.nsl lain
  // (dipakai buat bikin & memakai "library" sendiri). Hanya berfungsi di
  // Node.js (butuh akses filesystem); di browser murni, harus digabung saat
  // proses export (lihat export.js) karena JS di browser tidak bisa baca
  // file sembarang dari disk pengguna secara langsung.
  async _loadModule(relPath, line) {
    this._loadedModules = this._loadedModules || new Set();
    const fs = (typeof require === 'function') ? (() => { try { return require('fs'); } catch (e) { return null; } })() : null;
    const path = (typeof require === 'function') ? (() => { try { return require('path'); } catch (e) { return null; } })() : null;
    if (!fs || !path) {
      throw new RuntimeError(`'muat \"${relPath}\"' cuma bisa dipakai kalau NusaKids dijalankan di Node.js. Untuk program yang di-export ke HTML/game, gabungkan file-file .nsk kamu jadi satu dulu lewat export.js`, line);
    }
    const baseDir = this._currentFileDir || '.';
    const fullPath = path.resolve(baseDir, relPath);
    if (this._loadedModules.has(fullPath)) return; // sudah pernah dimuat, jangan dobel (cegah loop muat-memuat)
    this._loadedModules.add(fullPath);

    let src;
    try {
      src = fs.readFileSync(fullPath, 'utf8');
    } catch (e) {
      throw new RuntimeError(`Gagal memuat '${relPath}': file tidak ditemukan (dicari di ${fullPath})`, line);
    }

    const _lexMod = (typeof module !== 'undefined') ? require('./lexer') : window._NK_LEXER;
    const _parseMod = (typeof module !== 'undefined') ? require('./parser') : window._NK_PARSER;
    let ast;
    try {
      const tokens = new _lexMod.Lexer(src).tokenize();
      ast = new _parseMod.Parser(tokens).parse();
    } catch (e) {
      throw new RuntimeError(`Gagal memuat '${relPath}': ${e.message}`, line);
    }

    // Simpan & set direktori "sekarang" supaya muat-di-dalam-muat (modul yang
    // memuat modul lain) tetap resolve path relatif dengan benar.
    const prevDir = this._currentFileDir;
    this._currentFileDir = path.dirname(fullPath);
    try {
      // InterfaceDecl/StructDecl/EnumDecl didaftarkan duluan (pass terpisah)
      // sebelum ClassDecl, sama seperti di run() -- supaya validasi
      // 'punyaSifat' konsisten di semua jalur (file utama maupun modul).
      for (const modNode of ast.body) {
        if (modNode.type === 'InterfaceDecl') this._registerInterface(modNode, this.global);
        else if (modNode.type === 'StructDecl') this._registerStruct(modNode, this.global);
        else if (modNode.type === 'EnumDecl')   this._registerEnum(modNode, this.global);
        else if (modNode.type === 'Directive' && modNode.name === 'muat') await this._directive(modNode, this.global);
      }
      for (const modNode of ast.body) {
        if (modNode.type === 'FuncDecl')     this._hoistFunc(modNode, this.global);
        else if (modNode.type === 'ClassDecl')  this._registerClass(modNode, this.global);
        else if (modNode.type === 'TemplateDecl') this._registerTemplate(modNode, this.global);
        else if (modNode.type === 'NamespaceDecl') await this._execNamespace(modNode, this.global);
        else if (modNode.type === 'VarDecl') await this._varDecl(modNode, this.global); // modul boleh punya variabel/konstanta top-level
      }
    } finally {
      this._currentFileDir = prevDir;
    }
  }

  async _varDecl(node, env) {
    let val = null;
    if (node.ctorArgs) {
      // Constructor call
      const ctor = env.get(node.typeDef.baseName, node.line);
      const args = await Promise.all(node.ctorArgs.map(a => this._eval(a, env)));
      val = await this._callAny(ctor, args, node.line, node.typeDef.baseName);
    } else if (node.arrayInit) {
      val = await Promise.all(node.arrayInit.map(e => e.type === 'InitList' ? Promise.all(e.elements.map(x => this._eval(x, env))) : this._eval(e, env)));
    } else if (node.dims && node.dims.length > 0 && node.dims[0] !== null) {
      const sz = Number(await this._eval(node.dims[0], env));
      val = new Array(sz).fill(null).map(() => this._defaultVal(node.typeDef));
    } else if (node.init) {
      val = await this._eval(node.init, env);
    } else {
      val = this._defaultVal(node.typeDef);
    }
    // Null-safety: kalau tipe BUKAN 'mungkin' (nullable), gak boleh diisi takAda.
    // Dicek SEBELUM _coerce(), karena _coerce() bisa mengubah null jadi nilai
    // default tipe (misal '' buat kata) -- kalau dicek sesudahnya, null-nya
    // udah keburu "hilang" dan pengecekan gak pernah kena.
    if (node.typeDef && !node.typeDef.isNullable && node.typeDef.baseName !== 'apaAja' && val === null) {
      throw new NullError(`'${node.name}' punya tipe '${node.typeDef.baseName}' yang gak boleh kosong (takAda). Kalau emang mau boleh kosong, tulis 'mungkin ${node.typeDef.baseName} ${node.name}' pas deklarasi`, node.line);
    }
    // Auto type inference
    if (node.typeDef && node.typeDef.baseName !== 'apaAja') {
      val = this._coerce(val, node.typeDef);
    }
    env.define(node.name, val, node.typeDef, node.isConst, node.isStatic);
  }

  async _multiVarDecl(node, env) {
    for (const d of node.decls) {
      const val = d.init ? this._coerce(await this._eval(d.init, env), node.typeDef) : this._defaultVal(node.typeDef);
      env.define(d.name, val, node.typeDef, node.isConst);
    }
  }

  async _ifStmt(node, env) {
    let init_env = env;
    if (node.init) { init_env = new Environment(env, 'jika_init'); await this._execStmt(node.init, init_env); }
    if (this.toBool(await this._eval(node.cond, init_env))) {
      await this._execStmt(node.then, init_env);
    } else {
      let handled = false;
      for (const ei of (node.elseIfs || [])) {
        if (this.toBool(await this._eval(ei.cond, init_env))) {
          await this._execStmt(ei.body, init_env);
          handled = true; break;
        }
      }
      if (!handled && node.els) await this._execStmt(node.els, init_env);
    }
  }

  async _whileStmt(node, env) {
    while (!this.terminated && this.toBool(await this._eval(node.cond, env))) {
      try {
        await this._execStmt(node.body, new Environment(env, 'selama'));
      } catch (e) {
        if (e instanceof BreakSignal)    break;
        if (e instanceof ContinueSignal) continue;
        throw e;
      }
    }
  }

  async _doWhileStmt(node, env) {
    do {
      try {
        await this._execStmt(node.body, new Environment(env, 'lakukan'));
      } catch (e) {
        if (e instanceof BreakSignal)    break;
        if (e instanceof ContinueSignal) continue;
        throw e;
      }
    } while (!this.terminated && this.toBool(await this._eval(node.cond, env)));
  }

  async _forStmt(node, env) {
    const fenv = new Environment(env, 'untuk');
    if (node.init) await this._execStmt(node.init, fenv);
    while (!this.terminated) {
      if (node.cond && !this.toBool(await this._eval(node.cond, fenv))) break;
      try {
        await this._execStmt(node.body, new Environment(fenv, 'untuk_blok'));
      } catch (e) {
        if (e instanceof BreakSignal) break;
        if (e instanceof ContinueSignal) { if (node.update) await this._eval(node.update, fenv); continue; }
        throw e;
      }
      if (node.update) await this._eval(node.update, fenv);
    }
  }

  async _forRangeStmt(node, env) {
    const range = await this._eval(node.range, env);
    let iterable;
    if (Array.isArray(range)) iterable = range;
    else if (typeof range === 'string') iterable = range.split('');
    else if (range instanceof Map) iterable = [...range.entries()];
    else if (range instanceof Set) iterable = [...range];
    else throw new RuntimeError('Ekspresi bukan iterable untuk untuk-range', node.line);

    for (const item of iterable) {
      if (this.terminated) break;
      const ienv = new Environment(env, 'untuk_range');
      ienv.define(node.elemName, item, node.elemType);
      try { await this._execStmt(node.body, ienv); }
      catch (e) {
        if (e instanceof BreakSignal) break;
        if (e instanceof ContinueSignal) continue;
        throw e;
      }
    }
  }

  async _switchStmt(node, env) {
    const disc = await this._eval(node.discriminant, env);
    let matched = false;

    for (const c of node.cases) {
      const cv = await this._eval(c.val, env);
      if (!matched && disc === cv) matched = true;
      if (matched) {
        try {
          const cenv = new Environment(env, 'kasus');
          for (const s of c.stmts) await this._execStmt(s, cenv);
        } catch (e) {
          if (e instanceof BreakSignal) return;
          throw e;
        }
      }
    }

    if (!matched && node.defaultBody) {
      try {
        const denv = new Environment(env, 'bawaan');
        for (const s of node.defaultBody) await this._execStmt(s, denv);
      } catch (e) {
        if (e instanceof BreakSignal) return;
        throw e;
      }
    }
  }

  async _tryStmt(node, env) {
    try {
      await this._execStmt(node.body, new Environment(env, 'coba'));
    } catch (e) {
      if (e instanceof ReturnSignal || e instanceof BreakSignal || e instanceof ContinueSignal) throw e;
      let caught = false;
      const errVal = e instanceof ThrowSignal ? e.value : (e instanceof RuntimeError ? e.message : String(e.message));
      for (const c of node.catches) {
        if (!c.catchType || true) { // catch-all for now
          caught = true;
          const cenv = new Environment(env, 'tangkap');
          if (c.catchName) cenv.define(c.catchName, errVal);
          await this._execStmt(c.body, cenv);
          break;
        }
      }
      if (!caught && !(e instanceof ThrowSignal)) throw e;
    } finally {
      if (node.finallyBody) await this._execStmt(node.finallyBody, new Environment(env, 'akhiri'));
    }
  }

  // ─── Evaluator ───
  async _eval(node, env) {
    if (!node) return null;

    switch (node.type) {
      case 'Literal':   return node.value;
      case 'Ident':     return this._resolveIdent(node, env);
      case 'InitList':  return await Promise.all(node.elements.map(e => this._eval(e, env)));
      case 'ArrayLiteral': {
        const out = [];
        for (const el of node.elements) {
          if (el.type === 'Spread') {
            const spread = await this._eval(el.arg, env);
            if (!Array.isArray(spread)) throw new RuntimeError('Cuma bisa sebar (...) isi array', el.line);
            out.push(...spread);
          } else out.push(await this._eval(el, env));
        }
        return out;
      }

      case 'Assign': {
        const val = await this._eval(node.right, env);
        await this._assign(node.left, node.op, val, env, node.line);
        return val;
      }

      case 'Binary': {
        // Short-circuit for && and ||
        if (node.op === '&&') {
          const l = await this._eval(node.left, env);
          return this.toBool(l) ? await this._eval(node.right, env) : l;
        }
        if (node.op === '||') {
          const l = await this._eval(node.left, env);
          return this.toBool(l) ? l : await this._eval(node.right, env);
        }
        const l = await this._eval(node.left, env);
        const r = await this._eval(node.right, env);
        // Operator overload: kalau operand kiri struct/objek yang punya method
        // 'operator<simbol>' (misal operator+), pakai itu alih-alih perilaku
        // numerik bawaan.
        const overload = this._findOperatorOverload(l, node.op);
        if (overload) return await this._callAny(overload, [r], node.line, overload.name);
        return this._binaryOp(l, r, node.op, node.line);
      }

      case 'Unary': {
        const r = await this._eval(node.right, env);
        switch (node.op) {
          case '-': return -Number(r);
          case '!': return !this.toBool(r);
          case '~': return ~(Number(r) | 0);
          case '+': return +Number(r);
        }
        break;
      }

      case 'Ternary':
        return this.toBool(await this._eval(node.cond, env))
          ? await this._eval(node.then, env)
          : await this._eval(node.els, env);

      case 'KalauKosong': {
        const l = await this._eval(node.left, env);
        return (l === null || l === undefined) ? await this._eval(node.right, env) : l;
      }

      case 'Cast': {
        const val = await this._eval(node.operand, env);
        return this._coerce(val, node.castType);
      }

      case 'AddressOf': {
        const operand = node.operand;
        if (operand.type === 'Ident') {
          return { __ptr: true, __ref_name: operand.name, __ref_env: env };
        }
        return { __ptr: true, __val: await this._eval(operand, env) };
      }

      case 'Deref': {
        const ptr = await this._eval(node.operand, env);
        if (ptr && ptr.__ptr) {
          if (ptr.__ref_name) return ptr.__ref_env.get(ptr.__ref_name, node.line);
          return ptr.__val;
        }
        throw new RuntimeError('Dereferensi pointer null atau tidak valid', node.line);
      }

      case 'Sizeof': {
        if (node.inner && node.inner.baseName) {
          const sizes = { angka: 4, desimal: 8, huruf: 1, iyaGak: 1, angkaKecil: 2, angkaGede: 8, byte: 1, desimalKecil: 4 };
          return sizes[node.inner.baseName] || 8;
        }
        const v = await this._eval(node.inner, env);
        if (typeof v === 'number') return Number.isInteger(v) ? 4 : 8;
        if (typeof v === 'string') return v.length;
        if (Array.isArray(v)) return v.length;
        return 8;
      }

      case 'Typeid': {
        const v = await this._eval(node.inner, env);
        return this.global.get('tipe_dari').fn(v);
      }

      case 'PreInc':   return await this._incDecAsync(node.operand, 1, env, node.line);
      case 'PreDec':   return await this._incDecAsync(node.operand, -1, env, node.line);
      case 'PostInc':  { const old = await this._eval(node.operand, env); await this._incDecAsync(node.operand, 1, env, node.line); return old; }
      case 'PostDec':  { const old = await this._eval(node.operand, env); await this._incDecAsync(node.operand, -1, env, node.line); return old; }

      case 'Call': {
        const callee = node.callee;
        let fn;
        // Method call
        if (callee.type === 'FieldAccess') {
          const obj = await this._eval(callee.object, env);
          if (callee.optional && (obj === null || obj === undefined)) return null; // obj?.metode() -- aman kalau obj takAda
          fn = this._getField(obj, callee.field, node.line);
          const args = await this._evalArgs(node.args, env);
          if (!fn) throw new RuntimeError(`Metode '${callee.field}' tidak ditemukan`, node.line);
          // Bind this
          if (fn && fn.type === 'function') fn = { ...fn, thisVal: obj };
          return await this._callAny(fn, args, node.line, callee.field);
        }
        fn = await this._eval(callee, env);
        const args = await this._evalArgs(node.args, env);
        const name = callee.name || callee.field || '?';
        return await this._callAny(fn, args, node.line, name);
      }

      case 'FieldAccess': {
        const obj = await this._eval(node.object, env);
        if (node.optional && (obj === null || obj === undefined)) return null; // ?. -- aman kalau objek takAda
        return this._getField(obj, node.field, node.line);
      }

      case 'PtrField': {
        const ptr = await this._eval(node.object, env);
        const obj = ptr && ptr.__ptr && ptr.__ref_name ? ptr.__ref_env.get(ptr.__ref_name) : ptr;
        return this._getField(obj, node.field, node.line);
      }

      case 'Index': {
        const obj = await this._eval(node.object, env);
        const idx = await this._eval(node.index, env);
        if (obj instanceof Map) return obj.get(idx) ?? null;
        const i = Number(idx);
        return this._getIndex(obj, i, node.line);
      }

      case 'ScopeAccess': {
        // enum::member or namespace::func
        const obj = await this._eval(node.object, env);
        if (obj && typeof obj === 'object') {
          if (obj.members && obj.members[node.member] !== undefined) return obj.members[node.member];
          if (obj[node.member] !== undefined) return obj[node.member];
        }
        // Try namespace
        const nsKey = `${node.object.name}::${node.member}`;
        if (env.has(nsKey)) return env.get(nsKey);
        throw new RuntimeError(`'${node.member}' tidak ditemukan dalam '${node.object.name}'`, node.line);
      }

      case 'NewExpr':   return await this._newExpr(node, env);
      case 'Lambda':    return this._makeLambda(node, env);
      case 'ThisExpr':  return env.get('__this', node.line);
      case 'SuperExpr': return env.get('__super', node.line);

      default:
        throw new RuntimeError(`Ekspresi tidak dikenal: '${node.type}'`, node ? node.line : 0);
    }
  }

  _resolveIdent(node, env) {
    try { return env.get(node.name, node.line); }
    catch (e) { throw new UndefinedError(node.name, node.line); }
  }

  _getField(obj, field, line) {
    if (obj === null || obj === undefined) throw new NullError(`Akses field '${field}' pada nilai null/kosong`, line);
    if (obj instanceof NusaObject) {
      const v = obj.get(field);
      if (v === undefined) throw new RuntimeError(`Field '${field}' tidak ada dalam objek '${obj.__class}'`, line);
      return v;
    }
    if (Array.isArray(obj)) {
      // Array methods
      if (field === 'pjg' || field === 'panjang') return obj.length;
      if (field === 'kosong') return obj.length === 0;
      return undefined;
    }
    if (typeof obj === 'string') {
      if (field === 'pjg' || field === 'panjang') return obj.length;
      if (field === 'kosong') return obj.length === 0;
    }
    if (obj instanceof Map) {
      if (field === 'ukuran') return obj.size;
      return undefined;
    }
    if (typeof obj === 'object' && obj !== null) {
      if (field in obj) return obj[field];
      // Method pada struct (bentuk): objek struct itu sendiri cuma nyimpen data
      // (bukan NusaObject), jadi method-nya dicari dari typeDef yang terdaftar
      // saat 'bentuk' didefinisikan, lalu di-bind ke objek ini sebagai 'diri'.
      if (obj.__struct) {
        const typeDef = this.global.getType(obj.__struct);
        if (typeDef && typeDef.methods) {
          const m = Array.isArray(typeDef.methods)
            ? typeDef.methods.find(mm => mm.name === field)
            : typeDef.methods.get(field);
          if (m) {
            return {
              type: 'function', name: m.name, params: m.params, body: m.body,
              closure: this.global, returnType: m.returnType, thisVal: obj,
            };
          }
        }
        throw new RuntimeError(`Field '${field}' tidak ada dalam '${obj.__struct}'`, line);
      }
      throw new RuntimeError(`Field '${field}' tidak ada`, line);
    }
    throw new RuntimeError(`Tidak bisa akses field '${field}' pada tipe ${typeof obj}`, line);
  }

  _getIndex(obj, idx, line) {
    if (typeof obj === 'string') {
      if (idx < 0 || idx >= obj.length) throw new RangeError_(`Indeks string ${idx} di luar batas (panjang: ${obj.length})`, line);
      return obj[idx];
    }
    if (!Array.isArray(obj)) throw new RuntimeError(`Pengindeksan pada tipe bukan array: ${typeof obj}`, line);
    const len = obj.length;
    const i = idx < 0 ? len + idx : idx; // negative indexing
    if (i < 0 || i >= len) throw new RangeError_(`Indeks ${idx} di luar batas array (panjang: ${len})`, line);
    return obj[i];
  }

  async _assign(target, op, val, env, line) {
    const apply = (cur, v) => this._applyAssignOp(cur, v, op, line);

    if (target.type === 'Ident') {
      const cur = env.get(target.name, line);
      env.set(target.name, apply(cur, val), line);
    } else if (target.type === 'Index') {
      const obj = await this._eval(target.object, env);
      const idx = await this._eval(target.index, env);
      if (obj instanceof Map) { obj.set(idx, apply(obj.get(idx), val)); return; }
      const i = Number(idx);
      if (!Array.isArray(obj)) throw new RuntimeError('Pengindeksan pada bukan array/peta', line);
      const li = i < 0 ? obj.length + i : i;
      obj[li] = apply(obj[li], val);
    } else if (target.type === 'FieldAccess') {
      const obj = await this._eval(target.object, env);
      if (obj instanceof NusaObject) { obj.set(target.field, apply(obj.get(target.field), val)); }
      else if (typeof obj === 'object' && obj !== null) { obj[target.field] = apply(obj[target.field], val); }
      else throw new RuntimeError(`Tidak bisa menetapkan field '${target.field}'`, line);
    } else if (target.type === 'PtrField') {
      const ptr = await this._eval(target.object, env);
      const obj = ptr && ptr.__ptr && ptr.__ref_name ? ptr.__ref_env.get(ptr.__ref_name) : ptr;
      if (typeof obj === 'object' && obj !== null) obj[target.field] = apply(obj[target.field], val);
    } else if (target.type === 'Deref') {
      const ptr = await this._eval(target.operand, env);
      if (ptr && ptr.__ptr && ptr.__ref_name) ptr.__ref_env.set(ptr.__ref_name, apply(ptr.__ref_env.get(ptr.__ref_name), val));
    } else {
      throw new RuntimeError('Target penugasan tidak valid', line);
    }
  }

  _applyAssignOp(cur, val, op, line) {
    switch (op) {
      case '=':    return val;
      case '+=':   return (typeof cur === 'string' || typeof val === 'string') ? this.stringify(cur) + this.stringify(val) : Number(cur) + Number(val);
      case '-=':   return Number(cur) - Number(val);
      case '*=':   return Number(cur) * Number(val);
      case '/=':   { if (Number(val) === 0) throw new DivisionError(line); return Number(cur) / Number(val); }
      case '%=':   { if (Number(val) === 0) throw new DivisionError(line); return Number(cur) % Number(val); }
      case '&=':   return (Number(cur) | 0) & (Number(val) | 0);
      case '|=':   return (Number(cur) | 0) | (Number(val) | 0);
      case '^=':   return (Number(cur) | 0) ^ (Number(val) | 0);
      case '<<=':  return (Number(cur) | 0) << (Number(val) | 0);
      case '>>=':  return (Number(cur) | 0) >> (Number(val) | 0);
      case '>>>=': return (Number(cur) >>> 0) >>> (Number(val) | 0);
      default:     return val;
    }
  }

  async _incDecAsync(target, delta, env, line) {
    if (target.type === 'Ident') {
      const cur = Number(env.get(target.name, line));
      const nv = cur + delta;
      env.set(target.name, nv, line);
      return nv;
    }
    if (target.type === 'Index') {
      const arr = await this._eval(target.object, env);
      const idx = Number(await this._eval(target.index, env));
      arr[idx] = Number(arr[idx]) + delta;
      return arr[idx];
    }
    if (target.type === 'FieldAccess') {
      const obj = await this._eval(target.object, env);
      if (obj instanceof NusaObject) {
        const cur = Number(obj.get(target.field));
        obj.set(target.field, cur + delta);
        return cur + delta;
      }
      if (typeof obj === 'object' && obj) {
        obj[target.field] = Number(obj[target.field]) + delta;
        return obj[target.field];
      }
    }
    throw new RuntimeError('Target ++ / -- tidak valid', line);
  }

  async _callAny(fn, args, line, name) {
    if (fn === null || fn === undefined) throw new RuntimeError(`'${name}' bernilai null, tidak bisa dipanggil`, line);
    if (fn.type === 'native') {
      try { return fn.fn(...args); }
      catch (e) {
        if (e instanceof RuntimeError || e instanceof ThrowSignal) throw e;
        throw new RuntimeError(e.message, line);
      }
    }
    if (fn.type === 'function' || fn.type === 'lambda') return await this._callFn(fn, args, line, name);
    if (fn.type === 'class_ctor') return await this._constructClass(fn.classDef, args, line);
    throw new NotCallableError(name || String(fn), line);
  }

  async _callFn(fn, args, line, name) {
    if (this.callStack.length >= MAX_CALL_DEPTH) throw new StackOverflowError(line);

    const fenv = new Environment(fn.closure, fn.name || name, 'function');

    // Bind params
    const params = fn.params || [];
    for (let i = 0; i < params.length; i++) {
      const p = params[i];
      let val;
      if (i < args.length) val = args[i];
      else if (p.defaultVal !== null && p.defaultVal !== undefined) val = this._evalSync(p.defaultVal, fn.closure);
      else val = this._defaultVal(p.typeDef);
      // Array params passed by reference
      if (p.dims && p.dims.length > 0) val = args[i]; // pass array by ref
      else val = this._coerce(val, p.typeDef);
      fenv.define(p.name, val, p.typeDef);
    }

    // Variadic args -- disimpan sebagai variabel 'args' yang bisa diakses
    // langsung dari dalam body fungsi (mirip gaya JavaScript/Python), supaya
    // argumen tambahan di luar parameter tetap ('...') beneran kepake, bukan
    // cuma bisa dideklarasikan doang.
    if (fn.isVariadic) {
      fenv.define('args', args.length > params.length ? args.slice(params.length) : []);
    }

    // this binding
    if (fn.thisVal !== undefined) fenv.define('__this', fn.thisVal);

    this.callStack.push({ name: fn.name || name, line, env: fenv });
    let result = null;
    try {
      if (fn.body) await this._execBlock(fn.body, fenv);
    } catch (e) {
      this.callStack.pop();
      if (e instanceof ReturnSignal) return e.value;
      throw e;
    }
    this.callStack.pop();
    return result;
  }

  async _constructClass(classDef, args, line) {
    const obj = new NusaObject(classDef.name, {}, classDef.methods, this.global);

    // Kumpulkan field dari base class dulu (kalau ada pewarisan), baru field milik sendiri
    const allFields = [];
    if (classDef.bases && classDef.bases.length) {
      for (const baseRef of classDef.bases) {
        if (baseRef.isInterface) continue;
        const baseDef = this.global.getType(baseRef.baseName);
        if (baseDef && baseDef.kind === 'class' && baseDef.fields) allFields.push(...baseDef.fields);
      }
    }
    allFields.push(...(classDef.fields || []));

    // Initialize fields
    for (const f of allFields) {
      for (const d of f.names) {
        const val = d.init ? await this._eval(d.init, this.global) : this._defaultVal(f.typeDef);
        obj.set(d.name, val);
      }
    }

    // Bind methods
    for (const [mname, mfn] of (classDef.methods || new Map())) {
      obj.__methods.set(mname, { ...mfn, thisVal: obj });
    }

    // Call constructor (fn with same name as class)
    const ctor = classDef.methods && classDef.methods.get(classDef.name);
    if (ctor) await this._callFn({ ...ctor, thisVal: obj }, args, line, classDef.name);

    return obj;
  }

  // Versi sync dari _constructClass -- dipakai saat 'bikin Kelas(...)' terjadi
  // di dalam jalur eksekusi sinkron (callback native seperti setiap_frame,
  // map/filter/sort/urutkan_berdasarkan). Sebelumnya TIDAK ADA sama sekali,
  // sehingga _evalSync jatuh ke 'default: return null' untuk NewExpr -- bug
  // serius: SETIAP objek yang dibuat lewat 'bikin' di dalam game loop selalu
  // jadi null seketika, walau baru saja berhasil ditambahkan ke array.
  _constructClassSync(classDef, args, line) {
    const obj = new NusaObject(classDef.name, {}, classDef.methods, this.global);
    const allFields = [];
    if (classDef.bases && classDef.bases.length) {
      for (const baseRef of classDef.bases) {
        if (baseRef.isInterface) continue;
        const baseDef = this.global.getType(baseRef.baseName);
        if (baseDef && baseDef.kind === 'class' && baseDef.fields) allFields.push(...baseDef.fields);
      }
    }
    allFields.push(...(classDef.fields || []));
    for (const f of allFields) {
      for (const d of f.names) {
        const val = d.init ? this._evalSync(d.init, this.global) : this._defaultVal(f.typeDef);
        obj.set(d.name, val);
      }
    }
    for (const [mname, mfn] of (classDef.methods || new Map())) {
      obj.__methods.set(mname, { ...mfn, thisVal: obj });
    }
    const ctor = classDef.methods && classDef.methods.get(classDef.name);
    if (ctor) this._callFnSync({ ...ctor, thisVal: obj }, args, line, classDef.name);
    return obj;
  }

  // Versi sync dari _newExpr -- lihat catatan di _constructClassSync di atas.
  _newExprSync(node, env) {
    const td = node.newType;
    const typeDef = env.getType(td.baseName) || this.global.getType(td.baseName);
    const args = this._evalArgsSync(node.args, env);

    if (typeDef) {
      if (typeDef.kind === 'struct') {
        const obj = { __struct: typeDef.name };
        let argIdx = 0;
        for (let i = 0; i < typeDef.fields.length; i++) {
          const f = typeDef.fields[i];
          for (let j = 0; j < f.names.length; j++) {
            const d = f.names[j];
            let val;
            if (args[argIdx] !== undefined) val = args[argIdx];
            else if (d.init) val = this._evalSync(d.init, env);
            else val = this._defaultVal(f.typeDef);
            obj[d.name] = val;
            argIdx++;
          }
        }
        return obj;
      }
      if (typeDef.kind === 'class') return this._constructClassSync(typeDef, args, node.line);
    }

    switch (td.baseName) {
      case 'arr': case 'Array': return args.length ? new Array(Number(args[0])).fill(0) : [];
      case 'peta': case 'Map': { const m = new Map(); if (args[0] && Array.isArray(args[0])) args[0].forEach(([k,v]) => m.set(k,v)); return m; }
      case 'himpunan': case 'Set': return new Set(args[0] || []);
    }

    throw new RuntimeError(`Tipe '${td.baseName}' tidak ditemukan untuk 'baru'`, node.line);
  }

  async _newExpr(node, env) {
    // Check if it's a struct
    const td = node.newType;
    const typeDef = env.getType(td.baseName) || this.global.getType(td.baseName);
    const args = await this._evalArgs(node.args, env);

    if (typeDef) {
      if (typeDef.kind === 'struct') {
        const obj = { __struct: typeDef.name };
        let argIdx = 0;
        for (let i = 0; i < typeDef.fields.length; i++) {
          const f = typeDef.fields[i];
          for (let j = 0; j < f.names.length; j++) {
            const d = f.names[j];
            let val;
            if (args[argIdx] !== undefined) val = args[argIdx];
            else if (d.init) val = await this._eval(d.init, env);
            else val = this._defaultVal(f.typeDef);
            obj[d.name] = val;
            argIdx++;
          }
        }
        return obj;
      }
      if (typeDef.kind === 'class') return await this._constructClass(typeDef, args, node.line);
    }

    // Built-in constructors
    switch (td.baseName) {
      case 'arr': case 'Array': return args.length ? new Array(Number(args[0])).fill(0) : [];
      case 'peta': case 'Map': { const m = new Map(); if (args[0] && Array.isArray(args[0])) args[0].forEach(([k,v]) => m.set(k,v)); return m; }
      case 'himpunan': case 'Set': return new Set(args[0] || []);
    }

    throw new RuntimeError(`Tipe '${td.baseName}' tidak ditemukan untuk 'baru'`, node.line);
  }

  _makeLambda(node, env) {
    // Capture variables
    const captured = new Environment(env, 'lambda_capture', 'function');
    for (const c of node.captures) {
      if (c.all) {
        // Capture all
        const allVars = env.allVars(true);
        for (const [k, v] of Object.entries(allVars)) captured.define(k, v.value, v.typeDef);
      } else if (c.name) {
        try { captured.define(c.name, env.get(c.name)); } catch (e) {}
      }
    }
    return {
      type: 'lambda', name: '<lambda>', params: node.params,
      body: node.body, closure: captured, returnType: node.returnType,
    };
  }

  // ─── Operators ───
  // Cari method 'operator<simbol>' pada objek struct/kelas, kalau ada.
  // Dipakai buat operator overload: a + b jadi a.operator+(b) kalau 'a'
  // adalah struct/objek yang mendefinisikan operator itu.
  _findOperatorOverload(obj, op) {
    if (obj === null || obj === undefined || typeof obj !== 'object') return null;
    const opName = 'operator' + op;
    if (obj instanceof NusaObject) {
      const m = obj.__methods && obj.__methods.get(opName);
      return m || null;
    }
    if (obj.__struct) {
      const typeDef = this.global.getType(obj.__struct);
      if (!typeDef || !typeDef.methods) return null;
      const m = Array.isArray(typeDef.methods)
        ? typeDef.methods.find(mm => mm.name === opName)
        : typeDef.methods.get(opName);
      if (!m) return null;
      return { type: 'function', name: m.name, params: m.params, body: m.body, closure: this.global, returnType: m.returnType, thisVal: obj };
    }
    return null;
  }

  _binaryOp(l, r, op, line) {
    switch (op) {
      case '+':
        if (typeof l === 'string' || typeof r === 'string') return this.stringify(l) + this.stringify(r);
        if (Array.isArray(l) && Array.isArray(r)) return [...l, ...r];
        return Number(l) + Number(r);
      case '-':  return Number(l) - Number(r);
      case '*':
        if (typeof l === 'string' && typeof r === 'number') return l.repeat(Math.max(0, r));
        return Number(l) * Number(r);
      case '**': return Math.pow(Number(l), Number(r));
      case '/':  if (Number(r) === 0) throw new DivisionError(line); return Number(l) / Number(r);
      case '%':  if (Number(r) === 0) throw new DivisionError(line); return ((Number(l) % Number(r)) + Number(r)) % Number(r);
      case '==': return l === r;
      case '!=': return l !== r;
      case '<':  return Number(l) < Number(r);
      case '>':  return Number(l) > Number(r);
      case '<=': return Number(l) <= Number(r);
      case '>=': return Number(l) >= Number(r);
      case '&&': return this.toBool(l) && this.toBool(r);
      case '||': return this.toBool(l) || this.toBool(r);
      case '&':  return (Number(l) | 0) & (Number(r) | 0);
      case '|':  return (Number(l) | 0) | (Number(r) | 0);
      case '^':  return (Number(l) | 0) ^ (Number(r) | 0);
      case '<<': return (Number(l) | 0) << (Number(r) | 0);
      case '>>': return (Number(l) | 0) >> (Number(r) | 0);
      case '>>>':return (Number(l) >>> 0) >>> (Number(r) | 0);
      default:   throw new RuntimeError(`Operator tidak dikenal: '${op}'`, line);
    }
  }

  // ─── Type helpers ───
  _defaultVal(typeDef) {
    if (!typeDef) return null;
    const n = typeDef.baseName || typeDef;
    if (typeDef.arrayDims && typeDef.arrayDims.length > 0) return [];
    switch (n) {
      case 'angka': case 'angkaKecil': case 'byte': case 'angkaPos': case 'angkaGede': return 0;
      case 'desimal': case 'desimalKecil': return 0.0;
      case 'kata': return '';
      case 'huruf':  return '\0';
      case 'iyaGak': return false;
      case 'kosong': return null;
      default: return null;
    }
  }

  _coerce(val, typeDef) {
    if (!typeDef) return val;
    if (typeDef.pointers > 0 || typeDef.isRef) return val;
    // Null-safety: kalau nilainya takAda (null) dan tipenya 'mungkin' (nullable),
    // JANGAN dipaksa jadi default value tipe (misal '' buat kata) -- biarkan
    // tetap null apa adanya, supaya perbandingan == takAda tetap benar dan
    // kalauKosong bisa mendeteksinya.
    if (val === null && typeDef.isNullable) return null;
    if (Array.isArray(val)) return val.map(v => this._coerce(v, typeDef));
    switch (typeDef.baseName) {
      case 'angka':      return typeof val === 'boolean' ? (val ? 1 : 0) : Math.trunc(Number(val)) | 0;
      case 'angkaKecil': return ((Math.trunc(Number(val)) & 0xFFFF) << 16) >> 16;
      case 'byte':       return Math.trunc(Number(val)) & 0xFF;
      case 'angkaPos':   return Number(val) >>> 0;
      case 'angkaGede':  return Math.trunc(Number(val));
      case 'desimal':    return Number(val);
      case 'desimalKecil': return Math.fround(Number(val));
      case 'kata':       return this.stringify(val);
      case 'huruf':      return typeof val === 'string' ? (val[0] || '\0') : String.fromCharCode(Number(val) & 0xFF);
      case 'iyaGak':     return this.toBool(val);
      case 'apaAja':     return val; // auto — no coercion
      default:           return val;
    }
  }

  toBool(v) {
    if (v === null || v === undefined) return false;
    if (typeof v === 'boolean') return v;
    if (typeof v === 'number') return v !== 0 && !isNaN(v);
    if (typeof v === 'string') return v.length > 0;
    if (Array.isArray(v)) return true;
    if (v instanceof Map || v instanceof Set) return v.size > 0;
    return true;
  }

  stringify(v) {
    if (v === null || v === undefined) return 'kosong';
    if (typeof v === 'boolean') return v ? 'bener' : 'salah';
    if (v instanceof NusaObject) {
      const fields = [];
      for (const [k, val] of v.__fields) fields.push(`${k}: ${this.stringify(val)}`);
      return `${v.__class}{${fields.join(', ')}}`;
    }
    if (Array.isArray(v)) return '[' + v.map(x => this.stringify(x)).join(', ') + ']';
    if (v instanceof Map) {
      const entries = [];
      for (const [k, val] of v) entries.push(`${this.stringify(k)}: ${this.stringify(val)}`);
      return `peta{${entries.join(', ')}}`;
    }
    if (v instanceof Set) return `himpunan{${[...v].map(x => this.stringify(x)).join(', ')}}`;
    if (typeof v === 'object' && v.__struct) {
      const fields = Object.entries(v).filter(([k]) => k !== '__struct').map(([k, val]) => `${k}: ${this.stringify(val)}`);
      return `${v.__struct}{${fields.join(', ')}}`;
    }
    if (typeof v === 'object' && v.type === 'function') return `<fn ${v.name}>`;
    if (typeof v === 'object' && v.type === 'native') return `<bawaan ${v.name}>`;
    return String(v);
  }

  inspect(v) {
    if (v === null) return 'kosong';
    if (typeof v === 'string') return `"${v}"`;
    if (typeof v === 'object' && v.type === 'function') return `<fn ${v.name}(${(v.params||[]).map(p=>p.name).join(',')})>`;
    return this.stringify(v);
  }

  // ─── Debugger ───
  async _pause(line, env) {
    this.paused = true;
    if (this.onPause) await this.onPause(line, env, this.callStack);
    await new Promise(res => { this.stepResolve = res; });
    this.paused = false;
  }

  resume()   { if (this.stepResolve) { this.stepResolve(); this.stepResolve = null; } }
  step()     { this.stepping = true; this.resume(); }
  terminate(){ this.terminated = true; this.resume(); }
}

if (typeof module !== 'undefined') {
  module.exports = { NusaInterpreter, NusaObject };
} else {
  window._NK_INTERP = { NusaInterpreter, NusaObject };
}
