/**
 * =============================================================================
 *  BAHASA NUSA — Contoh Program
 * =============================================================================
 *  Kumpulan contoh kode Nusa yang dipakai pada Playground interaktif untuk
 *  menunjukkan seluruh fitur bahasa: variabel, kontrol alur, fungsi/lambda,
 *  OOP, penanganan galat, dan operasi jaringan asinkron.
 * =============================================================================
 */

export interface NusaExample {
  id: string;
  judul: string;
  deskripsi: string;
  kode: string;
}

export const NUSA_EXAMPLES: NusaExample[] = [
  {
    id: "halo-dunia",
    judul: "01 · Halo, Dunia",
    deskripsi: "Variabel, konstanta, dan interpolasi teks",
    kode: `// Selamat datang di Bahasa Nusa 🇮🇩
// Ini adalah komentar baris. /* Ini komentar blok */

simpan nama = "Nusa";
tetap versi = 1.0;

tampilkan("Halo, dunia! Aku bahasa {nama} versi {versi}");

simpan a = 12;
simpan b = 8;
tampilkan("Hasil " + a + " + " + b + " = " + (a + b));
tampilkan("Hasil pangkat: {a} ^ 2 = {a ^ 2}");
tampilkan("Tipe dari nama adalah: " + jenis(nama));
`,
  },
  {
    id: "kondisi-perulangan",
    judul: "02 · Kondisi & Perulangan",
    deskripsi: "jika/lain, selama, ulang, dan untuk setiap",
    kode: `fungsi genapAtauGanjil(n) {
  jika (n % 2 == 0) {
    kembali "genap";
  } lain {
    kembali "ganjil";
  }
}

ulang (simpan i = 1; i <= 5; i = i + 1) {
  tampilkan("Angka {i} adalah {genapAtauGanjil(i)}");
}

simpan buah = ["apel", "jeruk", "mangga"];
untuk setiap nama, idx dari buah {
  tampilkan("Buah ke-{idx + 1}: {nama}");
}

simpan hitung = 0;
selama (hitung < 3) {
  tampilkan("Hitung: {hitung}");
  hitung = hitung + 1;
}
`,
  },
  {
    id: "fungsi-lambda",
    judul: "03 · Fungsi & Lambda",
    deskripsi: "Fungsi tingkat tinggi + pustaka Larik.*",
    kode: `fungsi terapkanDuaKali(f, x) {
  kembali f(f(x));
}

simpan kuadrat = x -> x * x;
tampilkan("Kuadrat dari 5 dua kali: {terapkanDuaKali(kuadrat, 5)}");

simpan angka = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];

simpan genap = Larik.saring(angka, n -> n % 2 == 0);
tampilkan("Bilangan genap: {genap}");

simpan kuadratSemua = Larik.petakan(angka, n -> n * n);
tampilkan("Kuadrat semua: {kuadratSemua}");

simpan total = Larik.lipat(angka, (akumulasi, n) -> akumulasi + n, 0);
tampilkan("Total semua angka: {total}");
`,
  },
  {
    id: "kelas-pewarisan",
    judul: "04 · Kelas & Pewarisan",
    deskripsi: "OOP: kelas, konstruktor, warisi, dan induk",
    kode: `kelas Hewan {
  fungsi konstruktor(nama, suara) {
    ini.nama = nama;
    ini.suara = suara;
  }
  fungsi kenalan() {
    kembali "Aku {ini.nama}, aku bisa berkata '{ini.suara}'";
  }
}

kelas Kucing warisi Hewan {
  fungsi konstruktor(nama) {
    induk(nama, "Meong");
  }
  fungsi kenalan() {
    kembali induk.kenalan() + " (seekor kucing)";
  }
}

simpan k = baru Kucing("Milo");
tampilkan(k.kenalan());

simpan h = baru Hewan("Kuda", "Ringkik");
tampilkan(h.kenalan());
`,
  },
  {
    id: "tangani-galat",
    judul: "05 · Penanganan Galat",
    deskripsi: "coba / tangkap / akhirnya / lempar",
    kode: `fungsi bagi(a, b) {
  jika (b == 0) {
    lempar "Tidak boleh membagi dengan nol!";
  }
  kembali a / b;
}

coba {
  tampilkan("10 / 2 = {bagi(10, 2)}");
  tampilkan("10 / 0 = {bagi(10, 0)}");
} tangkap (galat) {
  tampilkanGalat("Terjadi kesalahan: {galat}");
} akhirnya {
  tampilkan("Blok 'coba' selesai dijalankan.");
}
`,
  },
  {
    id: "async-jaringan",
    judul: "06 · Asinkron & Jaringan",
    deskripsi: "asinkron, tunggu, dan Jaringan.ambil (HTTP)",
    kode: `// Catatan: contoh ini butuh koneksi internet karena memanggil API publik sungguhan.
asinkron fungsi ambilData() {
  tampilkan("Mengambil data dari jaringan...");
  simpan respon = tunggu Jaringan.ambil("https://jsonplaceholder.typicode.com/todos/1");
  jika (respon.ok) {
    tampilkan("Status: {respon.status}");
    tampilkan("Judul tugas: {respon.json.title}");
  } lain {
    tampilkanGalat("Gagal mengambil data, status {respon.status}");
  }
}

ambilData();
tampilkan("Baris ini tetap berjalan berurutan setelah data selesai diambil.");
`,
  },
  {
    id: "struktur-data",
    judul: "07 · Objek & JSON",
    deskripsi: "Literal objek, namespace Objek.*, dan JSON.*",
    kode: `simpan mahasiswa = {
  nama: "Sekar",
  umur: 21,
  nilai: [88, 92, 79, 95]
};

tampilkan("Nama: {mahasiswa.nama}, Umur: {mahasiswa.umur}");
tampilkan("Rata-rata nilai: {Larik.jumlahkan(mahasiswa.nilai) / panjang(mahasiswa.nilai)}");

simpan teksJSON = JSON.keTeks(mahasiswa);
tampilkan("JSON: {teksJSON}");

simpan hasilParse = JSON.keObjek(teksJSON);
tampilkan("Nama dari hasil parse JSON: {hasilParse.nama}");
`,
  },
];
