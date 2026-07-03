#!/usr/bin/env node
/*
  mirror-images.mjs
  -----------------
  Copies the 4,850 source card images into YOUR Supabase Storage,
  compressing each to WebP on the way, then rewrites
  src/lib/afl_cards.json so every card points at your own copy.

  Why this exists: the source host (aptcollectables.com.au) blocks
  hotlinking (HTTP 403), so images cannot be shown directly. Mirroring
  to your storage fixes that permanently and compresses for lower
  bandwidth bills.

  ONE TIME SETUP
  --------------
  1. Be on the Supabase Pro plan (100 GB storage included) or confident
     the mirrored set (~400-700 MB) fits your free-tier headroom.
  2. In this folder:  npm install @supabase/supabase-js sharp
  3. Get your SERVICE ROLE key: Supabase > Project Settings > API >
     service_role secret. This key bypasses row level security, so keep
     it private. Never commit it, never ship it in the frontend.
  4. Run:
       SUPABASE_URL=https://YOURREF.supabase.co \
       SUPABASE_SERVICE_KEY=your-service-role-key \
       node mirror-images.mjs

  It is resumable: rerun any time. Cards already mirrored (URL already on
  your storage domain) are skipped. Safe to stop and restart.

  If the source still 403s the script (it may allow server requests even
  though it blocks browsers), add a REFERER that matches the source site
  by editing SRC_REFERER below.
*/

import { createClient } from "@supabase/supabase-js";
import sharp from "sharp";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CATALOG = path.join(__dirname, "src", "lib", "afl_cards.json");
const BUCKET = "card-photos";
const CATALOG_PREFIX = "catalog/"; // mirrored images live under this folder
const SRC_REFERER = "https://www.aptcollectables.com.au/";
const CONCURRENCY = 6;

const URL = process.env.SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_KEY;
if (!URL || !KEY) {
  console.error("Set SUPABASE_URL and SUPABASE_SERVICE_KEY env vars. See header of this file.");
  process.exit(1);
}
const supabase = createClient(URL, KEY, { auth: { persistSession: false } });
const storageHost = new global.URL(URL).host;

const cards = JSON.parse(fs.readFileSync(CATALOG, "utf8"));
const safeKey = (k) => k.replace(/[^a-zA-Z0-9]+/g, "_").slice(0, 120);
const keyOf = (c) => (c.sku ? `SKU:${c.sku}` : `${c.mfg}|${c.year}|${c.set}|${c.variety}|${c.no}|${c.player}`);

let done = 0, skipped = 0, failed = 0;
const failures = [];

async function mirrorOne(card) {
  const src = card.img;
  if (!src || !src.startsWith("http")) { skipped++; return; }
  // Already mirrored to our storage
  if (src.includes(storageHost)) { skipped++; return; }

  const objectPath = `${CATALOG_PREFIX}${safeKey(keyOf(card))}.webp`;
  try {
    const resp = await fetch(src, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
        "Referer": SRC_REFERER,
        "Accept": "image/avif,image/webp,image/*,*/*;q=0.8",
      },
    });
    if (!resp.ok) throw new Error(`fetch ${resp.status}`);
    const input = Buffer.from(await resp.arrayBuffer());

    const out = await sharp(input)
      .resize({ width: 900, height: 900, fit: "inside", withoutEnlargement: true })
      .webp({ quality: 80 })
      .toBuffer();

    const up = await supabase.storage.from(BUCKET).upload(objectPath, out, {
      contentType: "image/webp",
      upsert: true,
    });
    if (up.error) throw up.error;

    const { data: pub } = supabase.storage.from(BUCKET).getPublicUrl(objectPath);
    card.img = pub.publicUrl;
    done++;
    if (done % 50 === 0) {
      fs.writeFileSync(CATALOG, JSON.stringify(cards));
      console.log(`  ...${done} mirrored (checkpoint saved)`);
    }
  } catch (e) {
    failed++;
    failures.push({ card: keyOf(card), src, error: String(e.message || e) });
  }
}

async function run() {
  console.log(`Mirroring ${cards.length} cards to ${BUCKET}/${CATALOG_PREFIX} ...`);
  const queue = [...cards];
  const workers = Array.from({ length: CONCURRENCY }, async () => {
    while (queue.length) await mirrorOne(queue.shift());
  });
  await Promise.all(workers);

  fs.writeFileSync(CATALOG, JSON.stringify(cards));
  console.log(`\nDone. mirrored=${done} skipped=${skipped} failed=${failed}`);
  if (failures.length) {
    fs.writeFileSync(path.join(__dirname, "mirror-failures.json"), JSON.stringify(failures, null, 2));
    console.log(`Wrote ${failures.length} failures to mirror-failures.json (rerun to retry).`);
  }
  console.log("Catalog updated: src/lib/afl_cards.json now points at your storage.");
  console.log("Commit and redeploy to serve the mirrored images.");
}
run();
