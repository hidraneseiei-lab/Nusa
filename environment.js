/**
 * NusaLang v2 — Environment (Scope Chain)
 * Mengelola variabel, tipe, fungsi, dan namespace dalam scope
 */

'use strict';

const _err = (typeof module !== 'undefined') ? require('./errors') : window._NK_ERRORS;
const { UndefinedError, ConstError, RuntimeError } = _err;

class EnvEntry {
  constructor(value, typeDef, isConst, isStatic) {
    this.value    = value;
    this.typeDef  = typeDef  || null;
    this.isConst  = isConst  || false;
    this.isStatic = isStatic || false;
    this.refCount = 0; // for GC simulation
  }
}

class Environment {
  constructor(parent = null, name = 'blok', kind = 'block') {
    this.parent   = parent;
    this.name     = name;
    this.kind     = kind; // 'global', 'function', 'block', 'class', 'namespace'
    this.vars     = new Map(); // name -> EnvEntry
    this.types    = new Map(); // user-defined types: struct, class, enum, typedef
    this.labels   = new Map(); // goto labels
    this.children = [];
    if (parent) parent.children.push(this);
  }

  // ─── Variable Operations ───
  define(name, value, typeDef = null, isConst = false, isStatic = false, line = 0) {
    if (this.vars.has(name)) {
      // Allow redefinition in different scope contexts gracefully
    }
    this.vars.set(name, new EnvEntry(value, typeDef, isConst, isStatic));
  }

  get(name, line = 0) {
    let env = this;
    while (env) {
      if (env.vars.has(name)) return env.vars.get(name).value;
      env = env.parent;
    }
    throw new UndefinedError(name, line);
  }

  getMeta(name) {
    let env = this;
    while (env) {
      if (env.vars.has(name)) return { entry: env.vars.get(name), env };
      env = env.parent;
    }
    return null;
  }

  set(name, value, line = 0) {
    let env = this;
    while (env) {
      if (env.vars.has(name)) {
        const entry = env.vars.get(name);
        if (entry.isConst) throw new ConstError(name, line);
        entry.value = value;
        return;
      }
      env = env.parent;
    }
    throw new UndefinedError(name, line);
  }

  setLocal(name, value) {
    if (this.vars.has(name)) {
      this.vars.get(name).value = value;
    }
  }

  has(name) {
    let env = this;
    while (env) { if (env.vars.has(name)) return true; env = env.parent; }
    return false;
  }

  hasLocal(name) { return this.vars.has(name); }

  // ─── Type Operations ───
  defineType(name, def) { this.types.set(name, def); }
  getType(name) {
    let env = this;
    while (env) { if (env.types.has(name)) return env.types.get(name); env = env.parent; }
    return null;
  }

  // ─── Label Operations ───
  defineLabel(name, node) { this.labels.set(name, node); }
  getLabel(name) {
    let env = this;
    while (env) { if (env.labels.has(name)) return env.labels.get(name); env = env.parent; }
    return null;
  }

  // ─── Inspection (for debugger) ───
  allVars(includeParents = false) {
    if (!includeParents) {
      const out = {};
      for (const [k, v] of this.vars) out[k] = v;
      return out;
    }
    const out = {};
    let env = this;
    while (env) {
      for (const [k, v] of env.vars) if (!(k in out)) out[k] = v;
      env = env.parent;
    }
    return out;
  }

  allVarsFlat() {
    const out = [];
    let env = this;
    const seen = new Set();
    while (env) {
      for (const [k, v] of env.vars) {
        if (!seen.has(k)) { seen.add(k); out.push({ name: k, entry: v, scope: env.name }); }
      }
      env = env.parent;
      if (!env || env.kind === 'global') break;
    }
    return out;
  }

  // ─── Scope Chain String ───
  toString() {
    const parts = [];
    let env = this;
    while (env) { parts.unshift(env.name); env = env.parent; }
    return parts.join(' > ');
  }
}

if (typeof module !== 'undefined') {
  module.exports = { Environment, EnvEntry };
} else {
  window._NK_ENV = { Environment, EnvEntry };
}
