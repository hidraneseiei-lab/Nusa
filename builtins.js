/**
 * NusaKids — Built-in Functions & Standard Library
 * Fungsi bawaan NusaKids (350+ fungsi, gaya nama akrab buat pemula)
 */

'use strict';

const _err = (typeof module !== 'undefined') ? require('./errors') : window._NK_ERRORS;
const { RuntimeError, RangeError_, NullError, TestFailError } = _err;
// fs hanya tersedia di Node.js; di browser tetap aman (fungsi file akan melempar error saat dipanggil)
const _fs = (typeof module !== 'undefined' && typeof require === 'function')
  ? (() => { try { return require('fs'); } catch (e) { return null; } })()
  : null;

function registerBuiltins(env, interpreter) {
  const I = interpreter;
  const nat = (fn, name) => ({ type: 'native', fn, name: name || fn.name || 'bawaan' });
  const D = (name, val) => env.define(name, val);

  // ════════════════════════════════════════════════════════════
  // I/O — Input & Output
  // ════════════════════════════════════════════════════════════
  D('cetak',    nat((...args) => { I.outputFn(args.map(v => I.stringify(v)).join('')); return null; }));
  D('cetakln',  nat((...args) => { I.outputFn(args.map(v => I.stringify(v)).join('') + '\n'); return null; }));
  D('cetakf',   nat((fmt, ...args) => {
    const fmtStr = I.stringify(fmt);
    let ai = 0;
    const s = fmtStr.replace(/%(%|[0-9]*\.?[0-9]*[dfscbxoe])/g, (m, spec) => {
      if (spec === '%') return '%';
      const kind = spec[spec.length - 1];
      const widthPrec = spec.slice(0, -1);
      switch (kind) {
        case 'd': return String(Math.trunc(Number(args[ai++] || 0))).padStart(Number(widthPrec) || 0, ' ');
        case 'f': {
          const val = Number(args[ai++] || 0);
          const dec = widthPrec.includes('.') ? parseInt(widthPrec.split('.')[1] || '0', 10) : 6;
          return val.toFixed(dec);
        }
        case 's': return I.stringify(args[ai++]);
        case 'c': return String(args[ai++] || '');
        case 'b': return (args[ai++] ? 'benar' : 'salah');
        case 'x': return (Number(args[ai++] || 0) >>> 0).toString(16);
        case 'o': return (Number(args[ai++] || 0) >>> 0).toString(8);
        case 'e': return Number(args[ai++] || 0).toExponential();
        default: return m;
      }
    });
    I.outputFn(s);
    return null;
  }));
  D('cetak_err', nat((...args) => { I.errorFn(args.map(v => I.stringify(v)).join('') + '\n'); return null; }));

  // ════════════════════════════════════════════════════════════
  // KONVERSI TIPE — Type Conversion
  // ════════════════════════════════════════════════════════════
  D('ke_bil',       nat((v) => { const n = parseInt(I.stringify(v), 10); if (isNaN(n)) throw new RuntimeError(`Tidak bisa konversi '${I.stringify(v)}' ke bil`); return n; }));
  D('ke_des',       nat((v) => { const n = parseFloat(I.stringify(v)); if (isNaN(n)) throw new RuntimeError(`Tidak bisa konversi '${I.stringify(v)}' ke des`); return n; }));
  D('ke_teks',      nat((v) => I.stringify(v)));
  D('ke_bool',      nat((v) => I.toBool(v)));
  D('ke_kar',       nat((v) => { if (typeof v === 'string') return v[0] || '\0'; return String.fromCharCode(Number(v)); }));
  D('ke_byte',      nat((v) => (Number(v) & 0xFF)));
  D('ke_singkat',   nat((v) => (((Number(v) & 0xFFFF) << 16) >> 16)));
  D('ke_panjang',   nat((v) => Math.trunc(Number(v))));
  D('ke_besar',     nat((v) => (Number(v) >>> 0)));

  // ════════════════════════════════════════════════════════════
  // TEKS — String Operations
  // ════════════════════════════════════════════════════════════
  D('pjg',          nat((v) => { if (Array.isArray(v)) return v.length; return String(v).length; }));
  D('potong',       nat((s, a, b) => String(s).slice(Number(a), b !== undefined ? Number(b) : undefined)));
  D('potong_dari',  nat((s, a) => String(s).slice(Number(a))));
  D('gabung',       nat((...args) => args.map(a => I.stringify(a)).join('')));
  D('cari',         nat((s, q, from) => String(s).indexOf(String(q), from !== undefined ? Number(from) : 0)));
  D('cari_akhir',   nat((s, q) => String(s).lastIndexOf(String(q))));
  D('ganti',        nat((s, q, r) => String(s).split(String(q)).join(String(r))));
  D('ganti_pertama',nat((s, q, r) => String(s).replace(String(q), String(r))));
  D('huruf_besar',  nat((s) => String(s).toUpperCase()));
  D('huruf_kecil',  nat((s) => String(s).toLowerCase()));
  D('judul_teks',   nat((s) => String(s).replace(/\b\w/g, c => c.toUpperCase())));
  D('trim',         nat((s) => String(s).trim()));
  D('trim_kiri',    nat((s) => String(s).trimStart()));
  D('trim_kanan',   nat((s) => String(s).trimEnd()));
  D('pisah',        nat((s, sep) => String(s).split(String(sep))));
  D('pisah_baris',  nat((s) => String(s).split('\n')));
  D('ulangi_teks',  nat((s, n) => String(s).repeat(Number(n))));
  D('balik_teks',   nat((s) => String(s).split('').reverse().join('')));
  D('mulai_dengan', nat((s, q) => String(s).startsWith(String(q))));
  D('akhir_dengan', nat((s, q) => String(s).endsWith(String(q))));
  D('berisi',       nat((s, q) => String(s).includes(String(q))));
  D('pad_kiri',     nat((s, n, ch) => String(s).padStart(Number(n), ch || ' ')));
  D('pad_kanan',    nat((s, n, ch) => String(s).padEnd(Number(n), ch || ' ')));
  D('format_angka', nat((n, d) => Number(n).toFixed(d !== undefined ? Number(d) : 2)));
  D('cocok_regex',  nat((s, pattern) => { const m = String(s).match(new RegExp(String(pattern))); return m ? Array.from(m) : null; }));
  D('uji_regex',    nat((s, pattern) => new RegExp(String(pattern)).test(String(s))));
  D('ganti_regex',  nat((s, pattern, rep) => String(s).replace(new RegExp(String(pattern), 'g'), String(rep))));
  D('encode_base64',nat((s) => { try { return btoa(String(s)); } catch(e) { throw new RuntimeError('Gagal encode base64'); } }));
  D('decode_base64',nat((s) => { try { return atob(String(s)); } catch(e) { throw new RuntimeError('Gagal decode base64'); } }));
  D('kode_kar',     nat((v) => { const s = String(v); return s.length > 0 ? s.charCodeAt(0) : 0; }));
  D('karakter',     nat((v) => String.fromCharCode(Number(v))));
  D('karakter_utf', nat((v) => String.fromCodePoint(Number(v))));
  D('is_angka_teks',nat((s) => !isNaN(parseFloat(String(s))) && isFinite(Number(String(s)))));
  D('is_kosong_teks',nat((s) => String(s).trim().length === 0));
  D('hitungan_kemunculan', nat((s, sub) => {
    let count = 0, pos = 0, str = String(s), q = String(sub);
    while ((pos = str.indexOf(q, pos)) !== -1) { count++; pos += q.length; }
    return count;
  }));
  D('ambil_baris',  nat((s, n) => String(s).split('\n')[Number(n)] || ''));
  D('jumlah_baris', nat((s) => String(s).split('\n').length));

  // Teks tambahan — karakter, validasi, transformasi, kemiripan
  D('kar_di',       nat((s, i) => String(s)[Number(i)] || ''));
  D('adalah_huruf', nat((c) => /^[a-zA-Z]$/.test(String(c))));
  D('adalah_angka_kar', nat((c) => /^[0-9]$/.test(String(c))));
  D('adalah_spasi', nat((c) => /^\s$/.test(String(c))));
  D('adalah_huruf_besar', nat((c) => { const s = String(c); return s === s.toUpperCase() && s !== s.toLowerCase(); }));
  D('adalah_huruf_kecil', nat((c) => { const s = String(c); return s === s.toLowerCase() && s !== s.toUpperCase(); }));
  D('kapital_awal', nat((s) => { s = String(s); return s.length ? s[0].toUpperCase() + s.slice(1) : s; }));
  D('teks_ke_kamel', nat((s) => String(s).replace(/[_\-\s]+(.)?/g, (_, c) => c ? c.toUpperCase() : '').replace(/^./, c => c.toLowerCase())));
  D('teks_ke_ular',  nat((s) => String(s).replace(/([a-z0-9])([A-Z])/g, '$1_$2').replace(/[\s\-]+/g, '_').toLowerCase()));
  D('teks_ke_kebab', nat((s) => String(s).replace(/([a-z0-9])([A-Z])/g, '$1-$2').replace(/[\s_]+/g, '-').toLowerCase()));
  D('hapus_spasi_ganda', nat((s) => String(s).replace(/\s+/g, ' ').trim()));
  D('hapus_karakter', nat((s, chars) => { const set = new Set(String(chars)); return String(s).split('').filter(c => !set.has(c)).join(''); }));
  D('sisipkan_teks', nat((s, idx, sisip) => { s = String(s); idx = Number(idx); return s.slice(0, idx) + String(sisip) + s.slice(idx); }));
  D('potong_kata',  nat((s, n) => { const words = String(s).trim().split(/\s+/); return words.slice(0, Number(n)).join(' '); }));
  D('jumlah_kata',  nat((s) => { const t = String(s).trim(); return t.length ? t.split(/\s+/).length : 0; }));
  D('kata_kata',    nat((s) => { const t = String(s).trim(); return t.length ? t.split(/\s+/) : []; }));
  D('adalah_palindrom', nat((s) => { const t = String(s).toLowerCase().replace(/[^a-z0-9]/g, ''); return t === t.split('').reverse().join(''); }));
  D('adalah_anagram', nat((a, b) => { const norm = s => String(s).toLowerCase().replace(/[^a-z0-9]/g, '').split('').sort().join(''); return norm(a) === norm(b); }));
  D('jarak_levenshtein', nat((a, b) => {
    a = String(a); b = String(b);
    const dp = Array.from({ length: a.length + 1 }, (_, i) => [i, ...new Array(b.length).fill(0)]);
    for (let j = 0; j <= b.length; j++) dp[0][j] = j;
    for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++) {
      dp[i][j] = a[i-1] === b[j-1] ? dp[i-1][j-1] : 1 + Math.min(dp[i-1][j], dp[i][j-1], dp[i-1][j-1]);
    }
    return dp[a.length][b.length];
  }));
  D('kemiripan_teks', nat((a, b) => {
    a = String(a); b = String(b);
    const maxLen = Math.max(a.length, b.length);
    if (maxLen === 0) return 1;
    const dp = Array.from({ length: a.length + 1 }, (_, i) => [i, ...new Array(b.length).fill(0)]);
    for (let j = 0; j <= b.length; j++) dp[0][j] = j;
    for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++) {
      dp[i][j] = a[i-1] === b[j-1] ? dp[i-1][j-1] : 1 + Math.min(dp[i-1][j], dp[i][j-1], dp[i-1][j-1]);
    }
    return 1 - dp[a.length][b.length] / maxLen;
  }));
  D('validasi_email', nat((s) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(s))));
  D('validasi_url',   nat((s) => { try { new URL(String(s)); return true; } catch (e) { return false; } }));
  D('slugify',      nat((s) => String(s).toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')));
  D('escape_html',  nat((s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;')));
  D('unescape_html',nat((s) => String(s).replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'")));
  D('format_ribuan', nat((n) => Number(n).toLocaleString('id-ID')));
  D('teks_acak',    nat((n, charset) => {
    const chars = charset ? String(charset) : 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let r = ''; for (let i = 0; i < Number(n); i++) r += chars[Math.floor(Math.random() * chars.length)];
    return r;
  }));
  D('teks_ke_bil_arr', nat((s) => String(s).split('').map(c => c.charCodeAt(0))));
  D('bil_arr_ke_teks', nat((arr) => { if (!Array.isArray(arr)) throw new RuntimeError('Bukan array'); return arr.map(n => String.fromCharCode(Number(n))).join(''); }));

  // ════════════════════════════════════════════════════════════
  // MATEMATIKA — Math Functions
  // ════════════════════════════════════════════════════════════
  D('akar',       nat((v) => Math.sqrt(Number(v))));
  D('akar_kubik', nat((v) => Math.cbrt(Number(v))));
  D('kuasa',      nat((b, e) => Math.pow(Number(b), Number(e))));
  D('abs',        nat((v) => Math.abs(Number(v))));
  D('lantai',     nat((v) => Math.floor(Number(v))));
  D('langit',     nat((v) => Math.ceil(Number(v))));
  D('bulat',      nat((v, d) => d !== undefined ? parseFloat(Number(v).toFixed(Number(d))) : Math.round(Number(v))));
  D('truncate',   nat((v) => Math.trunc(Number(v))));
  D('maks',       nat((...args) => Math.max(...args.flat().map(Number))));
  D('min',        nat((...args) => Math.min(...args.flat().map(Number))));
  D('log',        nat((v) => Math.log(Number(v))));
  D('log2',       nat((v) => Math.log2(Number(v))));
  D('log10',      nat((v) => Math.log10(Number(v))));
  D('exp',        nat((v) => Math.exp(Number(v))));
  D('sin',        nat((v) => Math.sin(Number(v))));
  D('cos',        nat((v) => Math.cos(Number(v))));
  D('tan',        nat((v) => Math.tan(Number(v))));
  D('asin',       nat((v) => Math.asin(Number(v))));
  D('acos',       nat((v) => Math.acos(Number(v))));
  D('atan',       nat((v) => Math.atan(Number(v))));
  D('atan2',      nat((y, x) => Math.atan2(Number(y), Number(x))));
  D('sinh',       nat((v) => Math.sinh(Number(v))));
  D('cosh',       nat((v) => Math.cosh(Number(v))));
  D('tanh',       nat((v) => Math.tanh(Number(v))));
  D('hipotenusa', nat((a, b) => Math.hypot(Number(a), Number(b))));
  D('tanda',      nat((v) => Math.sign(Number(v))));
  D('fraksi',     nat((v) => { const n = Number(v); return n - Math.trunc(n); }));
  D('gcd',        nat((a, b) => { let x = Math.abs(Number(a)), y = Math.abs(Number(b)); while (y) { [x, y] = [y, x % y]; } return x; }));
  D('lcm',        nat((a, b) => { const g = Math.abs(Number(a) * Number(b)); let x = Math.abs(Number(a)), y = Math.abs(Number(b)); while (y) { [x, y] = [y, x % y]; } return g / x; }));
  D('clamp',      nat((v, lo, hi) => Math.min(Math.max(Number(v), Number(lo)), Number(hi))));
  D('lerp',       nat((a, b, t) => Number(a) + (Number(b) - Number(a)) * Number(t)));
  D('derajat',    nat((r) => Number(r) * 180 / Math.PI));
  D('radian',     nat((d) => Number(d) * Math.PI / 180));
  D('acak',       nat(() => Math.random()));
  D('acak_bil',   nat((min, max) => Math.floor(Math.random() * (Number(max) - Number(min) + 1)) + Number(min)));
  D('acak_des',   nat((min, max) => Math.random() * (Number(max) - Number(min)) + Number(min)));
  D('prima',      nat((n) => { n = Number(n); if (n < 2) return false; if (n === 2) return true; if (n % 2 === 0) return false; for (let i = 3; i * i <= n; i += 2) if (n % i === 0) return false; return true; }));
  D('faktor',     nat((n) => { n = Math.abs(Number(n)); const f = []; for (let i = 2; i * i <= n; i++) { while (n % i === 0) { f.push(i); n /= i; } } if (n > 1) f.push(n); return f; }));
  D('fibonacci_n',nat((n) => { n = Number(n); if (n <= 0) return 0; if (n === 1) return 1; let a = 0, b = 1; for (let i = 2; i <= n; i++) [a, b] = [b, a + b]; return b; }));
  D('faktorial_n',nat((n) => { n = Number(n); if (n < 0) throw new RuntimeError('Faktorial tidak bisa negatif'); let r = 1; for (let i = 2; i <= n; i++) r *= i; return r; }));
  D('kombinasi',  nat((n, k) => { n = Number(n); k = Number(k); if (k > n) return 0; let r = 1; for (let i = 0; i < k; i++) r = r * (n - i) / (i + 1); return Math.round(r); }));
  D('permutasi',  nat((n, k) => { n = Number(n); k = Number(k); let r = 1; for (let i = n - k + 1; i <= n; i++) r *= i; return r; }));
  D('modpow',     nat((base, exp, mod) => {
    let result = 1n, b = BigInt(Math.trunc(Number(base))), e = BigInt(Math.trunc(Number(exp))), m = BigInt(Math.trunc(Number(mod)));
    b %= m; while (e > 0n) { if (e & 1n) result = result * b % m; e >>= 1n; b = b * b % m; }
    return Number(result);
  }));

  // Matematika tambahan — trig invers hiperbolik, log basis-n, statistik lanjutan, angka
  D('asinh',      nat((v) => Math.asinh(Number(v))));
  D('acosh',      nat((v) => Math.acosh(Number(v))));
  D('atanh',      nat((v) => Math.atanh(Number(v))));
  D('log_basis',  nat((v, basis) => Math.log(Number(v)) / Math.log(Number(basis))));
  D('akar_n',     nat((v, n) => Math.pow(Number(v), 1 / Number(n))));
  D('cbrt',       nat((v) => Math.cbrt(Number(v))));
  D('bagi_bulat', nat((a, b) => Math.trunc(Number(a) / Number(b))));
  D('sisa_bulat', nat((a, b) => { const r = Number(a) % Number(b); return r; }));
  D('mod_positif',nat((a, b) => { const m = Number(b); return ((Number(a) % m) + m) % m; }));
  D('genap',      nat((v) => Number(v) % 2 === 0));
  D('ganjil',     nat((v) => Math.trunc(Number(v)) % 2 !== 0));
  D('dalam_rentang', nat((v, lo, hi) => Number(v) >= Number(lo) && Number(v) <= Number(hi)));
  D('peta_rentang', nat((v, inMin, inMax, outMin, outMax) => {
    v = Number(v); inMin = Number(inMin); inMax = Number(inMax); outMin = Number(outMin); outMax = Number(outMax);
    return outMin + ((v - inMin) * (outMax - outMin)) / (inMax - inMin);
  }));
  D('smoothstep', nat((edge0, edge1, x) => {
    edge0 = Number(edge0); edge1 = Number(edge1); x = Number(x);
    const t = Math.min(1, Math.max(0, (x - edge0) / (edge1 - edge0)));
    return t * t * (3 - 2 * t);
  }));
  D('digit_sum',  nat((n) => String(Math.abs(Math.trunc(Number(n)))).split('').reduce((s, c) => s + Number(c), 0)));
  D('adalah_kuasa_dari', nat((n, base) => { n = Number(n); base = Number(base); if (n <= 0) return false; while (n % base === 0) n /= base; return n === 1; }));
  D('adalah_kuadrat_sempurna', nat((n) => { n = Number(n); if (n < 0) return false; const r = Math.round(Math.sqrt(n)); return r * r === n; }));
  D('gcd_arr',    nat((arr) => { if (!Array.isArray(arr) || !arr.length) throw new RuntimeError('Array kosong'); const gcd2 = (a,b) => { a=Math.abs(a);b=Math.abs(b); while(b){[a,b]=[b,a%b];} return a; }; return arr.map(Number).reduce(gcd2); }));
  D('lcm_arr',    nat((arr) => { if (!Array.isArray(arr) || !arr.length) throw new RuntimeError('Array kosong'); const gcd2 = (a,b) => { a=Math.abs(a);b=Math.abs(b); while(b){[a,b]=[b,a%b];} return a; }; const lcm2 = (a,b) => Math.abs(a*b)/gcd2(a,b); return arr.map(Number).reduce(lcm2); }));
  D('median_arr_cepat', nat((arr) => { if (!Array.isArray(arr) || !arr.length) throw new RuntimeError('Array kosong'); const s=[...arr].map(Number).sort((a,b)=>a-b); const m=Math.floor(s.length/2); return s.length%2?s[m]:(s[m-1]+s[m])/2; }));
  D('modus',      nat((arr) => { if (!Array.isArray(arr) || !arr.length) throw new RuntimeError('Array kosong'); const freq=new Map(); let best=arr[0],bestC=0; for(const v of arr){const c=(freq.get(v)||0)+1;freq.set(v,c); if(c>bestC){bestC=c;best=v;}} return best; }));
  D('rentang_arr',nat((arr) => { if (!Array.isArray(arr) || !arr.length) throw new RuntimeError('Array kosong'); const nums=arr.map(Number); return Math.max(...nums)-Math.min(...nums); }));
  D('persentil',  nat((arr, p) => { if (!Array.isArray(arr) || !arr.length) throw new RuntimeError('Array kosong'); const s=[...arr].map(Number).sort((a,b)=>a-b); const idx=(Number(p)/100)*(s.length-1); const lo=Math.floor(idx),hi=Math.ceil(idx); if(lo===hi)return s[lo]; return s[lo]+(s[hi]-s[lo])*(idx-lo); }));
  D('normalisasi_arr', nat((arr) => { if (!Array.isArray(arr) || !arr.length) throw new RuntimeError('Array kosong'); const nums=arr.map(Number); const mn=Math.min(...nums),mx=Math.max(...nums); const range=mx-mn||1; return nums.map(v=>(v-mn)/range); }));
  D('vektor_panjang', nat((arr) => { if (!Array.isArray(arr)) throw new RuntimeError('Bukan array'); return Math.sqrt(arr.reduce((s,v)=>s+Number(v)*Number(v),0)); }));
  D('vektor_dot', nat((a, b) => { if (!Array.isArray(a)||!Array.isArray(b)) throw new RuntimeError('Bukan array'); return a.reduce((s,v,i)=>s+Number(v)*Number(b[i]||0),0); }));
  D('vektor_normalisasi', nat((arr) => { if (!Array.isArray(arr)) throw new RuntimeError('Bukan array'); const len=Math.sqrt(arr.reduce((s,v)=>s+Number(v)*Number(v),0))||1; return arr.map(v=>Number(v)/len); }));
  D('bil_bulat_acak_arr', nat((n, min, max) => { const r=[]; for(let i=0;i<Number(n);i++) r.push(Math.floor(Math.random()*(Number(max)-Number(min)+1))+Number(min)); return r; }));
  D('deret_aritmatika', nat((a1, d, n) => { const r=[]; for(let i=0;i<Number(n);i++) r.push(Number(a1)+i*Number(d)); return r; }));
  D('deret_geometri', nat((a1, r, n) => { const arr=[]; for(let i=0;i<Number(n);i++) arr.push(Number(a1)*Math.pow(Number(r),i)); return arr; }));

  // Konstanta matematika
  D('PI',         Math.PI);
  D('E',          Math.E);
  D('PHI',        (1 + Math.sqrt(5)) / 2);   // golden ratio
  D('TAK_BATAS',  Infinity);
  D('NEG_TAK_BATAS', -Infinity);
  D('BUKAN_ANGKA',NaN);
  D('EPSILON',    Number.EPSILON);
  D('BIL_MAKS',   Number.MAX_SAFE_INTEGER);
  D('BIL_MIN',    Number.MIN_SAFE_INTEGER);
  D('BIL_MAKS_DES', Number.MAX_VALUE);

  // ════════════════════════════════════════════════════════════
  // ARRAY / DAFTAR — Array & List Operations
  // ════════════════════════════════════════════════════════════
  D('buat_arr',    nat((n, fill) => new Array(Number(n)).fill(fill !== undefined ? fill : 0)));
  D('buat_arr2d',  nat((r, c, fill) => Array.from({ length: Number(r) }, () => new Array(Number(c)).fill(fill !== undefined ? fill : 0))));
  D('tambah',      nat((arr, ...vals) => { if (!Array.isArray(arr)) throw new RuntimeError('Bukan array'); vals.forEach(v => arr.push(v)); return arr; }));
  D('sisip',       nat((arr, idx, val) => { if (!Array.isArray(arr)) throw new RuntimeError('Bukan array'); arr.splice(Number(idx), 0, val); return arr; }));
  D('hapus_indeks',nat((arr, idx) => { if (!Array.isArray(arr)) throw new RuntimeError('Bukan array'); arr.splice(Number(idx), 1); return arr; }));
  D('hapus_nilai', nat((arr, val) => { if (!Array.isArray(arr)) throw new RuntimeError('Bukan array'); const idx = arr.indexOf(val); if (idx >= 0) arr.splice(idx, 1); return arr; }));
  D('pop',         nat((arr) => { if (!Array.isArray(arr)) throw new RuntimeError('Bukan array'); return arr.pop(); }));
  D('pop_depan',   nat((arr) => { if (!Array.isArray(arr)) throw new RuntimeError('Bukan array'); return arr.shift(); }));
  D('salin',       nat((arr) => { if (!Array.isArray(arr)) throw new RuntimeError('Bukan array'); return [...arr]; }));
  D('salin_dalam', nat((v) => JSON.parse(JSON.stringify(v))));
  D('urutkan',     nat((arr, fn) => { if (!Array.isArray(arr)) throw new RuntimeError('Bukan array'); return [...arr].sort(fn ? (a,b) => Number(I.callNative(fn,[a,b])) : (a,b) => {if(typeof a==='string')return a.localeCompare(b);return Number(a)-Number(b);}); }));
  D('urutkan_turun',nat((arr) => { if (!Array.isArray(arr)) throw new RuntimeError('Bukan array'); return [...arr].sort((a,b) => typeof a==='string'?b.localeCompare(a):Number(b)-Number(a)); }));
  D('balik',       nat((arr) => { if (!Array.isArray(arr)) throw new RuntimeError('Bukan array'); return [...arr].reverse(); }));
  D('iris',        nat((arr, a, b) => { if (!Array.isArray(arr)) throw new RuntimeError('Bukan array'); return arr.slice(Number(a), b !== undefined ? Number(b) : undefined); }));
  D('gabung_arr',  nat((a, b) => { if (!Array.isArray(a)) throw new RuntimeError('Bukan array'); return [...a, ...(Array.isArray(b) ? b : [b])]; }));
  D('datar',       nat((arr, depth) => { if (!Array.isArray(arr)) throw new RuntimeError('Bukan array'); return arr.flat(depth !== undefined ? Number(depth) : 1); }));
  D('petakan',     nat((arr, fn) => { if (!Array.isArray(arr)) throw new RuntimeError('Bukan array'); return arr.map((v, i) => I.callNative(fn, [v, i])); }));
  D('saring',      nat((arr, fn) => { if (!Array.isArray(arr)) throw new RuntimeError('Bukan array'); return arr.filter((v, i) => I.toBool(I.callNative(fn, [v, i]))); }));
  D('reduksi',     nat((arr, fn, init) => { if (!Array.isArray(arr)) throw new RuntimeError('Bukan array'); return arr.reduce((acc, v) => I.callNative(fn, [acc, v]), init); }));
  D('cari_arr',    nat((arr, fn) => { if (!Array.isArray(arr)) throw new RuntimeError('Bukan array'); return arr.find(v => I.toBool(I.callNative(fn, [v]))) ?? null; }));
  D('cari_indeks', nat((arr, fn) => { if (!Array.isArray(arr)) throw new RuntimeError('Bukan array'); return arr.findIndex(v => I.toBool(I.callNative(fn, [v]))); }));
  D('ada_di',      nat((arr, val) => { if (!Array.isArray(arr)) return String(arr).includes(String(val)); return arr.includes(val); }));
  D('indeks_dari', nat((arr, val) => { if (!Array.isArray(arr)) throw new RuntimeError('Bukan array'); return arr.indexOf(val); }));
  D('semua',       nat((arr, fn) => { if (!Array.isArray(arr)) throw new RuntimeError('Bukan array'); return arr.every(v => I.toBool(I.callNative(fn, [v]))); }));
  D('sebagian',    nat((arr, fn) => { if (!Array.isArray(arr)) throw new RuntimeError('Bukan array'); return arr.some(v => I.toBool(I.callNative(fn, [v]))); }));
  D('unik',        nat((arr) => { if (!Array.isArray(arr)) throw new RuntimeError('Bukan array'); return [...new Set(arr)]; }));
  D('jumlah_arr',  nat((arr) => { if (!Array.isArray(arr)) throw new RuntimeError('Bukan array'); return arr.reduce((s, v) => s + Number(v), 0); }));
  D('rata_rata',   nat((arr) => { if (!Array.isArray(arr) || arr.length === 0) throw new RuntimeError('Array kosong atau bukan array'); return arr.reduce((s, v) => s + Number(v), 0) / arr.length; }));
  D('median',      nat((arr) => { if (!Array.isArray(arr) || arr.length === 0) throw new RuntimeError('Array kosong'); const s = [...arr].sort((a,b) => Number(a)-Number(b)); const m = Math.floor(s.length/2); return s.length%2 ? s[m] : (s[m-1]+s[m])/2; }));
  D('varians',     nat((arr) => { if (!Array.isArray(arr)) throw new RuntimeError('Bukan array'); const m = arr.reduce((s,v)=>s+Number(v),0)/arr.length; return arr.reduce((s,v)=>s+Math.pow(Number(v)-m,2),0)/arr.length; }));
  D('std_deviasi', nat((arr) => { if (!Array.isArray(arr)) throw new RuntimeError('Bukan array'); const m = arr.reduce((s,v)=>s+Number(v),0)/arr.length; return Math.sqrt(arr.reduce((s,v)=>s+Math.pow(Number(v)-m,2),0)/arr.length); }));
  D('zip',         nat((a, b) => { if (!Array.isArray(a)||!Array.isArray(b)) throw new RuntimeError('Bukan array'); return a.slice(0,Math.min(a.length,b.length)).map((v,i)=>[v,b[i]]); }));
  D('rentang',     nat((start, end, step) => { start=Number(start);end=Number(end);step=step!==undefined?Number(step):(start<=end?1:-1); const r=[]; for(let i=start;step>0?i<end:i>end;i+=step)r.push(i); return r; }));
  D('chunk',       nat((arr, n) => { if (!Array.isArray(arr)) throw new RuntimeError('Bukan array'); const r=[]; for(let i=0;i<arr.length;i+=n)r.push(arr.slice(i,i+n)); return r; }));
  D('kali_silang', nat((a, b) => { if (!Array.isArray(a)||!Array.isArray(b)) throw new RuntimeError('Bukan array'); return a.flatMap(v=>b.map(w=>[v,w])); }));
  D('gabung_dengan',nat((arr, sep) => { if (!Array.isArray(arr)) throw new RuntimeError('Bukan array'); return arr.map(v=>I.stringify(v)).join(String(sep||'')); }));
  D('isi_arr',     nat((arr, val) => { if (!Array.isArray(arr)) throw new RuntimeError('Bukan array'); arr.fill(val); return arr; }));
  D('tukar',       nat((arr, i, j) => { if (!Array.isArray(arr)) throw new RuntimeError('Bukan array'); const tmp=arr[Number(i)]; arr[Number(i)]=arr[Number(j)]; arr[Number(j)]=tmp; return arr; }));

  // Array/koleksi tambahan — grouping, partition, windowing, set-ops, transformasi
  D('kelompokkan', nat((arr, fn) => {
    if (!Array.isArray(arr)) throw new RuntimeError('Bukan array');
    const m = new Map();
    arr.forEach((v, i) => { const k = I.callNative(fn, [v, i]); if (!m.has(k)) m.set(k, []); m.get(k).push(v); });
    return m;
  }));
  D('pisah_dua',   nat((arr, fn) => {
    if (!Array.isArray(arr)) throw new RuntimeError('Bukan array');
    const a = [], b = [];
    arr.forEach((v, i) => { (I.toBool(I.callNative(fn, [v, i])) ? a : b).push(v); });
    return [a, b];
  }));
  D('jendela',     nat((arr, n) => { if (!Array.isArray(arr)) throw new RuntimeError('Bukan array'); n = Number(n); const r = []; for (let i = 0; i + n <= arr.length; i++) r.push(arr.slice(i, i + n)); return r; }));
  D('putar_arr',   nat((arr, n) => { if (!Array.isArray(arr)) throw new RuntimeError('Bukan array'); n = ((Number(n) % arr.length) + arr.length) % (arr.length || 1); return [...arr.slice(n), ...arr.slice(0, n)]; }));
  D('acak_urutan', nat((arr) => { if (!Array.isArray(arr)) throw new RuntimeError('Bukan array'); const r = [...arr]; for (let i = r.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [r[i], r[j]] = [r[j], r[i]]; } return r; }));
  D('ambil_acak',  nat((arr) => { if (!Array.isArray(arr) || !arr.length) throw new RuntimeError('Array kosong'); return arr[Math.floor(Math.random() * arr.length)]; }));
  D('irisan_arr',  nat((a, b) => { if (!Array.isArray(a) || !Array.isArray(b)) throw new RuntimeError('Bukan array'); const setB = new Set(b); return [...new Set(a)].filter(v => setB.has(v)); }));
  D('gabungan_arr',nat((a, b) => { if (!Array.isArray(a) || !Array.isArray(b)) throw new RuntimeError('Bukan array'); return [...new Set([...a, ...b])]; }));
  D('selisih_arr', nat((a, b) => { if (!Array.isArray(a) || !Array.isArray(b)) throw new RuntimeError('Bukan array'); const setB = new Set(b); return [...new Set(a)].filter(v => !setB.has(v)); }));
  D('simetris_arr',nat((a, b) => { if (!Array.isArray(a) || !Array.isArray(b)) throw new RuntimeError('Bukan array'); const setA = new Set(a), setB = new Set(b); return [...new Set([...a, ...b])].filter(v => setA.has(v) !== setB.has(v)); }));
  D('adalah_subset',nat((a, b) => { if (!Array.isArray(a) || !Array.isArray(b)) throw new RuntimeError('Bukan array'); const setB = new Set(b); return a.every(v => setB.has(v)); }));
  D('hitung_kemunculan_arr', nat((arr, val) => { if (!Array.isArray(arr)) throw new RuntimeError('Bukan array'); return arr.filter(v => v === val).length; }));
  D('frekuensi_arr', nat((arr) => { if (!Array.isArray(arr)) throw new RuntimeError('Bukan array'); const m = new Map(); for (const v of arr) m.set(v, (m.get(v) || 0) + 1); return m; }));
  D('kompak',      nat((arr) => { if (!Array.isArray(arr)) throw new RuntimeError('Bukan array'); return arr.filter(v => v !== null && v !== undefined && v !== false && v !== 0 && v !== ''); }));
  D('rata_kolom',  nat((arr2d) => { if (!Array.isArray(arr2d) || !arr2d.length) throw new RuntimeError('Array 2D kosong'); const cols = arr2d[0].length; const sums = new Array(cols).fill(0); arr2d.forEach(row => row.forEach((v, i) => sums[i] += Number(v))); return sums.map(s => s / arr2d.length); }));
  D('transpos',    nat((arr2d) => { if (!Array.isArray(arr2d) || !arr2d.length) throw new RuntimeError('Array 2D kosong'); return arr2d[0].map((_, c) => arr2d.map(row => row[c])); }));
  D('arr_ke_peta', nat((arr, fnKey, fnVal) => { if (!Array.isArray(arr)) throw new RuntimeError('Bukan array'); const m = new Map(); arr.forEach((v, i) => m.set(I.callNative(fnKey, [v, i]), fnVal ? I.callNative(fnVal, [v, i]) : v)); return m; }));
  D('terakhir',    nat((arr) => { if (!Array.isArray(arr)) throw new RuntimeError('Bukan array'); return arr.length ? arr[arr.length - 1] : null; }));
  D('pertama',     nat((arr) => { if (!Array.isArray(arr)) throw new RuntimeError('Bukan array'); return arr.length ? arr[0] : null; }));
  D('ambil_n',     nat((arr, n) => { if (!Array.isArray(arr)) throw new RuntimeError('Bukan array'); return arr.slice(0, Number(n)); }));
  D('ambil_n_akhir', nat((arr, n) => { if (!Array.isArray(arr)) throw new RuntimeError('Bukan array'); return arr.slice(-Number(n)); }));
  D('lewati_n',    nat((arr, n) => { if (!Array.isArray(arr)) throw new RuntimeError('Bukan array'); return arr.slice(Number(n)); }));
  D('urutkan_berdasarkan', nat((arr, fn) => { if (!Array.isArray(arr)) throw new RuntimeError('Bukan array'); return [...arr].sort((a, b) => { const ka = I.callNative(fn, [a]), kb = I.callNative(fn, [b]); return ka < kb ? -1 : ka > kb ? 1 : 0; }); }));
  D('hitung_jika', nat((arr, fn) => { if (!Array.isArray(arr)) throw new RuntimeError('Bukan array'); return arr.filter((v, i) => I.toBool(I.callNative(fn, [v, i]))).length; }));
  D('untuk_setiap', nat((arr, fn) => { if (!Array.isArray(arr)) throw new RuntimeError('Bukan array'); arr.forEach((v, i) => I.callNative(fn, [v, i])); return null; }));
  D('array_sama',  nat((a, b) => { if (!Array.isArray(a) || !Array.isArray(b)) return false; if (a.length !== b.length) return false; return a.every((v, i) => v === b[i]); }));

  // ════════════════════════════════════════════════════════════
  // PETA / HIMPUNAN — Map & Set Extras
  // ════════════════════════════════════════════════════════════
  D('peta_ke_arr',  nat((m) => { if (!(m instanceof Map)) throw new RuntimeError('Bukan peta'); return Array.from(m.entries()).map(([k, v]) => [k, v]); }));
  D('peta_kunci',   nat((m) => { if (!(m instanceof Map)) throw new RuntimeError('Bukan peta'); return Array.from(m.keys()); }));
  D('peta_nilai',   nat((m) => { if (!(m instanceof Map)) throw new RuntimeError('Bukan peta'); return Array.from(m.values()); }));
  D('peta_gabung',  nat((a, b) => { if (!(a instanceof Map) || !(b instanceof Map)) throw new RuntimeError('Bukan peta'); return new Map([...a, ...b]); }));

  // ════════════════════════════════════════════════════════════
  // PETA — Map/Dictionary Operations
  // ════════════════════════════════════════════════════════════
  D('buat_peta',     nat(() => new Map()));
  D('set_peta',      nat((m, k, v) => { if (!(m instanceof Map)) throw new RuntimeError('Bukan peta'); m.set(k, v); return m; }));
  D('get_peta',      nat((m, k, def) => { if (!(m instanceof Map)) throw new RuntimeError('Bukan peta'); return m.has(k) ? m.get(k) : (def !== undefined ? def : null); }));
  D('hapus_peta',    nat((m, k) => { if (!(m instanceof Map)) throw new RuntimeError('Bukan peta'); m.delete(k); return m; }));
  D('ada_kunci',     nat((m, k) => { if (!(m instanceof Map)) throw new RuntimeError('Bukan peta'); return m.has(k); }));
  D('kunci_peta',    nat((m) => { if (!(m instanceof Map)) throw new RuntimeError('Bukan peta'); return [...m.keys()]; }));
  D('nilai_peta',    nat((m) => { if (!(m instanceof Map)) throw new RuntimeError('Bukan peta'); return [...m.values()]; }));
  D('panjang_peta',  nat((m) => { if (!(m instanceof Map)) { if (typeof m==='object'&&m!==null) return Object.keys(m).length; throw new RuntimeError('Bukan peta'); } return m.size; }));
  D('bersihkan_peta',nat((m) => { if (!(m instanceof Map)) throw new RuntimeError('Bukan peta'); m.clear(); return m; }));
  D('peta_ke_obj',   nat((m) => { if (!(m instanceof Map)) throw new RuntimeError('Bukan peta'); const o={}; m.forEach((v,k)=>o[k]=v); return o; }));
  D('obj_ke_peta',   nat((o) => { const m = new Map(); for (const k of Object.keys(o)) m.set(k,o[k]); return m; }));

  // ════════════════════════════════════════════════════════════
  // HIMPUNAN — Set Operations
  // ════════════════════════════════════════════════════════════
  D('buat_himpunan',   nat((...args) => new Set(args.flat())));
  D('tambah_himpunan', nat((s, v) => { if (!(s instanceof Set)) throw new RuntimeError('Bukan himpunan'); s.add(v); return s; }));
  D('hapus_himpunan',  nat((s, v) => { if (!(s instanceof Set)) throw new RuntimeError('Bukan himpunan'); s.delete(v); return s; }));
  D('ada_himpunan',    nat((s, v) => { if (!(s instanceof Set)) throw new RuntimeError('Bukan himpunan'); return s.has(v); }));
  D('irisan',          nat((a, b) => { if (!(a instanceof Set)||!(b instanceof Set)) throw new RuntimeError('Bukan himpunan'); return new Set([...a].filter(x=>b.has(x))); }));
  D('gabungan_him',    nat((a, b) => { if (!(a instanceof Set)||!(b instanceof Set)) throw new RuntimeError('Bukan himpunan'); return new Set([...a,...b]); }));
  D('selisih_him',     nat((a, b) => { if (!(a instanceof Set)||!(b instanceof Set)) throw new RuntimeError('Bukan himpunan'); return new Set([...a].filter(x=>!b.has(x))); }));
  D('himpunan_ke_arr', nat((s) => { if (!(s instanceof Set)) throw new RuntimeError('Bukan himpunan'); return [...s]; }));

  // ════════════════════════════════════════════════════════════
  // TIPE / TYPE CHECKING
  // ════════════════════════════════════════════════════════════
  D('tipe_dari',    nat((v) => {
    if (v === null || v === undefined) return 'kosong';
    if (v instanceof Map) return 'peta';
    if (v instanceof Set) return 'himpunan';
    if (Array.isArray(v)) return 'arr[' + v.length + ']';
    if (typeof v === 'object' && v.__struct) return 'bentuk:' + v.__struct;
    if (typeof v === 'object' && v.__class) return 'kelas:' + v.__class;
    if (typeof v === 'object' && v.type === 'function') return 'gas:' + v.name;
    if (typeof v === 'object' && v.type === 'native') return 'gas_bawaan';
    if (typeof v === 'number') return Number.isInteger(v) ? 'angka' : 'desimal';
    if (typeof v === 'string') return 'kata';
    if (typeof v === 'boolean') return 'iyaGak';
    return typeof v;
  }));
  D('adalah_bil',    nat((v) => typeof v === 'number' && Number.isInteger(v)));
  D('adalah_des',    nat((v) => typeof v === 'number' && !Number.isInteger(v)));
  D('adalah_angka',  nat((v) => typeof v === 'number'));
  D('adalah_teks',   nat((v) => typeof v === 'string'));
  D('adalah_bool',   nat((v) => typeof v === 'boolean'));
  D('adalah_arr',    nat((v) => Array.isArray(v)));
  D('adalah_peta',   nat((v) => v instanceof Map));
  D('adalah_himpunan',nat((v) => v instanceof Set));
  D('adalah_null',   nat((v) => v === null || v === undefined));
  D('adalah_fn',     nat((v) => v && (v.type === 'function' || v.type === 'native' || typeof v === 'function')));
  D('adalah_obj',    nat((v) => v !== null && typeof v === 'object' && !Array.isArray(v)));
  D('adalah_nan',    nat((v) => typeof v === 'number' && isNaN(v)));
  D('adalah_terbatas',nat((v) => typeof v === 'number' && isFinite(v)));

  // ════════════════════════════════════════════════════════════
  // KONVERSI ANGKA
  // ════════════════════════════════════════════════════════════
  D('ke_biner',      nat((v) => (Number(v) >>> 0).toString(2)));
  D('ke_hex',        nat((v) => (Number(v) >>> 0).toString(16)));
  D('ke_oktal',      nat((v) => (Number(v) >>> 0).toString(8)));
  D('dari_biner',    nat((s) => parseInt(String(s), 2)));
  D('dari_hex',      nat((s) => parseInt(String(s), 16)));
  D('dari_oktal',    nat((s) => parseInt(String(s), 8)));
  D('dari_basis',    nat((s, base) => parseInt(String(s), Number(base))));
  D('ke_basis',      nat((n, base) => (Number(n) >>> 0).toString(Number(base))));

  // ════════════════════════════════════════════════════════════
  // WAKTU — Time & Date
  // ════════════════════════════════════════════════════════════
  D('waktu_ms',    nat(() => Date.now()));
  D('waktu_detik', nat(() => Math.floor(Date.now() / 1000)));
  D('tanggal',     nat(() => new Date().toLocaleDateString('id-ID')));
  D('jam',         nat(() => new Date().toLocaleTimeString('id-ID')));
  D('waktu_teks',  nat(() => new Date().toLocaleString('id-ID')));
  D('tunda',       nat((ms) => new Promise(r => setTimeout(r, Number(ms)))));
  D('ukur_waktu',  nat((fn) => { const t0 = performance.now(); I.callNative(fn, []); return performance.now() - t0; }));

  // Waktu/tanggal tambahan — komponen tanggal, aritmatika tanggal, format ISO, stopwatch
  D('tahun_ini',    nat(() => new Date().getFullYear()));
  D('bulan_ini',    nat(() => new Date().getMonth() + 1));
  D('hari_ini',     nat(() => new Date().getDate()));
  D('hari_minggu',  nat(() => new Date().getDay()));
  D('jam_ini',      nat(() => new Date().getHours()));
  D('menit_ini',    nat(() => new Date().getMinutes()));
  D('detik_ini',    nat(() => new Date().getSeconds()));
  D('waktu_iso',    nat(() => new Date().toISOString()));
  D('dari_waktu_ms',nat((ms) => new Date(Number(ms)).toLocaleString('id-ID')));
  D('buat_tanggal', nat((y, m, d, h, mi, s) => new Date(Number(y), Number(m) - 1, Number(d), h !== undefined ? Number(h) : 0, mi !== undefined ? Number(mi) : 0, s !== undefined ? Number(s) : 0).getTime()));
  D('tambah_hari',  nat((ms, n) => { const d = new Date(Number(ms)); d.setDate(d.getDate() + Number(n)); return d.getTime(); }));
  D('tambah_jam',   nat((ms, n) => Number(ms) + Number(n) * 3600000));
  D('tambah_menit', nat((ms, n) => Number(ms) + Number(n) * 60000));
  D('tambah_detik', nat((ms, n) => Number(ms) + Number(n) * 1000));
  D('selisih_hari', nat((ms1, ms2) => Math.floor((Number(ms1) - Number(ms2)) / 86400000)));
  D('selisih_detik',nat((ms1, ms2) => Math.floor((Number(ms1) - Number(ms2)) / 1000)));
  D('adalah_tahun_kabisat', nat((y) => { y = Number(y); return (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0; }));
  D('nama_hari',    nat((ms) => ['Minggu','Senin','Selasa','Rabu','Kamis','Jumat','Sabtu'][new Date(Number(ms)).getDay()]));
  D('nama_bulan',   nat((ms) => ['Januari','Februari','Maret','April','Mei','Juni','Juli','Agustus','September','Oktober','November','Desember'][new Date(Number(ms)).getMonth()]));
  D('format_tanggal', nat((ms, fmt) => {
    const d = new Date(Number(ms));
    const pad = (n) => String(n).padStart(2, '0');
    return String(fmt).replace('YYYY', d.getFullYear()).replace('MM', pad(d.getMonth() + 1)).replace('DD', pad(d.getDate()))
      .replace('HH', pad(d.getHours())).replace('mm', pad(d.getMinutes())).replace('ss', pad(d.getSeconds()));
  }));
  D('mulai_stopwatch', nat(() => performance.now()));
  D('selesai_stopwatch', nat((t0) => performance.now() - Number(t0)));

  // ════════════════════════════════════════════════════════════
  // FILE I/O — File System (hanya tersedia di Node.js)
  // ════════════════════════════════════════════════════════════
  const _requireFs = () => { if (!_fs) throw new RuntimeError('Operasi file hanya didukung saat NusaKids dijalankan di Node.js, bukan di browser'); return _fs; };
  D('baca_file',      nat((path) => { const fs = _requireFs(); try { return fs.readFileSync(String(path), 'utf8'); } catch (e) { throw new RuntimeError(`Gagal membaca file '${path}': ${e.message}`); } }));
  D('tulis_file',     nat((path, isi) => { const fs = _requireFs(); try { fs.writeFileSync(String(path), I.stringify(isi)); return true; } catch (e) { throw new RuntimeError(`Gagal menulis file '${path}': ${e.message}`); } }));
  D('tambah_file',    nat((path, isi) => { const fs = _requireFs(); try { fs.appendFileSync(String(path), I.stringify(isi)); return true; } catch (e) { throw new RuntimeError(`Gagal menambah file '${path}': ${e.message}`); } }));
  D('hapus_file',     nat((path) => { const fs = _requireFs(); try { fs.unlinkSync(String(path)); return true; } catch (e) { throw new RuntimeError(`Gagal menghapus file '${path}': ${e.message}`); } }));
  D('file_ada',       nat((path) => { const fs = _requireFs(); return fs.existsSync(String(path)); }));
  D('baca_baris_file',nat((path) => { const fs = _requireFs(); try { return fs.readFileSync(String(path), 'utf8').split('\n'); } catch (e) { throw new RuntimeError(`Gagal membaca file '${path}': ${e.message}`); } }));
  D('buat_folder',    nat((path) => { const fs = _requireFs(); try { fs.mkdirSync(String(path), { recursive: true }); return true; } catch (e) { throw new RuntimeError(`Gagal membuat folder '${path}': ${e.message}`); } }));
  D('daftar_folder',  nat((path) => { const fs = _requireFs(); try { return fs.readdirSync(String(path)); } catch (e) { throw new RuntimeError(`Gagal membaca folder '${path}': ${e.message}`); } }));
  D('ukuran_file',    nat((path) => { const fs = _requireFs(); try { return fs.statSync(String(path)).size; } catch (e) { throw new RuntimeError(`Gagal membaca info file '${path}': ${e.message}`); } }));
  D('salin_file',     nat((src, dst) => { const fs = _requireFs(); try { fs.copyFileSync(String(src), String(dst)); return true; } catch (e) { throw new RuntimeError(`Gagal menyalin file: ${e.message}`); } }));

  // ════════════════════════════════════════════════════════════
  // UTILITAS — Debug & Assert
  // ════════════════════════════════════════════════════════════
  D('pernyataan',  nat((cond, msg) => {
    if (!I.toBool(cond)) throw new RuntimeError('PERNYATAAN GAGAL: ' + (msg || 'kondisi salah'));
    return null;
  }));
  D('panic',       nat((msg) => { throw new RuntimeError('PANIC: ' + I.stringify(msg)); }));

  // Assertion khusus dipakai di dalam blok 'tes' -- ngelempar TestFailError
  // (beda dari RuntimeError biasa) supaya runner tes bisa bedain "tes ini
  // emang gagal" dari "ada error lain yang gak disengaja".
  D('pastikan', nat((cond, pesan) => {
    if (!I.toBool(cond)) {
      throw new TestFailError(pesan ? I.stringify(pesan) : 'pastikan() gagal — kondisinya salah');
    }
    return null;
  }));
  D('harusSama', nat((hasil, diharapkan, pesan) => {
    const sama = I.stringify(hasil) === I.stringify(diharapkan) ||
      (typeof hasil === 'number' && typeof diharapkan === 'number' && hasil === diharapkan);
    if (!sama) {
      const info = `nilai beda — dapat: ${I.stringify(hasil)}, diharapkan: ${I.stringify(diharapkan)}`;
      throw new TestFailError(pesan ? `${I.stringify(pesan)} (${info})` : info);
    }
    return null;
  }));
  D('coba_tangkap',nat((fn, handler) => {
    try { return I.callNative(fn, []); }
    catch (e) { return handler ? I.callNative(handler, [I.stringify(e.message)]) : null; }
  }));
  D('tampilkan',   nat((v) => { I.outputFn(I.inspect(v) + '\n'); return null; }));
  D('baca_obj',    nat((json) => { try { return JSON.parse(String(json)); } catch(e) { throw new RuntimeError('JSON tidak valid: ' + e.message); } }));
  D('tulis_obj',   nat((v, indent) => { try { return JSON.stringify(v, null, indent !== undefined ? Number(indent) : undefined); } catch(e) { throw new RuntimeError('Gagal serialisasi: ' + e.message); } }));

  // ════════════════════════════════════════════════════════════
  // FUNGSI TINGKAT TINGGI — Higher Order Functions
  // ════════════════════════════════════════════════════════════
  D('komposisi',   nat((...fns) => nat((x) => fns.reduceRight((acc, fn) => I.callNative(fn, [acc]), x), 'komposisi')));
  D('kari',        nat((fn) => nat((x) => nat((y) => I.callNative(fn, [x, y]), 'kari_dalam'), 'kari')));
  D('ulangi_fn',   nat((fn, n) => { for (let i = 0; i < Number(n); i++) I.callNative(fn, [i]); return null; }));
  D('pipa',        nat((val, ...fns) => fns.reduce((acc, fn) => I.callNative(fn, [acc]), val)));
  D('sekali',      nat((fn) => { let called=false, result=null; return nat(() => { if (!called) { called=true; result=I.callNative(fn,[]); } return result; },'sekali'); }));
  D('memo',        nat((fn) => { const cache=new Map(); return nat((...args) => { const k=JSON.stringify(args); if(cache.has(k))return cache.get(k); const r=I.callNative(fn,args); cache.set(k,r); return r; },'memo'); }));

  // ════════════════════════════════════════════════════════════
  // BITS — Bit Manipulation
  // ════════════════════════════════════════════════════════════
  D('bit_set',    nat((n, pos) => (Number(n) | 0) | (1 << Number(pos))));
  D('bit_hapus',  nat((n, pos) => (Number(n) | 0) & ~(1 << Number(pos))));
  D('bit_balik',  nat((n, pos) => (Number(n) | 0) ^ (1 << Number(pos))));
  D('bit_cek',    nat((n, pos) => Boolean((Number(n) | 0) & (1 << Number(pos)))));
  D('popcount',   nat((n) => { let x = (Number(n) >>> 0); let c = 0; while (x) { c += x & 1; x >>= 1; } return c; }));
  D('leading_zeros',nat((n) => Math.clz32(Number(n) >>> 0)));
  D('rotasi_kiri', nat((n, s) => { const x = Number(n) >>> 0; s = Number(s) & 31; return ((x << s) | (x >>> (32 - s))) >>> 0; }));
  D('rotasi_kanan',nat((n, s) => { const x = Number(n) >>> 0; s = Number(s) & 31; return ((x >>> s) | (x << (32 - s))) >>> 0; }));

  // ════════════════════════════════════════════════════════════
  // OBJEK — Object Utilities
  // ════════════════════════════════════════════════════════════
  D('kunci_obj',   nat((o) => { if (o instanceof Map) return [...o.keys()]; if (typeof o==='object'&&o!==null) return Object.keys(o); throw new RuntimeError('Bukan objek/peta'); }));
  D('nilai_obj',   nat((o) => { if (o instanceof Map) return [...o.values()]; if (typeof o==='object'&&o!==null) return Object.values(o); throw new RuntimeError('Bukan objek/peta'); }));
  D('entri_obj',   nat((o) => { if (o instanceof Map) return [...o.entries()]; if (typeof o==='object'&&o!==null) return Object.entries(o); throw new RuntimeError('Bukan objek/peta'); }));
  D('gabung_obj',  nat((...objs) => Object.assign({}, ...objs)));
  D('hapus_field', nat((o, k) => { if (typeof o==='object'&&o!==null) delete o[String(k)]; return o; }));
  D('ada_field',   nat((o, k) => { if (o instanceof Map) return o.has(k); if (typeof o==='object'&&o!==null) return String(k) in o; return false; }));
  D('get_field',   nat((o, k) => { if (o instanceof Map) return o.get(k); if (typeof o==='object'&&o!==null) return o[String(k)]; return null; }));
  D('set_field',   nat((o, k, v) => { if (o instanceof Map) { o.set(k,v); return o; } if (typeof o==='object'&&o!==null) { o[String(k)]=v; return o; } throw new RuntimeError('Bukan objek'); }));

  // ════════════════════════════════════════════════════════════
  // SISTEM — System
  // ════════════════════════════════════════════════════════════
  D('keluar',      nat((code) => { throw new RuntimeError('Program keluar dengan kode ' + (code !== undefined ? Number(code) : 0)); }));
  D('versi',       nat(() => 'NusaKids v1.0'));
  D('platform',    nat(() => (typeof navigator !== 'undefined' ? navigator.userAgent : 'Node.js')));
  D('lingkungan',  nat(() => (typeof window !== 'undefined' ? 'browser' : 'node')));

  // ════════════════════════════════════════════════════════════
  // SORTING ALGORITHMS
  // ════════════════════════════════════════════════════════════
  D('quick_sort',  nat((arr) => {
    if (!Array.isArray(arr)) throw new RuntimeError('Bukan array');
    function qs(a) { if (a.length <= 1) return a; const pivot = a[Math.floor(a.length/2)]; return [...qs(a.filter(x=>Number(x)<Number(pivot))), ...a.filter(x=>Number(x)===Number(pivot)), ...qs(a.filter(x=>Number(x)>Number(pivot)))]; }
    return qs([...arr]);
  }));
  D('merge_sort',  nat((arr) => {
    if (!Array.isArray(arr)) throw new RuntimeError('Bukan array');
    function ms(a) { if (a.length<=1) return a; const m=Math.floor(a.length/2); const [L,R]=[ms(a.slice(0,m)),ms(a.slice(m))]; const r=[]; let i=0,j=0; while(i<L.length&&j<R.length){if(Number(L[i])<=Number(R[j]))r.push(L[i++]);else r.push(R[j++]);} return [...r,...L.slice(i),...R.slice(j)]; }
    return ms([...arr]);
  }));
  D('binary_search',nat((arr, val) => {
    if (!Array.isArray(arr)) throw new RuntimeError('Bukan array');
    let lo=0, hi=arr.length-1; while(lo<=hi){const m=Math.floor((lo+hi)/2); if(arr[m]===val)return m; if(Number(arr[m])<Number(val))lo=m+1; else hi=m-1;} return -1;
  }));

  // ════════════════════════════════════════════════════════════
  // ALIAS AKRAB — nama gaul/singkat buat fungsi yang paling sering
  // dipakai pemula. Nama lama tetap ada (dipertahankan buat kompatibilitas
  // & buat yang udah kebiasaan gaya NusaLang) — keduanya nunjuk ke fungsi
  // yang sama persis, jadi bebas pilih mau pakai yang mana.
  // ════════════════════════════════════════════════════════════
  const alias = (namaBaru, namaLama) => D(namaBaru, env.get(namaLama));
  alias('bilang',       'cetak');
  alias('bilangln',     'cetakln');
  alias('bilangf',      'cetakf');
  alias('ke_kata',      'ke_teks');
  alias('ke_angka',     'ke_bil');
  alias('ke_desimal',   'ke_des');
  alias('panjang',      'pjg');
  alias('gede',         'maks');
  alias('kecil',        'min');
  alias('acak',         'acak_bil');
  alias('bulet',        'bulat');
  alias('cariDi',       'cari');
  alias('gantiJadi',    'ganti');
  alias('hurufBesar',   'huruf_besar');
  alias('hurufKecil',   'huruf_kecil');
  alias('acakUrutan',   'acak_urutan');
  alias('urutkanNaik',  'urutkan');
  alias('balikUrutan',  'balik');
  alias('tambahIn',     'tambah');
  alias('adaGak',       'ada_di');

  // ════════════════════════════════════════════════════════════
  // LAYAR — Grafis 2D dasar (hanya jalan di browser lewat <canvas>)
  // Host HTML wajib panggil window._NK_setupCanvas(canvasElement) dulu
  // sebelum program NusaKids memakai fungsi-fungsi ini. Di Node.js,
  // semua fungsi ini melempar error yang jelas (tidak crash diam-diam).
  // ════════════════════════════════════════════════════════════
  const _getCanvas = () => {
    if (typeof window === 'undefined' || !window._NK_CANVAS || !window._NK_CANVAS.ctx) {
      throw new RuntimeError('Layar belum siap. Panggil layar_siap(lebar, tinggi) dulu sebelum menggambar (fitur ini cuma jalan di browser)');
    }
    return window._NK_CANVAS;
  };

  D('layar_siap', nat((lebar, tinggi) => {
    if (typeof window === 'undefined' || !window._NK_prepareCanvas) {
      throw new RuntimeError('layar_siap() cuma bisa dipakai kalau NusaKids dijalankan di browser dengan elemen <canvas>');
    }
    window._NK_prepareCanvas(Number(lebar), Number(tinggi));
    return true;
  }));
  D('layar_lebar',  nat(() => _getCanvas().canvas.width));
  D('layar_tinggi', nat(() => _getCanvas().canvas.height));
  D('bersihkan_layar', nat((warna) => {
    const { ctx, canvas } = _getCanvas();
    if (warna !== undefined) { ctx.fillStyle = String(warna); ctx.fillRect(0, 0, canvas.width, canvas.height); }
    else ctx.clearRect(0, 0, canvas.width, canvas.height);
    return null;
  }));
  D('warna_isi',    nat((w) => { _getCanvas().ctx.fillStyle = String(w); return null; }));
  D('warna_garis',  nat((w) => { _getCanvas().ctx.strokeStyle = String(w); return null; }));
  D('tebal_garis',  nat((t) => { _getCanvas().ctx.lineWidth = Number(t); return null; }));
  D('gambar_kotak', nat((x, y, lebar, tinggi, warna) => {
    const { ctx } = _getCanvas();
    if (warna !== undefined) ctx.fillStyle = String(warna);
    ctx.fillRect(Number(x), Number(y), Number(lebar), Number(tinggi));
    return null;
  }));
  D('gambar_kotak_garis', nat((x, y, lebar, tinggi, warna) => {
    const { ctx } = _getCanvas();
    if (warna !== undefined) ctx.strokeStyle = String(warna);
    ctx.strokeRect(Number(x), Number(y), Number(lebar), Number(tinggi));
    return null;
  }));
  D('gambar_lingkaran', nat((x, y, jariJari, warna) => {
    const { ctx } = _getCanvas();
    if (warna !== undefined) ctx.fillStyle = String(warna);
    ctx.beginPath(); ctx.arc(Number(x), Number(y), Number(jariJari), 0, Math.PI * 2); ctx.fill();
    return null;
  }));
  D('gambar_lingkaran_garis', nat((x, y, jariJari, warna) => {
    const { ctx } = _getCanvas();
    if (warna !== undefined) ctx.strokeStyle = String(warna);
    ctx.beginPath(); ctx.arc(Number(x), Number(y), Number(jariJari), 0, Math.PI * 2); ctx.stroke();
    return null;
  }));
  D('gambar_garis', nat((x1, y1, x2, y2, warna) => {
    const { ctx } = _getCanvas();
    if (warna !== undefined) ctx.strokeStyle = String(warna);
    ctx.beginPath(); ctx.moveTo(Number(x1), Number(y1)); ctx.lineTo(Number(x2), Number(y2)); ctx.stroke();
    return null;
  }));
  D('gambar_teks', nat((teks, x, y, warna, ukuran) => {
    const { ctx } = _getCanvas();
    if (warna !== undefined) ctx.fillStyle = String(warna);
    ctx.font = `${ukuran !== undefined ? Number(ukuran) : 16}px sans-serif`;
    ctx.fillText(I.stringify(teks), Number(x), Number(y));
    return null;
  }));
  D('gambar_segitiga', nat((x1, y1, x2, y2, x3, y3, warna) => {
    const { ctx } = _getCanvas();
    if (warna !== undefined) ctx.fillStyle = String(warna);
    ctx.beginPath(); ctx.moveTo(Number(x1), Number(y1)); ctx.lineTo(Number(x2), Number(y2)); ctx.lineTo(Number(x3), Number(y3)); ctx.closePath(); ctx.fill();
    return null;
  }));

  // Input keyboard & mouse — dibaca dari state yang dikelola host HTML
  D('tombol_ditekan', nat((namaTombol) => {
    if (typeof window === 'undefined' || !window._NK_INPUT) return false;
    return !!window._NK_INPUT.keys[String(namaTombol)];
  }));
  D('mouse_x', nat(() => (typeof window !== 'undefined' && window._NK_INPUT) ? window._NK_INPUT.mouseX : 0));
  D('mouse_y', nat(() => (typeof window !== 'undefined' && window._NK_INPUT) ? window._NK_INPUT.mouseY : 0));
  D('mouse_ditekan', nat(() => (typeof window !== 'undefined' && window._NK_INPUT) ? !!window._NK_INPUT.mouseDown : false));

  // Game loop — panggil fn setiap frame (lewat requestAnimationFrame di browser)
  D('setiap_frame', nat((fn) => {
    if (typeof window === 'undefined' || !window.requestAnimationFrame) {
      throw new RuntimeError('setiap_frame() cuma bisa dipakai di browser');
    }
    let lastTime = performance.now();
    const loop = (now) => {
      if (window._NK_CANVAS && window._NK_CANVAS.stopped) return;
      const dt = (now - lastTime) / 1000; lastTime = now;
      I.callNative(fn, [dt]);
      window.requestAnimationFrame(loop);
    };
    window.requestAnimationFrame(loop);
    return null;
  }));
  D('berhenti_frame', nat(() => {
    if (typeof window !== 'undefined' && window._NK_CANVAS) window._NK_CANVAS.stopped = true;
    return null;
  }));

  // ─── Transformasi Canvas (rotate, scale, translate, simpan/pulihkan state) ───
  D('simpan_transformasi', nat(() => { _getCanvas().ctx.save(); return null; }));
  D('pulihkan_transformasi', nat(() => { _getCanvas().ctx.restore(); return null; }));
  D('geser_titik_asal', nat((x, y) => { _getCanvas().ctx.translate(Number(x), Number(y)); return null; }));
  D('putar_derajat', nat((derajat) => { _getCanvas().ctx.rotate(Number(derajat) * Math.PI / 180); return null; }));
  D('putar_radian', nat((radian) => { _getCanvas().ctx.rotate(Number(radian)); return null; }));
  D('skalakan', nat((sx, sy) => { _getCanvas().ctx.scale(Number(sx), sy !== undefined ? Number(sy) : Number(sx)); return null; }));
  D('atur_transparansi', nat((alpha) => { _getCanvas().ctx.globalAlpha = Math.max(0, Math.min(1, Number(alpha))); return null; }));
  // Gambar dengan rotasi di titik tertentu, tanpa perlu simpan/pulihkan manual --
  // dipakai lewat: gambar_kotak_putar(x, y, lebar, tinggi, derajat, warna)
  D('gambar_kotak_putar', nat((x, y, lebar, tinggi, derajat, warna) => {
    const { ctx } = _getCanvas();
    ctx.save();
    ctx.translate(Number(x) + Number(lebar) / 2, Number(y) + Number(tinggi) / 2);
    ctx.rotate(Number(derajat) * Math.PI / 180);
    if (warna !== undefined) ctx.fillStyle = String(warna);
    ctx.fillRect(-Number(lebar) / 2, -Number(tinggi) / 2, Number(lebar), Number(tinggi));
    ctx.restore();
    return null;
  }));

  // ─── Sprite/Gambar (load PNG/JPG dari URL, gambar ke canvas) ───
  // Gambar dimuat async lewat Image() browser. Karena NusaKids interpreter
  // ini sinkron-per-statement, pemuatan gambar dipisah jadi dua langkah:
  // muat_gambar() mendaftarkan gambar & mulai loading di background, lalu
  // gambar_siap() dipakai buat cek sebelum benar-benar menggambarnya (supaya
  // gak coba gambar sebelum file-nya selesai dimuat browser).
  const _images = new Map();
  D('muat_gambar', nat((namaId, url) => {
    if (typeof Image === 'undefined') throw new RuntimeError('muat_gambar() cuma bisa dipakai di browser');
    const img = new Image();
    const entry = { img, loaded: false, error: false };
    img.onload = () => { entry.loaded = true; };
    img.onerror = () => { entry.error = true; };
    img.src = String(url);
    _images.set(String(namaId), entry);
    return null;
  }));
  D('gambar_siap', nat((namaId) => { const e = _images.get(String(namaId)); return !!(e && e.loaded); }));
  D('gambar_gagal', nat((namaId) => { const e = _images.get(String(namaId)); return !!(e && e.error); }));
  D('gambar_sprite', nat((namaId, x, y, lebar, tinggi) => {
    const e = _images.get(String(namaId));
    if (!e) throw new RuntimeError(`Gambar '${namaId}' belum dimuat. Panggil muat_gambar("${namaId}", "url") dulu`);
    if (!e.loaded) return false; // belum selesai load, diam-diam skip gambar (bukan error, biar game loop gak berhenti nunggu)
    const { ctx } = _getCanvas();
    if (lebar !== undefined && tinggi !== undefined) ctx.drawImage(e.img, Number(x), Number(y), Number(lebar), Number(tinggi));
    else ctx.drawImage(e.img, Number(x), Number(y));
    return true;
  }));
  D('gambar_sprite_potong', nat((namaId, sx, sy, sLebar, sTinggi, x, y, lebar, tinggi) => {
    // Buat sprite sheet: ambil potongan (sx,sy,sLebar,sTinggi) dari gambar
    // sumber, gambar ke posisi (x,y) dengan ukuran (lebar,tinggi).
    const e = _images.get(String(namaId));
    if (!e) throw new RuntimeError(`Gambar '${namaId}' belum dimuat. Panggil muat_gambar("${namaId}", "url") dulu`);
    if (!e.loaded) return false;
    const { ctx } = _getCanvas();
    ctx.drawImage(e.img, Number(sx), Number(sy), Number(sLebar), Number(sTinggi), Number(x), Number(y), Number(lebar), Number(tinggi));
    return true;
  }));
  D('lebar_gambar', nat((namaId) => { const e = _images.get(String(namaId)); return e && e.loaded ? e.img.naturalWidth : 0; }));
  D('tinggi_gambar', nat((namaId) => { const e = _images.get(String(namaId)); return e && e.loaded ? e.img.naturalHeight : 0; }));

  // ─── Deteksi Tabrakan (collision detection) ───
  D('tabrakan_kotak', nat((x1, y1, w1, h1, x2, y2, w2, h2) => {
    x1 = Number(x1); y1 = Number(y1); w1 = Number(w1); h1 = Number(h1);
    x2 = Number(x2); y2 = Number(y2); w2 = Number(w2); h2 = Number(h2);
    return x1 < x2 + w2 && x1 + w1 > x2 && y1 < y2 + h2 && y1 + h1 > y2;
  }));
  D('tabrakan_lingkaran', nat((x1, y1, r1, x2, y2, r2) => {
    x1 = Number(x1); y1 = Number(y1); r1 = Number(r1);
    x2 = Number(x2); y2 = Number(y2); r2 = Number(r2);
    const dx = x1 - x2, dy = y1 - y2;
    return Math.sqrt(dx * dx + dy * dy) < (r1 + r2);
  }));
  D('tabrakan_kotak_lingkaran', nat((kx, ky, kw, kh, lx, ly, lr) => {
    kx = Number(kx); ky = Number(ky); kw = Number(kw); kh = Number(kh);
    lx = Number(lx); ly = Number(ly); lr = Number(lr);
    const terdekatX = Math.max(kx, Math.min(lx, kx + kw));
    const terdekatY = Math.max(ky, Math.min(ly, ky + kh));
    const dx = lx - terdekatX, dy = ly - terdekatY;
    return (dx * dx + dy * dy) < (lr * lr);
  }));
  D('titik_dalam_kotak', nat((px, py, x, y, w, h) => {
    px = Number(px); py = Number(py); x = Number(x); y = Number(y); w = Number(w); h = Number(h);
    return px >= x && px <= x + w && py >= y && py <= y + h;
  }));
  D('titik_dalam_lingkaran', nat((px, py, cx, cy, r) => {
    px = Number(px); py = Number(py); cx = Number(cx); cy = Number(cy); r = Number(r);
    const dx = px - cx, dy = py - cy;
    return (dx * dx + dy * dy) < (r * r);
  }));

  // ─── Suara — efek suara & musik latar (Web Audio dasar lewat elemen <audio>) ───
  const _sounds = new Map();
  D('muat_suara', nat((namaId, url) => {
    if (typeof Audio === 'undefined') throw new RuntimeError('muat_suara() cuma bisa dipakai di browser');
    const audio = new Audio(String(url));
    const entry = { audio, loaded: false, error: false };
    audio.addEventListener('canplaythrough', () => { entry.loaded = true; }, { once: true });
    audio.addEventListener('error', () => { entry.error = true; });
    _sounds.set(String(namaId), entry);
    return null;
  }));
  D('suara_siap', nat((namaId) => { const e = _sounds.get(String(namaId)); return !!(e && e.loaded); }));
  D('mainkan_suara', nat((namaId, volume) => {
    const e = _sounds.get(String(namaId));
    if (!e) throw new RuntimeError(`Suara '${namaId}' belum dimuat. Panggil muat_suara("${namaId}", "url") dulu`);
    // Klon elemen audio supaya suara yang sama bisa tumpang-tindih (misal efek
    // tembakan berulang cepat) tanpa saling motong satu sama lain.
    const clone = e.audio.cloneNode();
    clone.volume = volume !== undefined ? Math.max(0, Math.min(1, Number(volume))) : 1;
    clone.play().catch(() => {}); // abaikan kalau browser block autoplay tanpa interaksi user
    return null;
  }));
  D('mainkan_musik', nat((namaId, volume, ulangTerus) => {
    const e = _sounds.get(String(namaId));
    if (!e) throw new RuntimeError(`Suara '${namaId}' belum dimuat. Panggil muat_suara("${namaId}", "url") dulu`);
    e.audio.volume = volume !== undefined ? Math.max(0, Math.min(1, Number(volume))) : 1;
    e.audio.loop = ulangTerus !== undefined ? !!ulangTerus : true;
    e.audio.currentTime = 0;
    e.audio.play().catch(() => {});
    return null;
  }));
  D('berhenti_musik', nat((namaId) => {
    const e = _sounds.get(String(namaId));
    if (e) { e.audio.pause(); e.audio.currentTime = 0; }
    return null;
  }));
  D('atur_volume', nat((namaId, volume) => {
    const e = _sounds.get(String(namaId));
    if (e) e.audio.volume = Math.max(0, Math.min(1, Number(volume)));
    return null;
  }));
}

if (typeof module !== 'undefined') {
  module.exports = { registerBuiltins };
} else {
  window._NK_BUILTINS = { registerBuiltins };
}
