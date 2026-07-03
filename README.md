# Card Vault AFL

AFL trading card collection tracker and marketplace. React + Vite frontend, Supabase backend (accounts, database, photo storage). Data saves to the cloud and is shared between all users.

## What you get

- Real user accounts (email + password via Supabase Auth)
- Private collections per user, saved in the database
- Public marketplace listings visible to everyone
- Community card photos: when any collector photographs a card's front or back, everyone sees it
- The seeded catalog of landmark AFL/VFL releases, ready to extend

## Setup (about 20 minutes)

### 1. Create the Supabase project (free)

1. Go to https://supabase.com and sign up
2. Create a new project. Pick a name and a strong database password (save it somewhere)
3. Wait for the project to finish provisioning

### 2. Create the database

1. In your Supabase project, open **SQL Editor** in the left menu
2. Click **New query**, paste the entire contents of `supabase/schema.sql`, click **Run**
3. You should see "Success. No rows returned"

### 3. Auth settings

1. Go to **Authentication > Sign In / Providers > Email**
2. For quick testing, turn OFF "Confirm email" so new accounts work immediately. Turn it back on before inviting the public.

### 4. Connect the app

1. In Supabase go to **Project Settings > API**
2. Copy the **Project URL** and the **anon public** key
3. In this folder, copy `.env.example` to `.env` and paste both values in

### 5. Run locally

Requires Node.js 18+ (https://nodejs.org).

```bash
npm install
npm run dev
```

Open the URL it prints (usually http://localhost:5173), create an account, add cards.

### 6. Deploy (Vercel, free)

1. Push this folder to a GitHub repository
2. Go to https://vercel.com, sign in with GitHub, click **Add New > Project**, import the repo
3. Under **Environment Variables**, add `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` with the same values as your `.env`
4. Deploy. Vercel gives you a public URL; every push to GitHub redeploys automatically.

Optional: add a custom domain in Vercel's project settings.

## The catalog (4,880 cards)

`src/lib/afl_cards.json` holds the full card list: 4,880 real AFL cards from 1994 to 2023, imported and cleaned from your spreadsheet. `src/lib/catalog.js` loads and indexes it. Each record is `{ mfg, year, set, variety, team, player, no, sku, img }`. To add cards, append records in that shape (or use the in-app "Add a missing card" button, which files them to the `card_submissions` table for review).

## Card images: the mirror step

The source image URLs (aptcollectables.com.au) block hotlinking, they return HTTP 403 to any site that isn't their own. Shown directly, every image breaks. The fix is `mirror-images.mjs`, which copies each image into YOUR Supabase Storage, compressing to WebP (~900px, quality 80) on the way. After mirroring, the catalog points at your own copies and images load everywhere.

Run it once (see the detailed header inside the file):

```bash
npm install @supabase/supabase-js sharp
SUPABASE_URL=https://YOURREF.supabase.co \
SUPABASE_SERVICE_KEY=your-service-role-key \
node mirror-images.mjs
```

Notes:
- Needs your **service_role** key (Project Settings > API). Keep it private, never commit it, never ship it in the frontend.
- Mirrored set is roughly 400-700 MB compressed, inside the Pro plan's 100 GB storage.
- The script is resumable: rerun to retry any failures (written to `mirror-failures.json`).
- Until you run it, cards display generated fallback artwork, the app works fine without images.
- After it finishes, commit the updated `afl_cards.json` and redeploy.

## Image priority per card

For any card the app shows, in order: your own private photo if you've added one, else the catalog image (once mirrored), else generated fallback art. When you photograph a card's front or back in the app, it's compressed client-side and saved to YOUR collection only, other users never see it. The catalog image (mirrored from the source sheet) is the shared default everyone sees until they add their own.

## Security notes

- The anon key is safe to expose in the frontend; row level security in `schema.sql` is what protects the data
- Users can only read/write their own collection, only delete their own listings
- Card photos are community-shared by design: latest upload per card side wins. If that gets abused, add a moderation flag column to `card_photos`
- Never commit `.env` (already in .gitignore)

## Next build phases

1. Run the image mirror (above) so real card photos show
2. Payments: Stripe Connect for actual buy/sell settlement (physical goods, so no Apple 30% cut)
3. Buyer to seller messaging
4. Follows and seller ratings (profile fields already exist)
5. Admin screen to review `card_submissions` and promote approved ones into the catalog
6. Real sales price history (from completed marketplace sales)
