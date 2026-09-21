"use client";
// app/admin/master/reseller-manager.tsx

import { useEffect, useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { createReseller, listResellers } from "./actions";

type Reseller = { id: string; name: string; card_count: number };

const HEADING = { fontFamily: "var(--font-admin-heading)" };

export function ResellerManager() {
  const [resellers, setResellers] = useState<Reseller[]>([]);
  const [loadingList, setLoadingList] = useState(true);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  async function loadResellers() {
    setLoadingList(true);
    const result = await listResellers();
    setLoadingList(false);
    if (result.success && result.data) {
      setResellers(result.data);
    }
  }

  useEffect(() => {
    loadResellers();
  }, []);

  async function handleCreate(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setMessage(null);
    setCreating(true);

    const form = new FormData(e.currentTarget);
    const result = await createReseller(
      String(form.get("email") ?? ""),
      String(form.get("password") ?? ""),
      String(form.get("name") ?? "")
    );

    setCreating(false);

    if (!result.success) {
      setError(result.error ?? "Gagal membuat akun reseller.");
      return;
    }

    setMessage("Akun reseller berhasil dibuat.");
    (e.target as HTMLFormElement).reset();
    loadResellers();
  }

  return (
    <div className="rounded-2xl border border-black/[0.06] bg-white/70 p-6 shadow-sm backdrop-blur">
      <h2 className="text-lg font-extrabold text-[#132320]" style={HEADING}>
        Kelola Reseller
      </h2>
      <p className="mt-0.5 text-[13px] text-[#132320]/50">
        Buat akun reseller supaya mereka bisa approve/reject aktivasi
        tokonya sendiri lewat dasbor terpisah (/reseller).
      </p>

      <form onSubmit={handleCreate} className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-4">
        <Input
          name="name"
          placeholder="Nama reseller"
          required
          className="h-11 text-base"
        />
        <Input
          name="email"
          type="email"
          placeholder="Email login"
          required
          className="h-11 text-base"
        />
        <Input
          name="password"
          type="password"
          placeholder="Password"
          minLength={6}
          required
          className="h-11 text-base"
        />
        <Button
          type="submit"
          disabled={creating}
          className="h-11 bg-[#0E7C86] text-base hover:bg-[#0B5F67]"
        >
          {creating ? "Membuat..." : "Buat Akun"}
        </Button>
      </form>

      {message && <p className="mt-2 text-sm text-[#0E7C86]">{message}</p>}
      {error && <p className="mt-2 text-sm text-[#B5585E]">{error}</p>}

      <div className="mt-5 border-t border-black/[0.06] pt-4">
        {loadingList ? (
          <p className="text-sm text-[#132320]/50">Memuat daftar reseller...</p>
        ) : resellers.length === 0 ? (
          <p className="text-sm text-[#132320]/50">Belum ada reseller.</p>
        ) : (
          <ul className="space-y-2">
            {resellers.map((r) => (
              <li
                key={r.id}
                className="flex items-center justify-between rounded-lg bg-white px-4 py-3 text-sm"
              >
                <span className="font-medium text-[#132320]">{r.name}</span>
                <span className="text-[#132320]/50">
                  {r.card_count} kartu dialokasikan
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
