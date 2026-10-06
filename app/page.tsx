import { redirect } from "next/navigation";

// Halaman utama tidak punya isi sendiri (pelanggan masuk lewat QR ke
// /r/[kode], owner & admin lewat /login). Dulu halaman ini masih template
// bawaan Next.js. Yang sudah login otomatis diteruskan ke dasbor oleh
// middleware begitu sampai di /login.
export default function Home() {
  redirect("/login");
}
