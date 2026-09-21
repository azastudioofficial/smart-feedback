"use client";
// components/dashboard-shell.tsx
// Kerangka dasbor dengan sidebar - dipakai bersama oleh /admin/master,
// /reseller, dan /dashboard (owner) supaya tampilan & navigasinya
// konsisten.

import { useState, type ReactNode } from "react";
import {
  LayoutDashboard,
  Inbox,
  PlusSquare,
  CreditCard,
  Users,
  Activity,
  Settings,
  QrCode,
  LogOut,
  Menu,
  X,
} from "lucide-react";

export type NavSection = {
  id: string;
  label: string;
  icon: "overview" | "inbox" | "create" | "cards" | "users" | "health" | "settings" | "qr";
  badge?: number;
  // Opsional - kalau diisi, item ini dikelompokkan di bawah label
  // grup ini di sidebar (mis. "Kartu QR", "Mitra", "Sistem"). Item
  // TANPA group tampil dulu di atas tanpa label, seperti sebelumnya -
  // jadi ini tidak mengubah apapun untuk pemanggil yang tidak
  // memakainya (reseller, owner dashboard).
  group?: string;
  content: ReactNode;
};

const ICONS = {
  overview: LayoutDashboard,
  inbox: Inbox,
  create: PlusSquare,
  cards: CreditCard,
  users: Users,
  health: Activity,
  settings: Settings,
  qr: QrCode,
};

export function DashboardShell({
  title,
  subtitle,
  sections,
  logoutAction,
  logoUrl,
}: {
  title: string;
  subtitle: string;
  sections: NavSection[];
  logoutAction: () => void;
  logoUrl?: string | null;
}) {
  const [activeId, setActiveId] = useState(sections[0]?.id ?? "");
  const [mobileOpen, setMobileOpen] = useState(false);

  const active = sections.find((s) => s.id === activeId) ?? sections[0];

  return (
    <div
      className="flex min-h-screen bg-[#F6F8F7]"
      style={{ fontFamily: "var(--font-admin-body)" }}
    >
      {/* Sidebar - desktop */}
      <aside className="hidden w-60 shrink-0 flex-col border-r border-black/[0.06] bg-white px-4 py-6 lg:flex">
        <SidebarContent
          title={title}
          subtitle={subtitle}
          sections={sections}
          activeId={active?.id ?? ""}
          onSelect={setActiveId}
          logoutAction={logoutAction}
          logoUrl={logoUrl}
        />
      </aside>

      {/* Sidebar - mobile drawer */}
      {mobileOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div
            className="absolute inset-0 bg-black/30"
            onClick={() => setMobileOpen(false)}
          />
          <aside className="absolute left-0 top-0 flex h-full w-64 flex-col bg-white px-4 py-6">
            <button
              onClick={() => setMobileOpen(false)}
              className="mb-4 self-end rounded-md p-1 hover:bg-black/[0.04]"
            >
              <X className="h-5 w-5 text-[#132320]/60" />
            </button>
            <SidebarContent
              title={title}
              subtitle={subtitle}
              sections={sections}
              activeId={active?.id ?? ""}
              onSelect={(id) => {
                setActiveId(id);
                setMobileOpen(false);
              }}
              logoutAction={logoutAction}
              logoUrl={logoUrl}
            />
          </aside>
        </div>
      )}

      {/* Konten utama */}
      <main className="min-w-0 flex-1 px-4 py-6 sm:px-8">
        <div className="mx-auto max-w-5xl">
          <div className="mb-6 flex items-center gap-3">
            <button
              onClick={() => setMobileOpen(true)}
              className="rounded-md border border-black/[0.08] p-2 lg:hidden"
            >
              <Menu className="h-5 w-5 text-[#132320]/70" />
            </button>
            <div>
              <h1
                className="text-2xl font-extrabold text-[#132320]"
                style={{ fontFamily: "var(--font-admin-heading)" }}
              >
                {active?.label}
              </h1>
            </div>
          </div>

          {active?.content}
        </div>
      </main>
    </div>
  );
}

function NavButton({
  section,
  isActive,
  onSelect,
}: {
  section: NavSection;
  isActive: boolean;
  onSelect: (id: string) => void;
}) {
  const Icon = ICONS[section.icon];
  return (
    <button
      onClick={() => onSelect(section.id)}
      className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition"
      style={
        isActive
          ? {
              backgroundColor: "var(--brand-tint, #E4F1F1)",
              color: "var(--brand, #0E7C86)",
            }
          : { color: "rgba(19,35,32,0.7)" }
      }
      onMouseEnter={(e) => {
        if (!isActive) e.currentTarget.style.backgroundColor = "rgba(0,0,0,0.03)";
      }}
      onMouseLeave={(e) => {
        if (!isActive) e.currentTarget.style.backgroundColor = "transparent";
      }}
    >
      <Icon className="h-4 w-4 shrink-0" />
      <span className="flex-1 text-left">{section.label}</span>
      {typeof section.badge === "number" && section.badge > 0 && (
        <span className="rounded-full bg-[#B45309] px-1.5 py-0.5 text-[10px] font-bold text-white">
          {section.badge}
        </span>
      )}
    </button>
  );
}

function SidebarContent({
  title,
  subtitle,
  sections,
  activeId,
  onSelect,
  logoutAction,
  logoUrl,
}: {
  title: string;
  subtitle: string;
  sections: NavSection[];
  activeId: string;
  onSelect: (id: string) => void;
  logoutAction: () => void;
  logoUrl?: string | null;
}) {
  // Kelompokkan berdasarkan `group`, urutan grup mengikuti urutan
  // kemunculan pertamanya di array `sections`. Item tanpa `group`
  // masuk ke bucket "" (tanpa label) dan selalu tampil duluan -
  // ini yang bikin reseller/owner dashboard (belum pakai group sama
  // sekali) tetap tampil identik seperti sebelumnya.
  const groupOrder: string[] = [];
  const grouped = new Map<string, NavSection[]>();
  for (const s of sections) {
    const key = s.group ?? "";
    if (!grouped.has(key)) {
      grouped.set(key, []);
      groupOrder.push(key);
    }
    grouped.get(key)!.push(s);
  }
  // Pastikan bucket ungrouped ("") selalu diproses duluan kalau ada.
  groupOrder.sort((a, b) => (a === "" ? -1 : b === "" ? 1 : 0));

  return (
    <>
      <div className="mb-6 flex items-center gap-3 px-2">
        {logoUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={logoUrl}
            alt={title}
            className="h-9 w-9 shrink-0 rounded-lg border border-black/[0.06] bg-white object-contain"
          />
        )}
        <div className="min-w-0">
          <p
            className="truncate text-base font-extrabold text-[#132320]"
            style={{ fontFamily: "var(--font-admin-heading)" }}
          >
            {title}
          </p>
          <p className="truncate text-xs text-[#132320]/45">{subtitle}</p>
        </div>
      </div>

      <nav className="flex-1 space-y-4">
        {groupOrder.map((groupKey) => (
          <div key={groupKey || "_ungrouped"} className="space-y-1">
            {groupKey && (
              <p className="px-3 pb-1 text-[10px] font-bold uppercase tracking-[0.08em] text-[#132320]/35">
                {groupKey}
              </p>
            )}
            {grouped.get(groupKey)!.map((s) => (
              <NavButton
                key={s.id}
                section={s}
                isActive={s.id === activeId}
                onSelect={onSelect}
              />
            ))}
          </div>
        ))}
      </nav>

      <form action={logoutAction} className="mt-4 border-t border-black/[0.06] pt-4">
        <button
          type="submit"
          className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm text-[#132320]/60 transition hover:bg-black/[0.03]"
        >
          <LogOut className="h-4 w-4" />
          Keluar
        </button>
      </form>
    </>
  );
}
