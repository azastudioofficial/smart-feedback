// app/syarat-ketentuan/page.tsx

export const runtime = "edge";

import type { CSSProperties } from "react";
import { darkenHex, lightenHex } from "@/lib/utils";

// Halaman ini dibuka lewat link dari activate-form.tsx dan belum
// terikat ke satu toko tertentu, jadi pakai warna default platform -
// sama seperti app/activate/[id]/page.tsx.
const DEFAULT_BRAND = "#0E7C86";

const SECTIONS = [
  { id: "s1", title: "Definisi Lisensi Lifetime" },
  { id: "s2", title: "Tanggung Jawab Konten & Larangan Penyalahgunaan" },
  { id: "s3", title: "Kebijakan Retensi & Penghapusan Data Aduan (30 Hari)" },
  { id: "s4", title: "Penyesuaian Biaya Operasional & Opsi Pengguna" },
  { id: "s5", title: "Batasan Tanggung Jawab Hukum" },
  { id: "s6", title: "Perubahan Kebijakan & Penghentian Layanan" },
  { id: "s7", title: "Kebijakan Privasi" },
];

const HEADING = { fontFamily: "var(--font-display)" };

function SectionHeading({ number, children }: { number: number; children: React.ReactNode }) {
  return (
    <h2
      className="flex items-center gap-3 text-lg font-bold text-[#132320]"
      style={HEADING}
    >
      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[var(--brand)]/10 text-sm text-[var(--brand)]">
        {number}
      </span>
      {children}
    </h2>
  );
}

export default function TermsPage() {
  const brandDark = darkenHex(DEFAULT_BRAND, 12);
  const brandTint = lightenHex(DEFAULT_BRAND, 94);

  return (
    <main
      className="min-h-screen bg-gradient-to-b from-[var(--brand-tint)] via-white to-white px-6 py-14 sm:py-16"
      style={
        {
          "--brand": DEFAULT_BRAND,
          "--brand-dark": brandDark,
          "--brand-tint": brandTint,
        } as CSSProperties
      }
    >
      <div className="mx-auto max-w-2xl">
        <p
          className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--brand)]"
          style={HEADING}
        >
          Dokumen Legal
        </p>
        <h1
          className="mt-1 text-3xl font-bold leading-tight text-[#132320]"
          style={HEADING}
        >
          Syarat &amp; Ketentuan Penggunaan Layanan
        </h1>
        <p className="mt-2 text-sm text-[#132320]/50">
          Terakhir diperbarui:{" "}
          {new Date().toLocaleDateString("id-ID", {
            year: "numeric",
            month: "long",
            day: "numeric",
          })}
        </p>

        {/* Daftar isi - bantu navigasi untuk dokumen yang cukup panjang */}
        <nav className="mt-8 rounded-2xl border border-black/[0.06] bg-white/70 p-5 shadow-sm backdrop-blur">
          <p className="text-[11px] font-semibold uppercase tracking-[0.1em] text-[#132320]/40">
            Daftar Isi
          </p>
          <ol className="mt-3 space-y-2">
            {SECTIONS.map((s, i) => (
              <li key={s.id}>
                <a
                  href={`#${s.id}`}
                  className="flex items-baseline gap-2 text-sm text-[#132320]/70 transition hover:text-[var(--brand)]"
                >
                  <span className="text-[#132320]/35">{i + 1}.</span>
                  {s.title}
                </a>
              </li>
            ))}
          </ol>
        </nav>

        <div className="mt-10 space-y-10 text-[15px] leading-relaxed text-[#132320]/75">
          <section id="s1" className="scroll-mt-8 space-y-3">
            <SectionHeading number={1}>
              Definisi Lisensi Lifetime
            </SectionHeading>
            <p>
              Pengertian &quot;Lifetime&quot; atau &quot;Akses Seumur
              Hidup&quot; merujuk pada masa aktif produk/layanan selama masih
              beroperasi dan dikembangkan oleh kami, bukan seumur hidup
              pembeli.
            </p>
            <p>
              Lisensi ini mencakup akses ke fitur-fitur yang tersedia pada
              versi utama produk saat pembelian dilakukan.
            </p>
          </section>

          <section id="s2" className="scroll-mt-8 space-y-3">
            <SectionHeading number={2}>
              Tanggung Jawab Konten &amp; Larangan Penyalahgunaan
            </SectionHeading>
            <p>
              <strong className="text-[#132320]">
                Tanggung Jawab Pengguna:
              </strong>{" "}
              Seluruh foto, gambar, teks, dan data yang diunggah ke dalam
              sistem adalah tanggung jawab penuh dari pengguna.
            </p>
            <p>
              <strong className="text-[#132320]">
                Larangan Penyalahgunaan:
              </strong>{" "}
              Pengguna dilarang keras mengunggah atau menggunakan data/foto
              yang mengandung unsur penipuan, pencemaran nama baik, melanggar
              hak cipta pihak lain, konten ilegal, atau pornografi.
            </p>
            <p>
              <strong className="text-[#132320]">Hak Penindakan:</strong>{" "}
              Kami berhak menonaktifkan akun, menghapus data, atau memblokir
              akses secara sepihak tanpa pengembalian dana (non-refundable)
              jika ditemukan indikasi penyalahgunaan foto/data oleh pengguna.
            </p>
          </section>

          <section id="s3" className="scroll-mt-8 space-y-3">
            <SectionHeading number={3}>
              Kebijakan Retensi &amp; Penghapusan Data Aduan (30 Hari)
            </SectionHeading>
            <p>
              <strong className="text-[#132320]">
                Penghapusan Otomatis:
              </strong>{" "}
              Untuk menjaga efisiensi sistem dan keamanan privasi, seluruh
              file foto, media, dan data lampiran aduan akan dihapus secara
              otomatis dan permanen oleh sistem setelah 30 hari sejak aduan
              dibuat/dikirim.
            </p>
            <p>
              <strong className="text-[#132320]">
                Tanggung Jawab Backup:
              </strong>{" "}
              Pengguna bertanggung jawab penuh untuk mengunduh atau menyalin
              data aduan yang diperlukan sebelum batas waktu 30 hari
              tersebut berakhir. Kami tidak bertanggung jawab atas
              kehilangan data aduan yang telah terhapus otomatis oleh
              sistem.
            </p>
          </section>

          <section id="s4" className="scroll-mt-8 space-y-3">
            <SectionHeading number={4}>
              Penyesuaian Biaya Operasional &amp; Opsi Pengguna
            </SectionHeading>
            <p>
              Lisensi sekali bayar (lifetime) hanya mencakup pemakaian fitur
              dasar aplikasi.
            </p>
            <p>
              <strong className="text-[#132320]">
                Tindakan Penyesuaian Darurat:
              </strong>{" "}
              Apabila terjadi kenaikan harga yang signifikan atau lonjakan
              beban pada infrastruktur pihak ketiga (hosting, database,
              domain, storage, atau API), kami berhak seketika itu juga
              melakukan penyesuaian fitur atau memberlakukan batas kuota
              (usage limit) demi menjaga keberlanjutan sistem.
            </p>
            <p>
              <strong className="text-[#132320]">
                Hak Pilih Pengguna (Opt-In / Opt-Out):
              </strong>{" "}
              Jika penyesuaian memerlukan biaya pemeliharaan (maintenance
              fee) atau skema baru, pengguna akan diberi pemberitahuan 14
              hingga 30 hari sebelumnya dan diberikan opsi untuk:
            </p>
            <ul className="list-disc space-y-1 pl-6">
              <li>
                <strong className="text-[#132320]">
                  Melanjutkan Layanan:
                </strong>{" "}
                Menyetujui skema pembayaran/kuota baru.
              </li>
              <li>
                <strong className="text-[#132320]">
                  Berhenti / Tidak Melanjutkan:
                </strong>{" "}
                Memilih untuk tidak melanjutkan, di mana pengguna diberikan
                masa tenggang untuk mendownload/mengamankan data pribadi
                sebelum akses akun dinonaktifkan.
              </li>
            </ul>
          </section>

          <section id="s5" className="scroll-mt-8 space-y-3">
            <SectionHeading number={5}>
              Batasan Tanggung Jawab Hukum
            </SectionHeading>
            <p>
              Kami bebas dari segala bentuk tuntutan hukum atas kerugian
              materiil maupun non-materiil yang timbul akibat penyalahgunaan
              foto, data, atau informasi yang diunggah oleh pengguna kepada
              pihak ketiga.
            </p>
            <p>
              Kami tidak bertanggung jawab atas gangguan layanan yang
              disebabkan oleh penyedia jasa infrastruktur pihak ketiga.
            </p>
          </section>

          <section id="s6" className="scroll-mt-8 space-y-3">
            <SectionHeading number={6}>
              Perubahan Kebijakan &amp; Penghentian Layanan
            </SectionHeading>
            <p>
              Kami berhak melakukan pembaruan atau penyesuaian fitur
              sewaktu-waktu demi keberlanjutan operasional aplikasi.
            </p>
            <p>
              Apabila di masa mendatang terjadi penghentian layanan secara
              total (End of Life), pengguna akan diberi pemberitahuan
              minimal 30 hari sebelumnya beserta akses khusus untuk
              mengunduh (export) seluruh data pribadi milik pengguna.
            </p>
          </section>

          <section
            id="s7"
            className="scroll-mt-8 space-y-3 border-t border-black/[0.06] pt-8"
          >
            <SectionHeading number={7}>Kebijakan Privasi</SectionHeading>
            <p>
              <strong className="text-[#132320]">
                Data yang kami kumpulkan:
              </strong>{" "}
              nama toko, link Google Review, nomor WhatsApp, email login,
              dan logo toko (kalau diunggah) untuk keperluan operasional
              layanan. Untuk pelanggan toko Anda: nama (opsional), isi
              keluhan, dan foto bukti (opsional) yang mereka kirimkan lewat
              halaman feedback.
            </p>
            <p>
              <strong className="text-[#132320]">
                Pihak ketiga yang memproses data:
              </strong>{" "}
              kami menggunakan Supabase (database &amp; autentikasi) dan
              Cloudinary (penyimpanan foto) sebagai penyedia infrastruktur.
              Data foto keluhan disimpan di Cloudinary dan otomatis dihapus
              mengikuti kebijakan retensi 30 hari di atas.
            </p>
            <p>
              <strong className="text-[#132320]">Akses data:</strong> data
              toko Anda hanya bisa diakses oleh Anda sendiri (lewat akun
              login Anda) dan admin platform untuk keperluan dukungan
              teknis atau penegakan Syarat &amp; Ketentuan di atas.
            </p>
          </section>
        </div>
      </div>
    </main>
  );
}
