import RAW from "./afl_cards.json";

// ----------------------------------------------------------------
// CATALOG
// Loaded from afl_cards.json (4,880 real AFL cards, 1994-2023).
// Each raw record: { mfg, year, set, variety, team, player, no, sku, img }
// img is the source URL; after mirroring it points at your own storage.
// User photos and community submissions layer on top via Supabase.
// ----------------------------------------------------------------

export const CONDITIONS = ["Mint", "Near Mint", "Excellent", "Good", "Fair", "Poor"];

// Stable unique key per card. Prefer SKU (unique in the sheet); fall back to composite.
export const key = (c) =>
  c.sku ? `SKU:${c.sku}` : `${c.mfg}|${c.year}|${c.set}|${c.variety}|${c.no}|${c.player}`;

export const safeKey = (k) => k.replace(/[^a-zA-Z0-9]+/g, "_").slice(0, 120);

// Normalise a raw record into the shape the UI uses
const norm = (r, i) => ({
  ...r,
  brand: r.mfg,
  set: r.set,
  variety: r.variety || "Base",
  _id: i,
});

const ALL = RAW.map(norm);

export const flat = () => ALL;

// Dropdown option builders
export const allBrands = [...new Set(ALL.map((c) => c.brand))].sort();
export const yearsFor = (brand) =>
  [...new Set(ALL.filter((c) => !brand || c.brand === brand).map((c) => c.year))].sort((a, b) => b - a);
export const setsFor = (brand, year) =>
  [...new Set(ALL.filter((c) => (!brand || c.brand === brand) && (!year || c.year === +year)).map((c) => c.set))].sort();

// Club colours drive the fallback artwork when no image exists
const TEAM_COLORS = {
  "Adelaide": ["#002b5c", "#e21937"], "Brisbane": ["#a30046", "#f2a900"],
  "Brisbane Lions": ["#a30046", "#f2a900"], "Brisbane Bears": ["#c8102e", "#f2a900"],
  "Carlton": ["#0e1e3c", "#031228"], "Collingwood": ["#111111", "#3a3a3a"],
  "Essendon": ["#cc2031", "#111111"], "Fremantle": ["#2a1a4a", "#a379c9"],
  "Footscray": ["#014896", "#c8102e"], "Geelong": ["#0c2340", "#1c4a8a"],
  "Gold Coast": ["#d92a27", "#f2a900"], "GWS Giants": ["#f47920", "#3d3935"],
  "Greater Western Sydney": ["#f47920", "#3d3935"], "Hawthorn": ["#4d2004", "#fbbf15"],
  "Melbourne": ["#0f1131", "#c8102e"], "North Melbourne": ["#003f98", "#0a2a5c"],
  "Port Adelaide": ["#008aab", "#111111"], "Richmond": ["#111111", "#ffd200"],
  "St Kilda": ["#c8102e", "#111111"], "South Melbourne": ["#c8102e", "#8f0a20"],
  "Sydney": ["#e21937", "#a30f26"], "Sydney Swans": ["#e21937", "#a30f26"],
  "West Coast": ["#062ee2", "#f2a900"], "Western Bulldogs": ["#014896", "#c8102e"],
  "Fitzroy": ["#8b1a2b", "#00204a"],
};
export const teamCol = (t) => TEAM_COLORS[t] || ["#2b3a4a", "#141d26"];

// Downscale + compress a photo before upload (client side)
export const resizeImg = (file) =>
  new Promise((res, rej) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      const max = 900;
      const s = Math.min(1, max / Math.max(img.width, img.height));
      const cv = document.createElement("canvas");
      cv.width = Math.round(img.width * s);
      cv.height = Math.round(img.height * s);
      cv.getContext("2d").drawImage(img, 0, 0, cv.width, cv.height);
      URL.revokeObjectURL(url);
      cv.toBlob((b) => (b ? res(b) : rej(new Error("encode failed"))), "image/jpeg", 0.78);
    };
    img.onerror = () => { URL.revokeObjectURL(url); rej(new Error("read failed")); };
    img.src = url;
  });
