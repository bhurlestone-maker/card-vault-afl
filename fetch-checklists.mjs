#!/usr/bin/env node
/*
  fetch-checklists.mjs  (v2: OFFICIAL SELECT SOURCE)
  --------------------------------------------------
  Builds the full catalog from Select Australia's OWN published
  checklists (selectcards.com.au/pages/select-cards-checklists),
  covering every AFL release 1990-2026. Official, authoritative,
  and includes club names.

  Setup (once):   npm install pdf-parse
  Run:            node fetch-checklists.mjs harvest
                  node fetch-checklists.mjs merge
  Then commit src/lib/afl_cards.json and push to deploy.

  harvest: downloads each checklist PDF into harvested/, parses
           card number + player + club + variety, writes one JSON
           per set. Resumable; unparseable sets logged to
           harvest-failures.json for manual review.
  merge:   folds everything into src/lib/afl_cards.json, deduping
           on year + card no + player. If an existing row has a
           missing/different team and the official checklist names
           one, the team is corrected in place.
*/

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { createRequire } from "module";
const require = createRequire(import.meta.url);

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(__dirname, "harvested");
const CATALOG = path.join(__dirname, "src", "lib", "afl_cards.json");
const FAILS = path.join(__dirname, "harvest-failures.json");
const CDN = "https://cdn.shopify.com/s/files/1/0323/6364/3013/files/";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Official AFL checklist PDFs from Select's checklist page (year | set | file)
const SETS = [
  [2026, "Footy Stars Hobby", "2026FSHobbyChecklist.pdf"],
  [2026, "Footy Stars", "2026FSChecklist.pdf"],
  [2025, "Seamless", "2025_AFL_SEAMLESS_Checklist.pdf"],
  [2025, "Supremacy Rookies", "2025_SUPREMACY_ROOKIES.pdf"],
  [2025, "Footy Stars", "2025_AFL_Footy_Stars_Checklist.pdf"],
  [2025, "Footy Stars Hobby", "2025AFLHobby.pdf"],
  [2024, "Supremacy Rookies", "AFL24SupremacyRookies.pdf"],
  [2024, "Legacy Ultimate", "2024LegacyUltimateChecklist.pdf"],
  [2024, "Supremacy", "2024SupremacyChecklist.pdf"],
  [2024, "Brownlow Medallist Series", "2024BrownlowSeriesChecklist.pdf"],
  [2024, "Brilliance Superstars", "Brilliance2024Checklist.pdf"],
  [2024, "Footy Stars", "AFL24FSRetail.pdf"],
  [2024, "Footy Stars Hobby", "AFL24FSHobby.pdf"],
  [2023, "Supremacy Rookies", "2023_SUPREMACY_ROOKIES.pdf"],
  [2023, "Legacy", "AFL170923Flyer.pdf"],
  [2023, "GEM", "AFL23GEM_FLYER.pdf"],
  [2023, "Footy Stars", "2023_FS_CL.pdf"],
  [2022, "Supremacy Rookies", "22SUPREMACYROOKIES_FLYER.pdf"],
  [2022, "Optimum", "Optimum2022CheckList.pdf"],
  [2022, "Brilliance", "AFL2022_BrillianceChecklist.pdf"],
  [2022, "Footy Stars Prestige", "AFL22S3_FS_PRESTIGE.pdf"],
  [2022, "Footy Stars", "AFL2022FootyStarsChecklist.pdf"],
  [2021, "Supremacy", "Supremacy_2021_CSBB.pdf"],
  [2021, "Optimum", "AFL21S4_Optimum_Flyer_GOLD_REVEAL.pdf"],
  [2021, "Footy Stars Prestige", "AFL21S2Prestige.pdf"],
  [2021, "Footy Stars", "AFLFS21.pdf"],
  [2020, "Brilliance", "2020Brilliance.pdf"],
  [2020, "Dominance", "Dominance2020Checklist.pdf"],
  [2020, "Footy Stars Prestige", "AFL20S2_PRESTIGE_Footy_Stars_Flyer_599_V2.pdf"],
  [2020, "Footy Stars", "AFL20S1_Footy_Stars_Flyer_299_F_LR_V4.pdf"],
  [2019, "Supremacy", "AFL18S3_Supremacy_Flyer_FINAL_V3.pdf"],
  [2019, "Footy Stars", "AFL19S1_Footy_Stars_Flyer_3_FULL_RELEASE_LR_correct.pdf"],
  [2019, "Dominance", "AFL19S2_Dominance_Flyer_V4_PROPER.pdf"],
  [2018, "Legacy", "AFL18S2_Legacy_Flyer_FB_V3.pdf"],
  [2018, "Footy Stars", "AFL18S1_Footy_Stars_A4_Flyer_Full_Release_2.pdf"],
  [2017, "Future Force", "FF17_A4_Flyer.pdf"],
  [2017, "Footy Stars", "AFL17S1_Footy_Stars_A4_Flyer_LR.pdf"],
  [2017, "Certified", "AFL17S2_16_Certified_Flyer_03_Full_Release_no_influential_listed.pdf"],
  [2016, "Future Force", "FF16_A4_Flyer.pdf"],
  [2016, "Footy Stars", "AFL16S1_Footy_Stars_A4_Flyer_CAS_Reprint_HR_12b93c9c-ddf9-400f-8ed3-9d024da43221.pdf"],
  [2016, "Certified", "AFL16S2_16_Certified_Flyer_A4_Flyer_FB_v6.pdf_Tony_copy.pdf"],
  [2015, "Honours 2 Series 2", "AFL15S2_Honours_2_Series_2_A4_Flyer_FB_LR.pdf"],
  [2015, "Future Force", "FF15_A4_Flyer_FB_LR_b3e3f00b-ee43-4c4d-ab9b-4090c26ce3bc.pdf"],
  [2015, "Champions", "SEL_2015_AFLS1_Champions_Flyer_LR.pdf"],
  [2014, "Honours Series 1", "SEL_2014_AFLS2_Honours_1_Flyer_LR.pdf"],
  [2014, "Future Force", "SEL_2014_FF_Flyer_LR.pdf"],
  [2014, "Champions", "AFL14S1_Champions_Flyer_FB_LR.pdf"],
  [2013, "Prime", "SEL_2013_AFLS12_Prime_Flyer_LR.pdf"],
  [2013, "Future Force", "SEL_2013_FF13_A4_Flyer_LR.pdf"],
  [2013, "Champions", "SEL_2013_AFLS1_Champions_Flyer_LR.pdf"],
  [2012, "Future Force", "SEL_2012_FF12_Flyer_LR.pdf"],
  [2012, "Eternity", "SEL_2012_AFLS2_Eternity_Flyer_LR.pdf"],
  [2012, "Champions", "SEL_2012_AFLS2_Champions_Flyer_LR.pdf"],
  [2011, "Infinity", "SEL_2011_AFLS2_INFINITY_Flyer_LR.pdf"],
  [2011, "Champions", "SEL_2011_AFLS1_Champions_Flyer_LR.pdf"],
  [2010, "Prestige", "SEL_2010_AFLS2_Prestige_Flyer_LR.pdf"],
  [2010, "Player Tags", "SEL_2010_AFL_TAGS_Flyer_LR.pdf"],
  [2010, "Champions", "SEL_2010_AFLS1_Champions_Flyer_LR.pdf"],
  [2009, "Star Figurines", "SEL_2009_AFL_Figurine_Flyer_LR.pdf"],
  [2009, "Pinnacle", "SEL_2009_AFLS2_Premium_Flyer_LR.pdf"],
  [2009, "Champions", "SEL_2009_AFLS1_Champions_Flyer_LR.pdf"],
  [2008, "Figurine", "SEL_2008_AFL_Figurine_Flyer_LR.pdf"],
  [2008, "Classic", "SEL_2008_AFLS2_Classic_AFL08S2_Flyer_LR.pdf"],
  [2008, "Champions", "SEL_2008_AFLS1_Champions_Flyer_LR.pdf"],
  [2007, "Supreme", "SEL_2007_AFL_Premium_Series.pdf"],
  [2007, "Champions", "SEL_2007_AFL_Champions_Series.pdf"],
  [2006, "Supreme", "SEL_2006_AFL_Supreme.pdf"],
  [2006, "Champions", "SEL_2006_AFL_Champions_Series.pdf"],
  [2005, "Tradition", "SEL_2005_AFL_Tradition_Collection.pdf"],
  [2005, "Dynasty", "SEL_2005_AFL_Dynasty.pdf"],
  [2004, "Ovation", "SEL_2004_AFL_Ovation.pdf"],
  [2004, "Conquest", "SEL_2004_AFL_Conquest.pdf"],
  [2003, "XL Ultra", "SEL_2003_AFL_XL_Ultra_Series_f06012d8-74e3-4497-96ce-c2b3eeb6fcc1.pdf"],
  [2003, "XL", "SEL_2003_AFL_XL_Series.pdf"],
  [2002, "Exclusive SPX", "SEL_2002_AFL_Exclusive_SPX_Series.pdf"],
  [2002, "Exclusive", "SEL_2002_AFL_Exclusive_Series.pdf"],
  [2001, "Stickers", "SEL_2001_AFL_Stickers.pdf"],
  [2001, "Authentic", "SEL_2001_AFL_Authentic.pdf"],
  [2000, "Stickers", "SEL_2000_AFL_Stickers.pdf"],
  [2000, "Millennium", "SEL_2000_AFL_Millennium_Series.pdf"],
  [1999, "Stickers", "SEL_1999_AFL_Stickers.pdf"],
  [1999, "Premiere", "SEL_1999_AFL_Premiere_Series.pdf"],
  [1998, "Stickers", "SEL_1998_AFL_Stickers.pdf"],
  [1998, "Signature Series", "SEL_1998_AFL_Signature_Series.pdf"],
  [1997, "Ultimate", "SEL_1997_AFL_Ultimate_Series.pdf"],
  [1997, "Stickers", "SEL_1997_AFL_Stickers.pdf"],
  [1996, "Stickers", "SEL_1996_AFL_Stickers.pdf"],
  [1996, "Series 2", "SEL_1996_AFL_Series_2.pdf"],
  [1996, "Series 1", "SEL_1996_AFL_Series_1.pdf"],
  [1996, "Hall of Fame", "SEL_1996_AFL_Hall_of_Fame_1.pdf"],
  [1996, "Centenary", "SEL_1996_AFL_Centenary_Series.pdf"],
  [1995, "Stickers", "SEL_1995_AFL_Stickers.pdf"],
  [1995, "Series 2", "SEL_1995_AFL_Series_2.pdf"],
  [1995, "Series 1", "SEL_1995_AFL_Series_1.pdf"],
  [1995, "Sensation", "SEL_1995_AFL_Sensation_Edition.pdf"],
  [1994, "Stickers", "SEL_1994_AFL_Stickers.pdf"],
  [1994, "Series 1", "SEL_1994_AFL_Series_1.pdf"],
  [1994, "Cazaly", "SEL_1994_AFL_Cazaly_Series.pdf"],
  [1993, "Stickers", "SEL_1993_AFL_Stickers.pdf"],
  [1993, "Series 1", "SEL_1993_AFL_Series.pdf"],
  [1992, "Stickers", "SEL_1992_AFL_Stickers.pdf"],
  [1991, "Stickers", "SEL_1991_AFL_Stickers.pdf"],
  [1990, "Stickers", "SEL_1990_AFL_Stickers.pdf"],
];

const CLUBS = new Set(["ADELAIDE","ADELAIDE CROWS","BRISBANE","BRISBANE LIONS","BRISBANE BEARS","CARLTON",
  "CARLTON BLUES","COLLINGWOOD","COLLINGWOOD MAGPIES","ESSENDON","ESSENDON BOMBERS","FITZROY","FOOTSCRAY",
  "FREMANTLE","FREMANTLE DOCKERS","GEELONG","GEELONG CATS","GOLD COAST","GOLD COAST SUNS","GWS","GWS GIANTS",
  "GREATER WESTERN SYDNEY","GREATER WESTERN SYDNEY GIANTS","HAWTHORN","HAWTHORN HAWKS","MELBOURNE",
  "MELBOURNE DEMONS","NORTH MELBOURNE","NORTH MELBOURNE KANGAROOS","KANGAROOS","PORT ADELAIDE",
  "PORT ADELAIDE POWER","RICHMOND","RICHMOND TIGERS","ST. KILDA","ST KILDA","ST KILDA SAINTS","SYDNEY",
  "SYDNEY SWANS","WEST COAST","WEST COAST EAGLES","WESTERN BULLDOGS"]);

const titleCase = (s) => s.toLowerCase()
  .replace(/(^|[\s'-])([a-z])/g, (m, a, b) => a + b.toUpperCase())
  .replace(/\bMc([a-z])/g, (m, a) => "Mc" + a.toUpperCase());

const JUNK = /\b(Pack|Packs|Box|Boxes|Card|Cards|Per|Rrp|Notice|Season|Stores|Newsagencies|Change|Subject|Images|Only|Australia|Contents|Value|Conditions|Odds|Production|Guaranteed|Cases|Choice|Collector|Collectors)\b/i;
function parsePdfText(text, meta) {
  const lines = text.split(/\r?\n/)
    .map((l) => l.replace(/[\t\u00a0]+/g, " ").replace(/ {2,}/g, " ").trim())
    .filter(Boolean);
  const cards = [];
  let team = "Unknown";
  let variety = "Base";
  for (const line of lines) {
    const up = line.toUpperCase().replace(/\s+/g, " ").trim();
    if (CLUBS.has(up)) { team = titleCase(up.replace("ST. KILDA", "ST KILDA")); continue; }
    // Section headers like "GOLD CARDS", "SIGNATURE CARDS", "LEGENDS", "MEDAL CARDS"
    if (/^[A-Z][A-Z\s&'\/-]{2,40}$/.test(line) && /CARD|LEGEND|SIGNATURE|GOLD|SILVER|PRIZE|MEDAL|HOLOFOIL|PARALLEL|ROOKIE|DRAFT|PREDICTOR|ACETATE|SKETCH|GEM|WILDCARD|CAPTAIN|BROWNLOW/.test(up)) {
      variety = titleCase(up.replace(/\bCARDS?\b/g, "").trim()) || "Base";
      team = "Unknown"; // sections restart, club headers may repeat
      continue;
    }
    // Entry: "162 TONY LOCKETT" or "SC11 TRENT CROAD" (allow trailing team/notes)
    const m = line.match(/^((?:[A-Z]{1,6})?\d{1,3}[a-z]?)\s+([A-Za-z][A-Za-z\u2019'.\- ]{2,40}?)\s*$/);
    if (m) {
      const player = titleCase(m[2].trim().replace(/\u2019/g, "'"));
      if (/Checklist/i.test(player) || JUNK.test(player)) continue;
      cards.push({ mfg: "Select", year: meta.year, set: meta.set, variety, team,
        player, no: m[1],
        sku: `${meta.year}${meta.set.replace(/[^A-Z0-9]/gi, "").slice(0, 8).toUpperCase()}${variety === "Base" ? "" : "V"}${m[1]}`,
        img: "" });
    }
  }
  return cards;
}

async function harvest() {
  const pdfParse = require("pdf-parse");
  fs.mkdirSync(OUT, { recursive: true });
  const fails = [];
  for (const [year, set, file] of SETS) {
    const outFile = path.join(OUT, `${year}-${set}.json`.replace(/[^\w.-]+/g, "_"));
    if (fs.existsSync(outFile)) continue; // resumable
    try {
      const r = await fetch(CDN + file, { headers: { "User-Agent": "Mozilla/5.0" } });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const buf = Buffer.from(await r.arrayBuffer());
      const { text } = await pdfParse(buf);
      const cards = parsePdfText(text, { year, set });
      if (cards.length < 10) throw new Error(`only parsed ${cards.length} entries, needs review`);
      fs.writeFileSync(outFile, JSON.stringify(cards, null, 1));
      console.log(`${year} ${set}: ${cards.length} cards`);
    } catch (e) {
      fails.push({ year, set, file, error: String(e.message || e) });
      console.log(`FAILED ${year} ${set}: ${e.message}`);
    }
    await sleep(1200);
  }
  fs.writeFileSync(FAILS, JSON.stringify(fails, null, 2));
  console.log(`\nDone. Failures: ${fails.length} (harvest-failures.json). Next: node fetch-checklists.mjs merge`);
}

function merge() {
  const catalog = JSON.parse(fs.readFileSync(CATALOG, "utf8"));
  const index = new Map(catalog.map((c) => [`${c.year}|${String(c.no).toLowerCase()}|${c.player.toLowerCase()}`, c]));
  let added = 0, teamFixed = 0, skipped = 0;
  for (const f of fs.readdirSync(OUT)) {
    for (const c of JSON.parse(fs.readFileSync(path.join(OUT, f), "utf8"))) {
      const k = `${c.year}|${String(c.no).toLowerCase()}|${c.player.toLowerCase()}`;
      const existing = index.get(k);
      if (existing) {
        if (c.team !== "Unknown" && existing.team !== c.team) { existing.team = c.team; teamFixed++; }
        else skipped++;
        continue;
      }
      index.set(k, c);
      catalog.push(c);
      added++;
    }
  }
  fs.writeFileSync(CATALOG, JSON.stringify(catalog));
  console.log(`Added ${added}, corrected teams on ${teamFixed}, skipped ${skipped} dupes. Total: ${catalog.length}`);
  console.log("Commit src/lib/afl_cards.json and push to deploy.");
}


// ---------- vintage (pre-Select era from aflfootycards.com) ----------
const VINTAGE_INDEX = "https://www.aflfootycards.com/footy_card_sets.html";
const VBRANDS = ["Scanlens", "Stimorol", "Regina", "Kornies", "Dynamic", "Hungry Jacks", "Ardmona"];

async function vintage() {
  fs.mkdirSync(OUT, { recursive: true });
  const fails = fs.existsSync(FAILS) ? JSON.parse(fs.readFileSync(FAILS, "utf8")) : [];
  // Try known URL patterns per year directly; 404s are skipped silently.
  const base = "https://www.aflfootycards.com/";
  const links = [];
  for (let y = 1963; y <= 1993; y++) {
    links.push(`${base}${y}_scanlens_vfl_cards.html`);
    links.push(`${base}${y}_scanlens_afl_cards.html`);
    if (y >= 1988) { links.push(`${base}${y}_stimorol_vfl_cards.html`); links.push(`${base}${y}_stimorol_afl_cards.html`); }
    if (y >= 1991) { links.push(`${base}${y}_regina_vfl_cards.html`); links.push(`${base}${y}_regina_afl_cards.html`); }
  }
  console.log(`Trying ${links.length} candidate vintage pages (missing ones skip quietly)`);
  for (const u of links) {
    // quick existence check
    let resp;
    try { resp = await fetch(u, { headers: { "User-Agent": "Mozilla/5.0" } }); } catch { continue; }
    if (!resp.ok) { await sleep(400); continue; }
    try {
      const html = await resp.text();
      // Meta from the URL: 1968_scanlens_vfl_cards.html -> 1968 / Scanlens / VFL
      const fm = u.match(/(\d{4})_([a-z]+)_([a-z]+)_cards\.html/);
      if (!fm) continue;
      const year = parseInt(fm[1]);
      if (year >= 1994) continue;
      const brandName = fm[2][0].toUpperCase() + fm[2].slice(1);
      const setName = fm[3].toUpperCase() === fm[3] ? fm[3] : fm[3].toUpperCase();
      // Flatten: their checklist is an HTML table, so entries span many lines
      const text = html.replace(/<script[\s\S]*?<\/script>/gi, " ").replace(/<style[\s\S]*?<\/style>/gi, " ")
        .replace(/<[^>]+>/g, " ")
        .replace(/&amp;/g, "&").replace(/&quot;|&#8220;|&#8221;/g, '"').replace(/&#8217;|&#39;/g, "'")
        .replace(/\s+/g, " ");
      const cards = [];
      const re = /(\d{1,3}[a-z]?)\s+([A-Za-z][A-Za-z'".\/\- ]{2,38}?)\s*(?:\(RC\))?\s+([\d,]+\.\d{2})\s+([\d,]+\.\d{2})/g;
      let m;
      while ((m = re.exec(text))) {
        let player = m[2].replace(/"/g, "").trim();
        if (/^(Complete|Common|Checklist|Wrapper|Album|Set|Series|Player|Cards?)\b/i.test(player)) continue;
        cards.push({ mfg: brandName, year, set: "VFL " + setName.replace(/^VFL$/, "Footballers"), variety: "Base", team: "Unknown",
          player, no: m[1], sku: `${year}${brandName.slice(0,4).toUpperCase()}${m[1]}`, img: "" });
      }
      if (cards.length < 10) throw new Error(`only parsed ${cards.length}`);
      const outFile = path.join(OUT, `${year}-${brandName}-${setName}.json`.replace(/[^\w.-]+/g, "_"));
      fs.writeFileSync(outFile, JSON.stringify(cards, null, 1));
      console.log(`${year} ${brandName} ${setName}: ${cards.length} cards`);
    } catch (e) {
      fails.push({ url: u, error: String(e.message || e) });
      console.log(`FAILED ${u}: ${e.message}`);
    }
    await sleep(1500);
  }
  fs.writeFileSync(FAILS, JSON.stringify(fails, null, 2));
  console.log("Vintage done. Next: node fetch-checklists.mjs merge");
}

const cmd = process.argv[2];
if (cmd === "harvest") harvest();
else if (cmd === "vintage") vintage();
else if (cmd === "merge") merge();
else console.log("Usage: npm install pdf-parse, then: node fetch-checklists.mjs [harvest|vintage|merge]");
