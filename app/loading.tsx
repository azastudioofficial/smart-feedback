// app/loading.tsx
// Tampil otomatis saat pindah ke halaman yang datanya masih diambil
// dari server (Supabase). Tanpa ini, layar terasa "diam" beberapa
// saat setelah klik. Sengaja minimalis: garis progres tipis di atas
// + latar netral, supaya tidak terasa berkedip.

export default function Loading() {
  return (
    <div className="min-h-screen bg-[#F6F8F7]" aria-busy="true">
      <div className="fixed inset-x-0 top-0 z-50 h-0.5 overflow-hidden bg-black/[0.04]">
        <div className="loading-bar h-full w-1/3 rounded-full bg-[#0E7C86]" />
      </div>
    </div>
  );
}
