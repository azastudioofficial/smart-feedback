-- ============================================================
-- 12-connect-card-text.sql
-- Judul & keterangan tombol "Terhubung dengan Kami" yang bisa
-- diketik sendiri oleh owner (mis. hotel: "Info Kamar & Fasilitas").
-- Jalankan SEKALI di Supabase SQL Editor - SEBELUM deploy kodenya,
-- karena halaman feedback & dashboard langsung membaca kolom ini.
-- NULL / kosong = pelanggan melihat teks bawaan yang netral.
-- Aman dijalankan berulang (IF NOT EXISTS) dan tidak mengubah data.
-- Tidak perlu policy baru: sudah tercakup "owner_update_own_product".
-- ============================================================

alter table products
  add column if not exists connect_title text,
  add column if not exists connect_description text;

comment on column products.connect_title is
  'Judul tombol "Terhubung dengan Kami" di halaman feedback (maks 60 karakter, dibatasi di server). NULL = teks bawaan.';
comment on column products.connect_description is
  'Keterangan singkat di bawah judul tombol itu (maks 140 karakter, dibatasi di server). NULL = teks bawaan.';
