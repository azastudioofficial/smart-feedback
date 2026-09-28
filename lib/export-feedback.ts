// lib/export-feedback.ts
// Ekspor rekap keluhan ke .xlsx yang rapi (pengganti buildCsvContent).
// Butuh: npm i exceljs
//
// Kenapa xlsx, bukan CSV:
// - Lebar kolom, teks pesan otomatis turun baris, header tebal & beku
// - Tanggal jadi tanggal sungguhan (bisa diurutkan/difilter), bukan teks
// - Link foto jadi tombol "Lihat foto" yang bisa diklik
// - Tidak kena masalah pemisah kolom (Excel Indonesia butuh ';' bukan ',')
// - Teks pelanggan yang diawali = + - @ tidak dieksekusi sebagai rumus

export type ExportFeedback = {
  id: string;
  customer_name: string | null;
  complaint_text: string;
  photo_url: string | null;
  is_anonymous: boolean;
  status: string;
  created_at: string;
};

const DARK = "FF132320";
const BRAND = "FF0E7C86";
const ROSE = "FFB5585E";

export async function buildFeedbackXlsx(
  items: ExportFeedback[],
  businessName: string | null,
  // Opsional: kalau diisi (mode ZIP), kolom Foto menaut ke file lokal
  // "foto/<nama>" di samping file ini, bukan ke URL Cloudinary yang
  // akan mati setelah 30 hari. Key = id keluhan.
  localPhotoNames?: Map<string, string>
): Promise<Blob> {
  const { default: ExcelJS } = await import("exceljs");
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Rekap Keluhan", {
    views: [{ state: "frozen", ySplit: 5, showGridLines: false }],
    pageSetup: { orientation: "landscape", fitToPage: true, fitToWidth: 1, fitToHeight: 0 },
  });

  ws.columns = [
    { key: "no", width: 6 },
    { key: "tanggal", width: 18 },
    { key: "nama", width: 18 },
    { key: "pesan", width: 55 },
    { key: "status", width: 12 },
    { key: "foto", width: 14 },
  ];

  const first = 6;
  const last = 5 + items.length;
  const font = (o: object = {}) => ({ name: "Arial", size: 10, color: { argb: DARK }, ...o });

  ws.getCell("A1").value = "Rekap Keluhan Pelanggan";
  ws.getCell("A1").font = font({ size: 16, bold: true });
  ws.getCell("A2").value = businessName ?? "";
  ws.getCell("A2").font = font({ color: { argb: "FF6B7A76" } });
  ws.getCell("A3").value = `Diekspor ${new Date().toLocaleDateString("id-ID", {
    day: "numeric", month: "short", year: "numeric",
  })}`;
  ws.getCell("A3").font = font({ color: { argb: "FF6B7A76" } });

  const summary: [string, string][] = [
    ["Total", `COUNTA(A${first}:A${last})`],
    ["Pending", `COUNTIF(E${first}:E${last},"Pending")`],
    ["Resolved", `COUNTIF(E${first}:E${last},"Resolved")`],
  ];
  summary.forEach(([label, formula], i) => {
    ws.getCell(`D${2 + i}`).value = label;
    ws.getCell(`D${2 + i}`).font = font({ color: { argb: "FF6B7A76" } });
    ws.getCell(`E${2 + i}`).value = { formula, result: undefined };
    ws.getCell(`E${2 + i}`).font = font({ bold: true });
    ws.getCell(`E${2 + i}`).alignment = { horizontal: "left" };
  });

  const header = ws.getRow(5);
  ["No", "Tanggal", "Nama", "Pesan", "Status", "Foto"].forEach((h, i) => {
    const c = header.getCell(i + 1);
    c.value = h;
    c.font = font({ bold: true, color: { argb: "FFFFFFFF" } });
    c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: DARK } };
    c.alignment = { vertical: "middle", horizontal: [0, 4, 5].includes(i) ? "center" : "left" };
  });
  header.height = 24;

  items.forEach((f, idx) => {
    const row = ws.getRow(first + idx);
    const d = new Date(f.created_at);
    // ExcelJS menulis Date sebagai UTC; geser supaya jam yang tampil = jam lokal.
    const local = new Date(d.getTime() - d.getTimezoneOffset() * 60000);
    const resolved = f.status === "Resolved";

    row.getCell(1).value = idx + 1;
    row.getCell(2).value = local;
    row.getCell(2).numFmt = "dd/mm/yyyy hh:mm";
    row.getCell(3).value = f.is_anonymous ? "Anonim" : f.customer_name || "-";
    row.getCell(4).value = f.complaint_text.trim();
    row.getCell(5).value = f.status;

    const photoCell = row.getCell(6);
    if (f.photo_url) {
      const localName = localPhotoNames?.get(f.id);
      photoCell.value = {
        text: "Lihat foto",
        hyperlink: localName ? `foto/${localName}` : f.photo_url,
      };
      photoCell.font = font({ underline: true, color: { argb: "FF0563C1" } });
    } else {
      photoCell.value = "-";
      photoCell.font = font({ color: { argb: "FFA0AAA7" } });
    }

    for (let c = 1; c <= 6; c++) {
      const cell = row.getCell(c);
      cell.border = { bottom: { style: "thin", color: { argb: "FFE3E8E6" } } };
      cell.alignment = {
        vertical: "top",
        wrapText: c === 4,
        horizontal: [1, 5, 6].includes(c) ? "center" : "left",
      };
      if (c !== 6) cell.font = font();
    }
    if (f.is_anonymous) row.getCell(3).font = font({ italic: true, color: { argb: "FF6B7A76" } });

    const st = row.getCell(5);
    st.font = font({ bold: true, color: { argb: resolved ? BRAND : ROSE } });
    st.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: resolved ? "FFE4F1F1" : "FFFCEEF0" },
    };
  });

  ws.autoFilter = `A5:F${Math.max(last, 5)}`;

  const buf = await wb.xlsx.writeBuffer();
  return new Blob([buf], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
}
