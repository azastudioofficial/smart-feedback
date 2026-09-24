// custom-worker.ts
// Worker kustom pengganti .open-next/worker.js sebagai entry point.
// Tetap memakai fetch handler bawaan Next.js (lewat OpenNext), tapi
// menambahkan scheduled() handler supaya Cloudflare Cron Triggers
// bisa memanggil endpoint /api/cron/cleanup secara otomatis - tanpa
// perlu layanan cron eksternal (cron-job.org dll).

// @ts-ignore `.open-next/worker.js` dihasilkan saat proses build
import { default as handler } from "./.open-next/worker.js";

export default {
  // Request HTTP biasa tetap ditangani seperti biasa oleh Next.js/OpenNext.
  fetch: handler.fetch,

  // Dipanggil otomatis oleh Cloudflare sesuai jadwal di wrangler.jsonc.
  async scheduled(event: any, env: any, ctx: any) {
    // Panggil endpoint cleanup SECARA INTERNAL (tanpa keluar ke internet),
    // pakai handler fetch yang sama - jadi tidak tergantung domain publik.
    const request = new Request("https://internal.local/api/cron/cleanup", {
      headers: {
        Authorization: `Bearer ${env.CRON_SECRET}`,
      },
    });

    ctx.waitUntil(
      handler
        .fetch(request, env, ctx)
        .then(async (res: Response) => {
          const body = await res.text();
          console.log(`[cron] status=${res.status} body=${body}`);
        })
        .catch((err: unknown) => {
          console.error("[cron] gagal jalankan cleanup:", err);
        })
    );
  },
}; 
