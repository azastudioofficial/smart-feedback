// app/template.tsx
// Beda dengan layout.tsx, template.tsx dibuat ULANG setiap pindah
// halaman - jadi animasi CSS di bawah ini otomatis jalan di SEMUA
// halaman (login, dashboard, feedback, aktivasi, dst) tanpa perlu
// menyentuh file halaman satu per satu.

export default function Template({ children }: { children: React.ReactNode }) {
  return <div className="page-enter">{children}</div>;
}
