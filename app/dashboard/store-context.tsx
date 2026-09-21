"use client";
// app/dashboard/store-context.tsx
//
// Sumber kebenaran SEMENTARA (di browser, 1 sesi/tab) untuk 3 hal yang
// owner bisa custom di tab Pengaturan: nama toko, logo, dan warna
// brand. Dipakai supaya begitu simpan berhasil, seluruh dashboard
// (sidebar, warna aksen --brand di mana-mana, tab Cetak QR) langsung
// ikut berubah - TANPA query ulang ke Supabase.
//
// Data AWAL tetap datang dari server (app/dashboard/page.tsx) supaya
// first paint selalu benar. Context ini cuma dipakai untuk update
// SETELAH itu, selama sesi browser yang sama masih terbuka.
//
// CATATAN: provider ini sengaja HANYA jadi "pembawa" context + CSS
// var --brand/--brand-dark, TIDAK lagi merender layout halaman
// (dulu ada <main> dengan padding/max-width) - karena sekarang
// <DashboardShell> (sidebar) yang jadi pemilik layout halaman
// penuh. Div polos di bawah cuma wadah supaya CSS var bisa "turun"
// ke semua komponen di dalamnya lewat cascade normal CSS.

import {
  createContext,
  useContext,
  useMemo,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";
import { darkenHex } from "@/lib/utils";

type StoreState = {
  businessName: string | null;
  logoUrl: string | null;
  brandColor: string;
};

type StoreContextValue = StoreState & {
  brandDark: string;
  updateStore: (patch: Partial<StoreState>) => void;
};

const StoreContext = createContext<StoreContextValue | null>(null);

export function useStore() {
  const ctx = useContext(StoreContext);
  if (!ctx) {
    throw new Error("useStore() harus dipanggil di dalam <StoreProvider>");
  }
  return ctx;
}

export function StoreProvider({
  initialBusinessName,
  initialLogoUrl,
  initialBrandColor,
  children,
}: {
  initialBusinessName: string | null;
  initialLogoUrl: string | null;
  initialBrandColor: string;
  children: ReactNode;
}) {
  const [state, setState] = useState<StoreState>({
    businessName: initialBusinessName,
    logoUrl: initialLogoUrl,
    brandColor: initialBrandColor,
  });

  function updateStore(patch: Partial<StoreState>) {
    setState((prev) => ({ ...prev, ...patch }));
  }

  const brandDark = useMemo(
    () => darkenHex(state.brandColor, 12),
    [state.brandColor]
  );

  const value = useMemo(
    () => ({ ...state, brandDark, updateStore }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [state, brandDark]
  );

  return (
    <StoreContext.Provider value={value}>
      <div
        style={
          {
            "--brand": state.brandColor,
            "--brand-dark": brandDark,
          } as CSSProperties
        }
      >
        {children}
      </div>
    </StoreContext.Provider>
  );
}
