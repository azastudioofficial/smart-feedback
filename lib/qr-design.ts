// lib/qr-design.ts
// Logic murni (bukan komponen React) untuk Studio Desain QR.
// Dipakai bareng oleh app/admin/master (batch) dan app/dashboard (single).
// Satu sumber kebenaran - kalau ada perbaikan, cukup di file ini saja.

export type QrDesign = {
  preset: string;
  logoOption: "none" | "google_g" | "custom";
  customLogo: string;
  color1: string;
  color2: string;
  bgColor: string;
  dotStyle: string;
  cornerStyle: string;
};

type PresetStyle = Pick<
  QrDesign,
  "color1" | "color2" | "bgColor" | "dotStyle" | "cornerStyle"
>;

export const QR_PRESETS: Record<string, PresetStyle> = {
  modern_teal: {
    color1: "#0E7C86",
    color2: "#0B5F67",
    bgColor: "#FFFFFF",
    dotStyle: "extra-rounded",
    cornerStyle: "extra-rounded",
  },
  premium_gold: {
    color1: "#D4AF37",
    color2: "#AA7C11",
    bgColor: "#FFFFFF",
    dotStyle: "classy",
    cornerStyle: "extra-rounded",
  },
  google_gradient: {
    color1: "#4285F4",
    color2: "#34A853",
    bgColor: "#FFFFFF",
    dotStyle: "square",
    cornerStyle: "square",
  },
  classic_black: {
    color1: "#111111",
    color2: "#111111",
    bgColor: "#FFFFFF",
    dotStyle: "rounded",
    cornerStyle: "extra-rounded",
  },
};

export const DEFAULT_QR_DESIGN: QrDesign = {
  preset: "modern_teal",
  logoOption: "none",
  customLogo: "",
  ...QR_PRESETS.modern_teal,
};

export const GOOGLE_G_LOGO =
  "data:image/svg+xml;base64," +
  btoa(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48">
    <path fill="#4285F4" d="M45.1 24.5c0-1.6-.1-3.1-.4-4.6H24v9.1h11.9c-.5 2.8-2.1 5.2-4.4 6.8v5.6h7.6C43.5 37.4 45.1 31.4 45.1 24.5z"/>
    <path fill="#34A853" d="M24 46c6.1 0 11.2-2 14.9-5.5l-7.3-5.7c-2 1.4-4.6 2.2-7.6 2.2-5.9 0-10.9-4-12.7-9.3H3.5v5.8C7.1 41 14.9 46 24 46z"/>
    <path fill="#FBBC05" d="M11.3 27.7c-.5-1.4-.7-2.8-.7-4.3s.3-2.9.7-4.3v-5.8H3.5C1.9 16.6 1 20.2 1 24s.9 7.4 2.5 10.7l7.8-5.9z"/>
    <path fill="#EA4335" d="M24 10.4c3.3 0 6.2 1.1 8.5 3.3l6.4-6.4C35.2 3.8 30.1 2 24 2 14.9 2 7.1 7 3.5 13.3l7.8 5.8c1.8-5.3 6.8-9.3 12.7-9.3z"/>
  </svg>`);

/**
 * Susun object opsi untuk QRCodeStyling berdasarkan QrDesign saat ini.
 * Fungsi murni - tidak menyentuh DOM, aman dipanggil dari mana saja.
 */
export function buildQrStylingOptions(
  design: QrDesign,
  data: string,
  size: number
) {
  let image = "";
  if (design.logoOption === "google_g") image = GOOGLE_G_LOGO;
  else if (design.logoOption === "custom") image = design.customLogo;

  return {
    width: size,
    height: size,
    data,
    image,
    margin: 0,
    qrOptions: { typeNumber: 0, mode: "Byte", errorCorrectionLevel: "H" },
    imageOptions: {
      hideBackgroundDots: true,
      imageSize: 0.22,
      margin: 2,
      crossOrigin: "anonymous",
    },
    dotsOptions: {
      type: design.dotStyle,
      color: design.color1,
      gradient: {
        type: "linear",
        rotation: 0,
        colorStops: [
          { offset: 0, color: design.color1 },
          { offset: 1, color: design.color2 },
        ],
      },
    },
    backgroundOptions: { color: design.bgColor },
    cornersSquareOptions: {
      type: design.cornerStyle === "square" ? "square" : "extra-rounded",
      color: design.color1,
    },
    cornersDotOptions: {
      type: design.cornerStyle === "square" ? "square" : "dot",
      color: design.color2,
    },
  };
}

export function triggerBlobDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
