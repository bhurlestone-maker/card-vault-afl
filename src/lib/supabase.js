import { createClient } from "@supabase/supabase-js";

const url = import.meta.env.VITE_SUPABASE_URL;
const anon = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!url || !anon) {
  console.warn("Supabase env vars missing. Copy .env.example to .env and fill in your project values.");
}

export const supabase = createClient(url || "https://missing.supabase.co", anon || "missing");
