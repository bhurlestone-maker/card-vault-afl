-- Card Vault AFL schema
-- Safe to run multiple times. Each policy is dropped first, so re-running
-- after a partial run (or a schema change) will not error.
-- Run in Supabase: SQL Editor > New query > paste all > Run

-- 1. Profiles (public username + bio per account)
create table if not exists profiles (
  id uuid primary key references auth.users on delete cascade,
  username text unique not null,
  bio text default '',
  created_at timestamptz default now()
);
alter table profiles enable row level security;
drop policy if exists "profiles are readable by everyone" on profiles;
create policy "profiles are readable by everyone" on profiles for select using (true);
drop policy if exists "users insert own profile" on profiles;
create policy "users insert own profile" on profiles for insert with check (auth.uid() = id);
drop policy if exists "users update own profile" on profiles;
create policy "users update own profile" on profiles for update using (auth.uid() = id);

-- 2. Collections (private to each user)
create table if not exists collections (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users on delete cascade,
  card_key text not null,
  brand text, year int, set_name text, card_no text,
  player text, team text, variety text, rarity text,
  condition text default 'Near Mint',
  qty int default 1 check (qty > 0),
  created_at timestamptz default now(),
  unique (user_id, card_key)
);
alter table collections enable row level security;
drop policy if exists "users manage own collection" on collections;
create policy "users manage own collection" on collections
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- 3. Marketplace listings (public read, owner write)
create table if not exists listings (
  id bigint generated always as identity primary key,
  seller_id uuid not null references auth.users on delete cascade,
  seller_name text not null,
  card_key text not null,
  brand text, year int, set_name text, card_no text,
  player text, team text, variety text,
  condition text,
  price numeric(10,2) not null check (price > 0),
  listed_at timestamptz default now()
);
alter table listings enable row level security;
drop policy if exists "listings readable by everyone" on listings;
create policy "listings readable by everyone" on listings for select using (true);
drop policy if exists "users create own listings" on listings;
create policy "users create own listings" on listings for insert with check (auth.uid() = seller_id);
drop policy if exists "users delete own listings" on listings;
create policy "users delete own listings" on listings for delete using (auth.uid() = seller_id);

-- 4. Private card photos (each user's own photos of their cards, visible only to them)
create table if not exists my_card_photos (
  user_id uuid not null references auth.users on delete cascade,
  card_key text not null,
  side text not null check (side in ('front','back')),
  url text not null,
  updated_at timestamptz default now(),
  primary key (user_id, card_key, side)
);
alter table my_card_photos enable row level security;
drop policy if exists "users read own photos" on my_card_photos;
create policy "users read own photos" on my_card_photos
  for select using (auth.uid() = user_id);
drop policy if exists "users insert own photos" on my_card_photos;
create policy "users insert own photos" on my_card_photos
  for insert with check (auth.uid() = user_id);
drop policy if exists "users update own photos" on my_card_photos;
create policy "users update own photos" on my_card_photos
  for update using (auth.uid() = user_id);
drop policy if exists "users delete own photos" on my_card_photos;
create policy "users delete own photos" on my_card_photos
  for delete using (auth.uid() = user_id);

-- 4b. Community card submissions (users propose cards missing from the catalog)
create table if not exists card_submissions (
  id bigint generated always as identity primary key,
  submitter_id uuid not null references auth.users on delete cascade,
  submitter_name text,
  mfg text, year int, set_name text, variety text,
  team text, player text, card_no text,
  note text,
  status text default 'pending' check (status in ('pending','approved','rejected')),
  created_at timestamptz default now()
);
alter table card_submissions enable row level security;
drop policy if exists "submissions readable by everyone" on card_submissions;
create policy "submissions readable by everyone" on card_submissions for select using (true);
drop policy if exists "signed-in users submit" on card_submissions;
create policy "signed-in users submit" on card_submissions
  for insert with check (auth.uid() = submitter_id);
drop policy if exists "users delete own submissions" on card_submissions;
create policy "users delete own submissions" on card_submissions
  for delete using (auth.uid() = submitter_id);

-- (Optional cleanup) remove the old shared photo table from earlier versions
drop table if exists card_photos;

-- 5. Storage bucket for the photo files
insert into storage.buckets (id, name, public)
values ('card-photos', 'card-photos', true)
on conflict (id) do nothing;

drop policy if exists "public read card photos" on storage.objects;
create policy "public read card photos" on storage.objects
  for select using (bucket_id = 'card-photos');
drop policy if exists "users upload to own folder" on storage.objects;
create policy "users upload to own folder" on storage.objects
  for insert with check (
    bucket_id = 'card-photos'
    and (storage.foldername(name))[1] = 'private'
    and (storage.foldername(name))[2] = auth.uid()::text
  );
drop policy if exists "users update own folder" on storage.objects;
create policy "users update own folder" on storage.objects
  for update using (
    bucket_id = 'card-photos'
    and (storage.foldername(name))[1] = 'private'
    and (storage.foldername(name))[2] = auth.uid()::text
  );
drop policy if exists "users delete own folder" on storage.objects;
create policy "users delete own folder" on storage.objects
  for delete using (
    bucket_id = 'card-photos'
    and (storage.foldername(name))[1] = 'private'
    and (storage.foldername(name))[2] = auth.uid()::text
  );

-- Old policy names from earlier versions, drop if present (harmless if absent)
drop policy if exists "signed-in upload card photos" on storage.objects;
drop policy if exists "signed-in update card photos" on storage.objects;
