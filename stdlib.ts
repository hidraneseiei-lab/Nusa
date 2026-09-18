/**
 * =============================================================================
 *  BAHASA NUSA — Pustaka Standar (Standard Library / "API Bawaan")
 * =============================================================================
 *  Modul ini adalah jantung "API" Bahasa Nusa: kumpulan fungsi & namespace
 *  bawaan yang otomatis tersedia di setiap program Nusa tanpa perlu impor.
 *  Semua dioptimalkan agar operasi umum (matematika, teks, larik, objek,
 *  waktu, JSON, jaringan/HTTP, dan utilitas) dapat dipakai secara instan.
 *
 *  Namespace yang disediakan:
 *    - Matematika   : operasi & konstanta matematis
 *    - Teks         : manipulasi string
 *    - Larik        : operasi array fungsional (petakan/saring/lipat/dst)
 *    - Objek        : utilitas objek
 *    - Waktu        : tanggal & waktu
 *    - JSON         : serialisasi/deserialisasi
 *    - Acak         : bilangan & pemilihan acak
 *    - Jaringan     : pembungkus fetch() untuk permintaan HTTP asinkron
 *
 *  Fungsi global bawaan: tampilkan, jenis, keTeks, keAngka, keBoolean,
 *  panjang, salinDalam, jangkau (range), gagal.
 * =============================================================================
 */

import { NusaRuntimeError } from "./errors";
import { Environment } from "./environment";
import {
  NativeFunction,
  NusaObject,
  isCallable,
  stringify,
  typeName,
  isTruthy,
} from "./values";
import type { Interpreter } from "./interpreter";

export type OutputSink = (text: string, kind?: "log" | "error" | "warn") => void;

function asNumber(v: unknown, ctx: string): number {
  if (typeof v !== "number") throw new NusaRuntimeError(`${ctx}: diharapkan angka, mendapat ${typeName(v)}`);
  return v;
}
function asString(v: unknown, ctx: string): string {
  if (typeof v !== "string") throw new NusaRuntimeError(`${ctx}: diharapkan teks, mendapat ${typeName(v)}`);
  return v;
}
function asArray(v: unknown, ctx: string): unknown[] {
  if (!Array.isArray(v)) throw new NusaRuntimeError(`${ctx}: diharapkan larik, mendapat ${typeName(v)}`);
  return v;
}

function makeNamespace(name: string, fns: Record<string, (interp: Interpreter, args: unknown[]) => unknown>, constants: Record<string, unknown> = {}): NusaObject {
  const ns = new NusaObject();
  for (const [k, v] of Object.entries(constants)) ns.set(k, v);
  for (const [k, fn] of Object.entries(fns)) ns.set(k, new NativeFunction(`${name}.${k}`, fn.length - 1 < 0 ? 0 : fn.length - 1, fn));
  return ns;
}

async function callUserFn(interp: Interpreter, fn: unknown, args: unknown[]): Promise<unknown> {
  if (!isCallable(fn)) throw new NusaRuntimeError(`Nilai yang diberikan bukan fungsi (mendapat ${typeName(fn)})`);
  return await interp.invoke(fn, args);
}

export function createGlobalEnvironment(output: OutputSink, fetchImpl: typeof fetch): Environment {
  const env = new Environment(null);

  // ------------------------------------------------------------------
  // Fungsi global
  // ------------------------------------------------------------------
  env.define(
    "tampilkan",
    new NativeFunction("tampilkan", 0, (_interp, args) => {
      output(args.map((a) => stringify(a)).join(" "), "log");
      return null;
    })
  );

  env.define(
    "tampilkanGalat",
    new NativeFunction("tampilkanGalat", 0, (_interp, args) => {
      output(args.map((a) => stringify(a)).join(" "), "error");
      return null;
    })
  );

  env.define(
    "jenis",
    new NativeFunction("jenis", 1, (_interp, args) => typeName(args[0]))
  );

  env.define(
    "keTeks",
    new NativeFunction("keTeks", 1, (_interp, args) => stringify(args[0]))
  );

  env.define(
    "keAngka",
    new NativeFunction("keAngka", 1, (_interp, args) => {
      const v = args[0];
      if (typeof v === "number") return v;
      if (typeof v === "boolean") return v ? 1 : 0;
      const n = parseFloat(String(v));
      if (Number.isNaN(n)) throw new NusaRuntimeError(`Tidak dapat mengubah '${stringify(v)}' menjadi angka`);
      return n;
    })
  );

  env.define(
    "keBoolean",
    new NativeFunction("keBoolean", 1, (_interp, args) => isTruthy(args[0]))
  );

  env.define(
    "panjang",
    new NativeFunction("panjang", 1, (_interp, args) => {
      const v = args[0];
      if (typeof v === "string") return v.length;
      if (Array.isArray(v)) return v.length;
      if (v instanceof NusaObject) return v.props.size;
      throw new NusaRuntimeError(`panjang(): tipe ${typeName(v)} tidak memiliki panjang`);
    })
  );

  env.define(
    "jangkau",
    new NativeFunction("jangkau", 1, (_interp, args) => {
      const [a, b, step] = args as number[];
      const start = b === undefined ? 0 : a;
      const end = b === undefined ? a : b;
      const s = step && step !== 0 ? step : 1;
      const result: number[] = [];
      if (s > 0) for (let i = start; i < end; i += s) result.push(i);
      else for (let i = start; i > end; i += s) result.push(i);
      return result;
    })
  );

  env.define(
    "gagal",
    new NativeFunction("gagal", 1, (_interp, args) => {
      throw new NusaRuntimeError(stringify(args[0] ?? "Kesalahan tidak diketahui"));
    })
  );

  env.define(
    "cetakTabel",
    new NativeFunction("cetakTabel", 1, (_interp, args) => {
      output(stringify(args[0]), "log");
      return null;
    })
  );

  // ------------------------------------------------------------------
  // Matematika
  // ------------------------------------------------------------------
  const Matematika = makeNamespace(
    "Matematika",
    {
      akar: (_i, a) => Math.sqrt(asNumber(a[0], "Matematika.akar")),
      pangkat: (_i, a) => Math.pow(asNumber(a[0], "Matematika.pangkat"), asNumber(a[1], "Matematika.pangkat")),
      absolut: (_i, a) => Math.abs(asNumber(a[0], "Matematika.absolut")),
      bulat: (_i, a) => Math.round(asNumber(a[0], "Matematika.bulat")),
      bulatBawah: (_i, a) => Math.floor(asNumber(a[0], "Matematika.bulatBawah")),
      bulatAtas: (_i, a) => Math.ceil(asNumber(a[0], "Matematika.bulatAtas")),
      maksimum: (_i, a) => Math.max(...a.map((x) => asNumber(x, "Matematika.maksimum"))),
      minimum: (_i, a) => Math.min(...a.map((x) => asNumber(x, "Matematika.minimum"))),
      acak: () => Math.random(),
      acakAntara: (_i, a) => {
        const min = asNumber(a[0], "Matematika.acakAntara");
        const max = asNumber(a[1], "Matematika.acakAntara");
        return Math.floor(Math.random() * (max - min + 1)) + min;
      },
      log: (_i, a) => Math.log(asNumber(a[0], "Matematika.log")),
      log10: (_i, a) => Math.log10(asNumber(a[0], "Matematika.log10")),
      sin: (_i, a) => Math.sin(asNumber(a[0], "Matematika.sin")),
      cos: (_i, a) => Math.cos(asNumber(a[0], "Matematika.cos")),
      tan: (_i, a) => Math.tan(asNumber(a[0], "Matematika.tan")),
      tandaBilangan: (_i, a) => Math.sign(asNumber(a[0], "Matematika.tandaBilangan")),
    },
    { PI: Math.PI, E: Math.E, TAK_TERHINGGA: Infinity }
  );
  env.define("Matematika", Matematika);

  // ------------------------------------------------------------------
  // Teks
  // ------------------------------------------------------------------
  const Teks = makeNamespace("Teks", {
    panjang: (_i, a) => asString(a[0], "Teks.panjang").length,
    hurufBesar: (_i, a) => asString(a[0], "Teks.hurufBesar").toUpperCase(),
    hurufKecil: (_i, a) => asString(a[0], "Teks.hurufKecil").toLowerCase(),
    potong: (_i, a) => asString(a[0], "Teks.potong").slice(asNumber(a[1], "Teks.potong"), a[2] === undefined ? undefined : asNumber(a[2], "Teks.potong")),
    gabung: (_i, a) => asArray(a[0], "Teks.gabung").map((v) => stringify(v)).join(asString(a[1] ?? ",", "Teks.gabung")),
    pisah: (_i, a) => asString(a[0], "Teks.pisah").split(asString(a[1] ?? "", "Teks.pisah")),
    gantikan: (_i, a) => asString(a[0], "Teks.gantikan").split(asString(a[1], "Teks.gantikan")).join(asString(a[2], "Teks.gantikan")),
    trim: (_i, a) => asString(a[0], "Teks.trim").trim(),
    mengandung: (_i, a) => asString(a[0], "Teks.mengandung").includes(asString(a[1], "Teks.mengandung")),
    dimulaiDengan: (_i, a) => asString(a[0], "Teks.dimulaiDengan").startsWith(asString(a[1], "Teks.dimulaiDengan")),
    diakhiriDengan: (_i, a) => asString(a[0], "Teks.diakhiriDengan").endsWith(asString(a[1], "Teks.diakhiriDengan")),
    ulangi: (_i, a) => asString(a[0], "Teks.ulangi").repeat(Math.max(0, asNumber(a[1], "Teks.ulangi"))),
    balik: (_i, a) => asString(a[0], "Teks.balik").split("").reverse().join(""),
    karakterDi: (_i, a) => asString(a[0], "Teks.karakterDi").charAt(asNumber(a[1], "Teks.karakterDi")),
    indeksDari: (_i, a) => asString(a[0], "Teks.indeksDari").indexOf(asString(a[1], "Teks.indeksDari")),
    ratakanKiri: (_i, a) => asString(a[0], "Teks.ratakanKiri").padStart(asNumber(a[1], "Teks.ratakanKiri"), asString(a[2] ?? " ", "Teks.ratakanKiri")),
    ratakanKanan: (_i, a) => asString(a[0], "Teks.ratakanKanan").padEnd(asNumber(a[1], "Teks.ratakanKanan"), asString(a[2] ?? " ", "Teks.ratakanKanan")),
  });
  env.define("Teks", Teks);

  // ------------------------------------------------------------------
  // Larik (Array)
  // ------------------------------------------------------------------
  const Larik = new NusaObject();
  Larik.set("panjang", new NativeFunction("Larik.panjang", 1, (_i, a) => asArray(a[0], "Larik.panjang").length));
  Larik.set("tambah", new NativeFunction("Larik.tambah", 2, (_i, a) => {
    const arr = asArray(a[0], "Larik.tambah");
    arr.push(a[1]);
    return arr;
  }));
  Larik.set("tambahDiAwal", new NativeFunction("Larik.tambahDiAwal", 2, (_i, a) => {
    const arr = asArray(a[0], "Larik.tambahDiAwal");
    arr.unshift(a[1]);
    return arr;
  }));
  Larik.set("hapusTerakhir", new NativeFunction("Larik.hapusTerakhir", 1, (_i, a) => asArray(a[0], "Larik.hapusTerakhir").pop() ?? null));
  Larik.set("hapusPertama", new NativeFunction("Larik.hapusPertama", 1, (_i, a) => asArray(a[0], "Larik.hapusPertama").shift() ?? null));
  Larik.set("gabungkan", new NativeFunction("Larik.gabungkan", 2, (_i, a) => [...asArray(a[0], "Larik.gabungkan"), ...asArray(a[1], "Larik.gabungkan")]));
  Larik.set("potong", new NativeFunction("Larik.potong", 2, (_i, a) => asArray(a[0], "Larik.potong").slice(asNumber(a[1], "Larik.potong"), a[2] === undefined ? undefined : asNumber(a[2], "Larik.potong"))));
  Larik.set("mengandung", new NativeFunction("Larik.mengandung", 2, (_i, a) => asArray(a[0], "Larik.mengandung").some((v) => stringify(v) === stringify(a[1]))));
  Larik.set("indeksDari", new NativeFunction("Larik.indeksDari", 2, (_i, a) => asArray(a[0], "Larik.indeksDari").findIndex((v) => stringify(v) === stringify(a[1]))));
  Larik.set("balik", new NativeFunction("Larik.balik", 1, (_i, a) => [...asArray(a[0], "Larik.balik")].reverse()));
  Larik.set("urutkan", new NativeFunction("Larik.urutkan", 1, async (interp, a) => {
    const arr = [...asArray(a[0], "Larik.urutkan")];
    const cmp = a[1];
    if (cmp) {
      // insertion sort stabil menggunakan komparator yang boleh berupa fungsi asinkron
      const result: unknown[] = [];
      for (const item of arr) {
        let i = 0;
        while (i < result.length && Number(await callUserFn(interp, cmp, [result[i], item])) <= 0) i++;
        result.splice(i, 0, item);
      }
      return result;
    }
    return arr.sort((x, y) => {
      const sx = typeof x === "number" ? x : String(x);
      const sy = typeof y === "number" ? y : String(y);
      return sx < sy ? -1 : sx > sy ? 1 : 0;
    });
  }));
  Larik.set("petakan", new NativeFunction("Larik.petakan", 2, async (interp, a) => {
    const arr = asArray(a[0], "Larik.petakan");
    const out: unknown[] = [];
    for (let i = 0; i < arr.length; i++) out.push(await callUserFn(interp, a[1], [arr[i], i, arr]));
    return out;
  }));
  Larik.set("saring", new NativeFunction("Larik.saring", 2, async (interp, a) => {
    const arr = asArray(a[0], "Larik.saring");
    const out: unknown[] = [];
    for (let i = 0; i < arr.length; i++) if (isTruthy(await callUserFn(interp, a[1], [arr[i], i, arr]))) out.push(arr[i]);
    return out;
  }));
  Larik.set("lipat", new NativeFunction("Larik.lipat", 3, async (interp, a) => {
    const arr = asArray(a[0], "Larik.lipat");
    let acc = a[2];
    for (let i = 0; i < arr.length; i++) acc = await callUserFn(interp, a[1], [acc, arr[i], i, arr]);
    return acc;
  }));
  Larik.set("cariSatu", new NativeFunction("Larik.cariSatu", 2, async (interp, a) => {
    const arr = asArray(a[0], "Larik.cariSatu");
    for (let i = 0; i < arr.length; i++) if (isTruthy(await callUserFn(interp, a[1], [arr[i], i, arr]))) return arr[i];
    return null;
  }));
  Larik.set("setiapMemenuhi", new NativeFunction("Larik.setiapMemenuhi", 2, async (interp, a) => {
    const arr = asArray(a[0], "Larik.setiapMemenuhi");
    for (let i = 0; i < arr.length; i++) if (!isTruthy(await callUserFn(interp, a[1], [arr[i], i, arr]))) return false;
    return true;
  }));
  Larik.set("adaYangMemenuhi", new NativeFunction("Larik.adaYangMemenuhi", 2, async (interp, a) => {
    const arr = asArray(a[0], "Larik.adaYangMemenuhi");
    for (let i = 0; i < arr.length; i++) if (isTruthy(await callUserFn(interp, a[1], [arr[i], i, arr]))) return true;
    return false;
  }));
  Larik.set("unikkan", new NativeFunction("Larik.unikkan", 1, (_i, a) => {
    const arr = asArray(a[0], "Larik.unikkan");
    const seen = new Set<string>();
    const out: unknown[] = [];
    for (const v of arr) {
      const key = stringify(v);
      if (!seen.has(key)) {
        seen.add(key);
        out.push(v);
      }
    }
    return out;
  }));
  Larik.set("ratakan", new NativeFunction("Larik.ratakan", 1, (_i, a) => asArray(a[0], "Larik.ratakan").flat(Infinity)));
  Larik.set("jumlahkan", new NativeFunction("Larik.jumlahkan", 1, (_i, a) => asArray(a[0], "Larik.jumlahkan").reduce((s: number, v) => s + asNumber(v, "Larik.jumlahkan"), 0)));
  env.define("Larik", Larik);

  // ------------------------------------------------------------------
  // Objek
  // ------------------------------------------------------------------
  const Objek = makeNamespace("Objek", {
    kunci: (_i, a) => Array.from((a[0] as NusaObject).props.keys()),
    nilai: (_i, a) => Array.from((a[0] as NusaObject).props.values()),
    pasangan: (_i, a) => Array.from((a[0] as NusaObject).props.entries()).map(([k, v]) => [k, v]),
    punyaKunci: (_i, a) => (a[0] as NusaObject).props.has(asString(a[1], "Objek.punyaKunci")),
    gabungkan: (_i, a) => {
      const result = new NusaObject();
      for (const obj of a) {
        if (obj instanceof NusaObject) for (const [k, v] of obj.props) result.set(k, v);
      }
      return result;
    },
    salin: (_i, a) => new NusaObject((a[0] as NusaObject).props.entries()),
  });
  env.define("Objek", Objek);

  // ------------------------------------------------------------------
  // Waktu
  // ------------------------------------------------------------------
  const Waktu = makeNamespace("Waktu", {
    sekarang: () => Date.now(),
    format: (_i, a) => new Date(asNumber(a[0], "Waktu.format")).toLocaleString("id-ID"),
    tahun: (_i, a) => new Date(asNumber(a[0], "Waktu.tahun")).getFullYear(),
    tunggu: async (_i, a) => {
      const ms = asNumber(a[0], "Waktu.tunggu");
      await new Promise((resolve) => setTimeout(resolve, ms));
      return null;
    },
  });
  env.define("Waktu", Waktu);

  // ------------------------------------------------------------------
  // JSON
  // ------------------------------------------------------------------
  function toPlain(v: unknown): unknown {
    if (Array.isArray(v)) return v.map(toPlain);
    if (v instanceof NusaObject) {
      const o: Record<string, unknown> = {};
      for (const [k, val] of v.props) o[k] = toPlain(val);
      return o;
    }
    return v;
  }
  function fromPlain(v: unknown): unknown {
    if (Array.isArray(v)) return v.map(fromPlain);
    if (v && typeof v === "object") {
      const obj = new NusaObject();
      for (const [k, val] of Object.entries(v as Record<string, unknown>)) obj.set(k, fromPlain(val));
      return obj;
    }
    return v;
  }
  const JSONNamespace = makeNamespace("JSON", {
    keTeks: (_i, a) => JSON.stringify(toPlain(a[0]), null, a[1] ? asNumber(a[1], "JSON.keTeks") : undefined),
    keObjek: (_i, a) => {
      try {
        return fromPlain(JSON.parse(asString(a[0], "JSON.keObjek")));
      } catch (e) {
        throw new NusaRuntimeError(`JSON.keObjek: teks JSON tidak valid (${(e as Error).message})`);
      }
    },
  });
  env.define("JSON", JSONNamespace);

  // ------------------------------------------------------------------
  // Acak
  // ------------------------------------------------------------------
  const Acak = makeNamespace("Acak", {
    angka: () => Math.random(),
    antara: (_i, a) => Math.floor(Math.random() * (asNumber(a[1], "Acak.antara") - asNumber(a[0], "Acak.antara") + 1)) + asNumber(a[0], "Acak.antara"),
    pilih: (_i, a) => {
      const arr = asArray(a[0], "Acak.pilih");
      return arr[Math.floor(Math.random() * arr.length)];
    },
    kocok: (_i, a) => {
      const arr = [...asArray(a[0], "Acak.kocok")];
      for (let i = arr.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [arr[i], arr[j]] = [arr[j], arr[i]];
      }
      return arr;
    },
  });
  env.define("Acak", Acak);

  // ------------------------------------------------------------------
  // Jaringan — pembungkus fetch() untuk permintaan HTTP asinkron
  // (Ini adalah bagian "optimasi API" utama Bahasa Nusa)
  // ------------------------------------------------------------------
  const Jaringan = new NusaObject();
  Jaringan.set(
    "ambil",
    new NativeFunction("Jaringan.ambil", 1, async (_i, a) => {
      const url = asString(a[0], "Jaringan.ambil");
      const opsi = a[1] instanceof NusaObject ? a[1] : null;
      const init: RequestInit = {};
      if (opsi) {
        const metode = opsi.get("metode");
        if (typeof metode === "string") init.method = metode;
        const headerObj = opsi.get("header");
        if (headerObj instanceof NusaObject) {
          const headers: Record<string, string> = {};
          for (const [k, v] of headerObj.props) headers[k] = stringify(v);
          init.headers = headers;
        }
        const body = opsi.get("data");
        if (body !== null && body !== undefined) {
          init.body = typeof body === "string" ? body : JSON.stringify(toPlain(body));
          if (!init.headers) init.headers = { "Content-Type": "application/json" };
        }
      }
      try {
        const res = await fetchImpl(url, init);
        const text = await res.text();
        let jsonVal: unknown = null;
        try {
          jsonVal = fromPlain(JSON.parse(text));
        } catch {
          jsonVal = null;
        }
        const result = new NusaObject();
        result.set("status", res.status);
        result.set("ok", res.ok);
        result.set("teks", text);
        result.set("json", jsonVal);
        return result;
      } catch (e) {
        throw new NusaRuntimeError(`Jaringan.ambil gagal memuat '${url}': ${(e as Error).message}`);
      }
    })
  );
  env.define("Jaringan", Jaringan);

  return env;
}
