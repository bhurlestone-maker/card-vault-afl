import { useState, useEffect, useMemo } from "react";
import { supabase } from "./lib/supabase";
import { CONDITIONS, key, safeKey, flat, teamCol, resizeImg, allBrands } from "./lib/catalog";

const AVATAR_COLORS = ["#5b2d8e","#c9a227","#c2452d","#1e7a3c","#014896","#111318","#e21937","#008aab"];

export default function App() {
  const [splash, setSplash] = useState(true);
  const [theme, setTheme] = useState("light");
  const [session, setSession] = useState(null);
  const [profile, setProfile] = useState(null);
  const [booted, setBooted] = useState(false);

  const [tab, setTab] = useState("profile");
  const [item, setItem] = useState(null);
  const [binder, setBinder] = useState(null);
  const [toast, setToast] = useState(null);

  // History for back/forward
  const [past, setPast] = useState([]);
  const [future, setFuture] = useState([]);
  const applyNav = (s) => { setTab(s.tab); setItem(s.item); setBinder(s.binder ?? null); };
  const navigate = (next) => { setPast((p) => [...p, { tab, item, binder }]); setFuture([]); applyNav(next); };
  const goBack = () => { if (!past.length) return; const prev = past[past.length - 1]; setPast(past.slice(0, -1)); setFuture((f) => [{ tab, item, binder }, ...f]); applyNav(prev); };
  const goFwd = () => { if (!future.length) return; const nxt = future[0]; setFuture(future.slice(1)); setPast((p) => [...p, { tab, item, binder }]); applyNav(nxt); };

  const [collection, setCollection] = useState([]);
  const [listings, setListings] = useState([]);
  const [photos, setPhotos] = useState({});
  const [wishlist, setWishlist] = useState([]);
  const [followCounts, setFollowCounts] = useState({ scouts: 0, scouting: 0 });

  // Search filters
  const [q, setQ] = useState("");
  const [brand, setBrand] = useState("");
  const [yearFrom, setYearFrom] = useState("");
  const [yearTo, setYearTo] = useState("");
  const [teamsSel, setTeamsSel] = useState(new Set());
  const [view, setView] = useState("list"); // list | tile | tileSm
  const [collView, setCollView] = useState("list");
  const [collSort, setCollSort] = useState("team"); // team | year | player | recent

  const [addSheet, setAddSheet] = useState(null);
  const [sellSheet, setSellSheet] = useState(null);
  const [submitSheet, setSubmitSheet] = useState(false);
  const [avatarSheet, setAvatarSheet] = useState(false);
  const [cond, setCond] = useState("Near Mint");
  const [qty, setQty] = useState(1);
  const [price, setPrice] = useState("");
  const [saleType, setSaleType] = useState("sale");
  const [side, setSide] = useState("front");
  const [viewMine, setViewMine] = useState(false);

  const flash = (m) => { setToast(m); setTimeout(() => setToast(null), 2200); };

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => { setSession(data.session); setBooted(true); });
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => setSession(s));
    return () => sub.subscription.unsubscribe();
  }, []);
  useEffect(() => { if (session) loadAll(); else { setProfile(null); setCollection([]); setWishlist([]); } }, [session]);
  useEffect(() => { setSide("front"); setViewMine(false); }, [item]);

  const loadAll = async () => {
    const uid = session.user.id;
    let { data: p } = await supabase.from("profiles").select().eq("id", uid).maybeSingle();
    if (!p) {
      const m = session.user.user_metadata || {};
      const username = m.username || (session.user.email || "collector").split("@")[0];
      const ins = await supabase.from("profiles").insert({ id: uid, username, bio: m.bio || "AFL card collector. Building the vault." }).select().single();
      p = ins.data;
    }
    setProfile(p);
    const { data: coll } = await supabase.from("collections").select().eq("user_id", uid);
    setCollection(coll || []);
    const { data: wl } = await supabase.from("wishlist").select().eq("user_id", uid);
    setWishlist((wl || []).map((w) => w.card_key));
    const [{ count: scouts }, { count: scouting }] = await Promise.all([
      supabase.from("follows").select("*", { count: "exact", head: true }).eq("followee_id", uid),
      supabase.from("follows").select("*", { count: "exact", head: true }).eq("follower_id", uid),
    ]);
    setFollowCounts({ scouts: scouts || 0, scouting: scouting || 0 });
    await refreshListings();
    await refreshPhotos();
  };
  const refreshListings = async () => {
    const { data } = await supabase.from("listings").select().order("listed_at", { ascending: false });
    setListings(data || []);
  };
  const refreshPhotos = async () => {
    const { data } = await supabase.from("my_card_photos").select().eq("user_id", session.user.id);
    const map = {};
    (data || []).forEach((r) => { map[r.card_key] = map[r.card_key] || {}; map[r.card_key][r.side] = r.url; });
    setPhotos(map);
  };

  // ---------- Auth ----------
  const [authMode, setAuthMode] = useState("signin");
  const [authErr, setAuthErr] = useState("");
  const [authOk, setAuthOk] = useState("");
  const [busy, setBusy] = useState(false);
  const [f, setF] = useState({ email: "", username: "", password: "", bio: "" });
  const signup = async () => {
    setAuthErr(""); setAuthOk("");
    if (!f.email.trim() || !f.password || !f.username.trim()) { setAuthErr("Email, username and password are required."); return; }
    setBusy(true);
    const { data, error } = await supabase.auth.signUp({ email: f.email.trim(), password: f.password, options: { data: { username: f.username.trim(), bio: f.bio.trim() } } });
    setBusy(false);
    if (error) { setAuthErr(error.message); return; }
    if (!data.session) setAuthOk("Account created. Check your email to confirm, then sign in.");
  };
  const signin = async () => {
    setAuthErr(""); setAuthOk(""); setBusy(true);
    const { error } = await supabase.auth.signInWithPassword({ email: f.email.trim(), password: f.password });
    setBusy(false);
    if (error) setAuthErr(error.message);
  };
  const signout = async () => { await supabase.auth.signOut(); setPast([]); setFuture([]); setTab("profile"); setItem(null); };

  // ---------- Catalogue ----------
  const all = useMemo(flat, []);
  const brands = allBrands;
  const allYears = useMemo(() => [...new Set(all.map((c) => c.year))].sort((a, b) => b - a), [all]);
  const teamOptions = useMemo(() => {
    const counts = {};
    all.forEach((c) => { if (c.team && c.team !== "Unknown") counts[c.team] = (counts[c.team] || 0) + 1; });
    return Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 30).map(([t]) => t).sort();
  }, [all]);

  const RENDER_CAP = 60;
  const filtered = useMemo(() => {
    const tokens = q.trim().toLowerCase().split(/\s+/).filter(Boolean);
    return all.filter((c) => {
      if (brand && c.brand !== brand) return false;
      if (yearFrom && c.year < +yearFrom) return false;
      if (yearTo && c.year > +yearTo) return false;
      if (teamsSel.size && !teamsSel.has(c.team)) return false;
      if (tokens.length === 0) return true;
      const hay = `${c.player} ${c.team} ${c.brand} ${c.set} ${c.year} ${c.no} ${c.variety} ${c.sku}`.toLowerCase();
      return tokens.every((t) => hay.includes(t));
    });
  }, [all, brand, yearFrom, yearTo, teamsSel, q]);
  const results = filtered.slice(0, RENDER_CAP);
  const hasFilters = q || brand || yearFrom || yearTo || teamsSel.size > 0;
  const clearAll = () => { setQ(""); setBrand(""); setYearFrom(""); setYearTo(""); setTeamsSel(new Set()); };
  const toggleTeam = (t) => { const n = new Set(teamsSel); n.has(t) ? n.delete(t) : n.add(t); setTeamsSel(n); };

  const owned = (c) => collection.find((i) => i.card_key === key(c));
  const prem = (c) => (c.variety || "Base") !== "Base" && !/^base/i.test(c.variety || "");
  const synth = (i) => ({ mfg: i.brand, brand: i.brand, year: i.year, set: i.set_name, variety: i.variety || "Base", team: i.team, player: i.player, no: i.card_no, sku: "", img: "" });
  const toCard = (rowOrCard) => rowOrCard.card_key ? (all.find((x) => key(x) === rowOrCard.card_key) || synth(rowOrCard)) : rowOrCard;
  const openItem = (c) => navigate({ tab, item: c, binder });

  const stockThumb = (c) => { const cat = c.card_key ? all.find((x) => key(x) === c.card_key) : c; return cat && cat.img ? [cat.img] : []; };
  const myThumb = (c) => { const k = c.card_key || key(c); const p = photos[k]; const l = []; if (p && p.front) l.push(p.front); return [...l, ...stockThumb(c)]; };

  const binders = useMemo(() => {
    const g = {};
    collection.forEach((i) => { g[i.brand] = g[i.brand] || []; g[i.brand].push(i); });
    return Object.entries(g).map(([name, items]) => ({ name, count: items.reduce((a, i) => a + i.qty, 0) }));
  }, [collection]);

  const sortedCollection = useMemo(() => {
    const src = binder ? collection.filter((i) => i.brand === binder) : [...collection];
    if (collSort === "player") return { groups: [["", src.sort((a, b) => a.player.localeCompare(b.player))]] };
    if (collSort === "recent") return { groups: [["", src.sort((a, b) => (b.created_at || "").localeCompare(a.created_at || ""))]] };
    const field = collSort === "team" ? "team" : "year";
    const g = {};
    src.forEach((i) => { const k = String(i[field] || "Other"); g[k] = g[k] || []; g[k].push(i); });
    const keys = Object.keys(g).sort(collSort === "year" ? (a, b) => b.localeCompare(a) : undefined);
    return { groups: keys.map((k) => [k, g[k].sort((a, b) => a.player.localeCompare(b.player))]) };
  }, [collection, binder, collSort]);

  // ---------- Collection ops ----------
  const addCard = async () => {
    const c = addSheet, k = key(c), uid = session.user.id;
    const existing = collection.find((i) => i.card_key === k);
    if (existing) {
      const { data, error } = await supabase.from("collections").update({ qty: existing.qty + qty, condition: cond }).eq("id", existing.id).select().single();
      if (error) { flash("Save failed"); return; }
      setCollection(collection.map((i) => (i.id === existing.id ? data : i)));
    } else {
      const { data, error } = await supabase.from("collections").insert({
        user_id: uid, card_key: k, brand: c.brand, year: c.year, set_name: c.set,
        card_no: c.no, player: c.player, team: c.team, variety: c.variety, condition: cond, qty,
      }).select().single();
      if (error) { flash("Save failed"); return; }
      setCollection([...collection, data]);
    }
    setAddSheet(null); flash(`${c.player} added`);
  };
  const removeCard = async (i) => {
    const { error } = await supabase.from("collections").delete().eq("id", i.id);
    if (error) { flash("Remove failed"); return; }
    setCollection(collection.filter((x) => x.id !== i.id));
  };

  // ---------- Wishlist ----------
  const toggleWish = async (c) => {
    const k = key(c);
    if (wishlist.includes(k)) {
      await supabase.from("wishlist").delete().match({ user_id: session.user.id, card_key: k });
      setWishlist(wishlist.filter((x) => x !== k)); flash("Removed from wishlist");
    } else {
      const { error } = await supabase.from("wishlist").insert({ user_id: session.user.id, card_key: k });
      if (error) { flash("Wishlist needs the schema update, see README"); return; }
      setWishlist([...wishlist, k]); flash("Added to wishlist");
    }
  };
  const wishCards = useMemo(() => wishlist.map((k) => all.find((x) => key(x) === k)).filter(Boolean), [wishlist, all]);

  // ---------- Marketplace ----------
  const sell = async () => {
    const p = parseFloat(price);
    if (saleType === "sale" && (!p || p <= 0)) { flash("Enter a price"); return; }
    const i = sellSheet;
    const { error } = await supabase.from("listings").insert({
      seller_id: session.user.id, seller_name: profile.username,
      card_key: i.card_key || key(i), brand: i.brand, year: i.year,
      set_name: i.set_name || i.set, card_no: i.card_no || i.no,
      player: i.player, team: i.team, variety: i.variety,
      condition: cond, price: saleType === "sale" ? p : null, listing_type: saleType,
    });
    if (error) { flash("Listing failed"); return; }
    await refreshListings();
    setSellSheet(null); setPrice("");
    flash(saleType === "sale" ? `Listed for $${p.toFixed(2)}` : "Listed for trade");
  };
  const delist = async (id) => {
    const { error } = await supabase.from("listings").delete().eq("id", id);
    if (error) { flash("Delist failed"); return; }
    setListings(listings.filter((l) => l.id !== id)); flash("Delisted");
  };

  // ---------- Submissions ----------
  const submitCard = async (form) => {
    if (!form.player.trim() || !form.year) { flash("Player and year required"); return false; }
    const { error } = await supabase.from("card_submissions").insert({
      submitter_id: session.user.id, submitter_name: profile?.username,
      mfg: form.mfg.trim() || "Unknown", year: parseInt(form.year) || null,
      set_name: form.set.trim(), variety: form.variety.trim() || "Base",
      team: form.team.trim(), player: form.player.trim(), card_no: form.no.trim(), note: form.note.trim(),
    });
    if (error) { flash("Submission failed"); return false; }
    flash("Card submitted, thanks"); return true;
  };

  // ---------- Photos (private) ----------
  const onPhoto = async (e) => {
    const file = e.target.files && e.target.files[0];
    if (!file || !item) return;
    e.target.value = "";
    if (!owned(item)) { flash("Add the card to your collection first"); return; }
    try {
      flash("Uploading...");
      const blob = await resizeImg(file);
      const k = key(item); const uid = session.user.id;
      const path = `private/${uid}/${safeKey(k)}-${side}.jpg`;
      const up = await supabase.storage.from("card-photos").upload(path, blob, { upsert: true, contentType: "image/jpeg" });
      if (up.error) { flash("Upload failed"); return; }
      const { data: pub } = supabase.storage.from("card-photos").getPublicUrl(path);
      const url = `${pub.publicUrl}?v=${Date.now()}`;
      const { error } = await supabase.from("my_card_photos").upsert({ user_id: uid, card_key: k, side, url }, { onConflict: "user_id,card_key,side" });
      if (error) { flash("Save failed"); return; }
      setPhotos({ ...photos, [k]: { ...(photos[k] || {}), [side]: url } });
      setViewMine(true); flash("Photo saved to your copy");
    } catch { flash("Couldn't read that image"); }
  };
  const removePhoto = async () => {
    if (!item) return;
    const k = key(item); const uid = session.user.id;
    await supabase.from("my_card_photos").delete().match({ user_id: uid, card_key: k, side });
    await supabase.storage.from("card-photos").remove([`private/${uid}/${safeKey(k)}-${side}.jpg`]);
    const next = { ...photos };
    if (next[k]) { delete next[k][side]; if (!next[k].front && !next[k].back) delete next[k]; }
    setPhotos(next); setViewMine(false); flash("Photo removed, stock restored");
  };

  // ---------- Avatar ----------
  const saveAvatar = async (emoji, color) => {
    const { data, error } = await supabase.from("profiles").update({ avatar: emoji, avatar_color: color }).eq("id", session.user.id).select().single();
    if (error) { flash("Avatar needs the schema update, see README"); return; }
    setProfile(data); setAvatarSheet(false); flash("Avatar updated");
  };

  if (!booted) return <div className={`app ${theme}`} />;

  // ================= SPLASH =================
  if (splash) {
    return (
      <div className="splash">
        <div className="tag">The home of AFL card collecting</div>
        <div className="wordmark">Card <span>Vault</span></div>
        <button className="enter" onClick={() => setSplash(false)}>Enter the Vault</button>
        <div className="sub">Catalogue &middot; Collection &middot; Marketplace</div>
      </div>
    );
  }

  // ================= AUTH =================
  if (!session) {
    const isUp = authMode === "signup";
    return (
      <div className={`app ${theme}`}>
        <div className="auth-wrap">
          <div className="auth-card">
            <span className="wordmark">Card Vault</span>
            <h2>{isUp ? "Join the Vault" : "Welcome back"}</h2>
            <p className="sub">Your collection awaits</p>
            <label className="fld" htmlFor="ae">Email</label>
            <input id="ae" type="email" placeholder="you@example.com" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} />
            {isUp && <><label className="fld" htmlFor="an">Username</label>
              <input id="an" type="text" placeholder="player-ish-bish" value={f.username} onChange={(e) => setF({ ...f, username: e.target.value })} /></>}
            <label className="fld" htmlFor="ap">Password</label>
            <input id="ap" type="password" placeholder="********" value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} />
            {isUp && <><label className="fld" htmlFor="ab">Bio (optional)</label>
              <textarea id="ab" rows="2" placeholder="A collector since the 90s..." value={f.bio} onChange={(e) => setF({ ...f, bio: e.target.value })} /></>}
            {authErr && <p className="autherr">{authErr}</p>}
            {authOk && <p className="authok">{authOk}</p>}
            <button className="btn" disabled={busy} onClick={isUp ? signup : signin}>{busy ? "Working..." : isUp ? "Create Account" : "Sign In"}</button>
            <p className="authswap">
              {isUp ? <>Have an account? <a onClick={() => { setAuthMode("signin"); setAuthErr(""); setAuthOk(""); }}>Sign in</a></>
                : <>New here? <a onClick={() => { setAuthMode("signup"); setAuthErr(""); setAuthOk(""); }}>Create an account</a></>}
            </p>
          </div>
        </div>
      </div>
    );
  }

  const TopBar = () => (
    <div className="topbar">
      <span className="brand">Card Vault<span className="afl">AFL</span></span>
      <div className="navgroup">
        <button className="iconbtn" onClick={goBack} disabled={!past.length} aria-label="Back">&#8592;</button>
        <button className="iconbtn" onClick={goFwd} disabled={!future.length} aria-label="Forward">&#8594;</button>
        <button className="iconbtn" onClick={() => setTheme(theme === "light" ? "dark" : "light")}>{theme === "light" ? "Dark" : "Light"}</button>
        <button className="iconbtn" onClick={signout}>Out</button>
      </div>
    </div>
  );

  // ================= ITEM PAGE =================
  if (item) {
    const c = item;
    const similar = all.filter((x) => x.set === c.set && x.year === c.year && key(x) !== key(c)).slice(0, 4);
    const have = owned(c);
    const ph = photos[key(c)] || {};
    const hasMine = Boolean(ph.front || ph.back);
    const stockSrcs = c.img ? [c.img] : [];
    const mineSrc = ph[side];
    const showMine = viewMine && have && mineSrc;
    const wished = wishlist.includes(key(c));
    const sameListings = listings.filter((l) => l.card_key === key(c));
    const priceRef = sameListings.find((l) => l.price)?.price;
    const similarListings = listings.filter((l) => l.card_key !== key(c) && (
      (priceRef && l.price && Math.abs(l.price - priceRef) / priceRef <= 0.3) || l.year === c.year
    )).slice(0, 5);
    return (
      <div className={`app ${theme}`}>
        <TopBar />
        <main className="pane">
          <h1 className="item-title">{c.no ? `${c.no} - ` : ""}{c.player}</h1>
          <p className="item-set">{c.brand} {c.set} ({c.year})</p>
          <div className="item-grid">
            <div className="cardwrap">
              <div className="flipbar">
                <button className={side === "front" ? "on" : ""} onClick={() => setSide("front")}>Front</button>
                <button className={side === "back" ? "on" : ""} onClick={() => setSide("back")}>Back</button>
              </div>
              <div className={`cardface ${prem(c) ? "prem" : ""}`}>
                {showMine
                  ? <img className="userphoto" src={mineSrc} alt={`Your ${c.player} ${side}`} />
                  : side === "front"
                    ? <CardImg srcs={stockSrcs} alt={`${c.player} front`} fallback={<StockFront c={c} />} />
                    : <CardImg srcs={[]} alt={`${c.player} back`} fallback={<StockBack c={c} />} />}
              </div>
              {have && hasMine && (
                <div className="flipbar">
                  <button className={!viewMine ? "on" : ""} onClick={() => setViewMine(false)}>Stock</button>
                  <button className={viewMine ? "on" : ""} onClick={() => setViewMine(true)}>My photo</button>
                </div>
              )}
              <div className="photobtns">
                {have ? (<>
                  <label className="photobtn">
                    {ph[side] ? `Replace my ${side} photo` : `Photo my copy (${side})`}
                    <input type="file" accept="image/*" capture="environment" onChange={onPhoto} />
                  </label>
                  {ph[side] && <button className="photobtn" onClick={removePhoto}>Remove my photo</button>}
                </>) : (
                  <div className="photohint">Add this card to your collection to upload your own photo.</div>
                )}
              </div>
            </div>
            <div className="specs">
              {c.no && <div className="big">No. {c.no}</div>}
              <div><b>Category:</b> AFL Sports Card</div>
              <div><b>Sport:</b> Australian Football</div>
              <div><b>Team:</b> {c.team}</div>
              <div><b>Manufacturer:</b> {c.brand}</div>
              <div><b>Year:</b> {c.year}</div>
              <div className="spec-h">Set: {c.set}</div>
              <div><b>Variety:</b> {c.variety}</div>
              <div><b>Condition:</b> {have ? have.condition : "Ungraded"}</div>
              <div><b>Dimensions:</b> 63mm x 88mm</div>
              {c.sku && <div className="spec-h">SKU: {c.sku}</div>}
            </div>
          </div>
          <p className="para"><b>Information:</b> {c.player} {(c.variety || "Base") === "Base" ? "base card" : (c.variety || "").toLowerCase() + " card"} from the {c.year} {c.brand} {c.set} release{c.team && c.team !== "Unknown" ? `, a piece for ${c.team} collectors` : ""}.</p>
          {have && <p className="para"><b>Provenance:</b> In your collection, held as {have.condition}, quantity {have.qty}.</p>}
          {sameListings.length > 0 && (
            <div className="morelike">
              <h4>This card in the marketplace</h4>
              {sameListings.map((l) => (
                <div className="row slim" key={l.id} style={{ cursor: "default" }}>
                  <div style={{ flex: 1 }}>
                    <div className="p">@{l.seller_name}</div>
                    <div className="m">{l.condition} &middot; {l.listing_type === "trade" ? "Open to trade" : ""}</div>
                  </div>
                  <span className="price">{l.listing_type === "trade" ? "TRADE" : `$${Number(l.price).toFixed(2)}`}</span>
                </div>
              ))}
            </div>
          )}
          {similarListings.length > 0 && (
            <div className="morelike">
              <h4>Similar listings</h4>
              {similarListings.map((l) => (
                <button className="row slim" key={l.id} onClick={() => openItem(toCard(l))}>
                  <Mini c={l} urls={stockThumb(l)} prem={prem(l)} />
                  <div style={{ flex: 1 }}>
                    <div className="p">{l.player}</div>
                    <div className="m">{l.year} {l.brand} {l.set_name} &middot; @{l.seller_name}</div>
                  </div>
                  <span className="price">{l.listing_type === "trade" ? "TRADE" : `$${Number(l.price).toFixed(2)}`}</span>
                </button>
              ))}
            </div>
          )}
          {similar.length > 0 && (
            <div className="morelike">
              <h4>More from this set...</h4>
              <div className="strip">
                {similar.map((s) => (
                  <button key={key(s)} onClick={() => openItem(s)}>
                    <Mini c={s} urls={stockThumb(s)} prem={prem(s)} />
                    <div className="cap">{s.player}</div>
                  </button>
                ))}
              </div>
            </div>
          )}
          <div className="item-actions">
            <button className="btn" onClick={() => { setCond("Near Mint"); setQty(1); setAddSheet(c); }}>
              {have ? `Owned x${have.qty} · Add more` : "Add to collection"}
            </button>
            <button className={`heart ${wished ? "on" : ""}`} onClick={() => toggleWish(c)} aria-label="Wishlist">{wished ? "♥" : "♡"}</button>
            {have && <button className="btn gold" onClick={() => { setCond(have.condition); setPrice(""); setSaleType("sale"); setSellSheet(have); }}>Sell / Trade</button>}
          </div>
        </main>
        {addSheet && <AddSheet c={addSheet} cond={cond} setCond={setCond} qty={qty} setQty={setQty} onClose={() => setAddSheet(null)} onAdd={addCard} />}
        {sellSheet && <SellSheet c={sellSheet} cond={cond} setCond={setCond} price={price} setPrice={setPrice} saleType={saleType} setSaleType={setSaleType} onClose={() => setSellSheet(null)} onSell={sell} />}
        {toast && <div className="toast">{toast}</div>}
        <TabBar tab={tab} onGo={(t) => navigate({ tab: t, item: null, binder: null })} />
      </div>
    );
  }

  // ================= MAIN TABS =================
  return (
    <div className={`app ${theme}`}>
      <TopBar />

      {tab === "profile" && (
        <main className="pane">
          <div className="prof-head">
            <div className="avatar" style={{ background: profile?.avatar_color || "#5b2d8e" }} onClick={() => setAvatarSheet(true)} title="Edit avatar">
              {profile?.avatar || (profile?.username || "?")[0].toUpperCase()}
            </div>
            <div>
              <h2>{profile?.username || "..."}</h2>
              <div className="stats">
                <span>Cards: <b>{collection.reduce((a, i) => a + i.qty, 0)}</b></span>
                <span>Scouts: <b>{followCounts.scouts}</b></span>
                <span>Scouting: <b>{followCounts.scouting}</b></span>
              </div>
              <p className="bio">{profile?.bio}</p>
            </div>
          </div>
          <div className="sect">Binders</div>
          {binders.length === 0 ? (
            <div className="empty">No binders yet.<br />Add cards from Search and they'll group here by brand.</div>
          ) : (
            <div className="grid">
              {binders.map((b) => (
                <button className="binder" key={b.name} onClick={() => navigate({ tab: "collection", item: null, binder: b.name })}>
                  <div className="tileb"><span className="pub">PUBLIC</span><span className="cnt">{b.count}</span>
                    <span style={{ fontSize: 11, color: "var(--mut)" }}>cards</span></div>
                  <span className="lbl">{b.name} Collectables</span>
                </button>
              ))}
            </div>
          )}
          <div className="sect">Wishlist</div>
          {wishCards.length === 0 ? (
            <div className="empty">Nothing wished for yet. Tap the ♡ on any card.</div>
          ) : wishCards.map((c) => (
            <button className="row slim" key={key(c)} onClick={() => openItem(c)}>
              <Mini c={c} urls={stockThumb(c)} prem={prem(c)} />
              <div><div className="p">{c.player}</div><div className="m">{c.team} &middot; {c.year} {c.brand} {c.set}</div></div>
            </button>
          ))}
        </main>
      )}

      {tab === "search" && (
        <main className="pane">
          <div className="searchline">
            <input type="text" aria-label="Search the catalogue" placeholder="Search anything: player, club, set, year, card no, SKU" value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
          <div className="chips">
            {teamOptions.map((t) => (
              <button key={t} className={`chip ${teamsSel.has(t) ? "on" : ""}`} onClick={() => toggleTeam(t)}>{t}</button>
            ))}
          </div>
          <div className="filters compact">
            <select aria-label="Brand" value={brand} onChange={(e) => setBrand(e.target.value)}>
              <option value="">Brand</option>{brands.map((b) => <option key={b}>{b}</option>)}
            </select>
            <select aria-label="Year from" value={yearFrom} onChange={(e) => setYearFrom(e.target.value)}>
              <option value="">From</option>{allYears.map((y) => <option key={y}>{y}</option>)}
            </select>
            <select aria-label="Year to" value={yearTo} onChange={(e) => setYearTo(e.target.value)}>
              <option value="">To</option>{allYears.map((y) => <option key={y}>{y}</option>)}
            </select>
            <select aria-label="View" value={view} onChange={(e) => setView(e.target.value)}>
              <option value="list">List</option><option value="tile">Tiles</option><option value="tileSm">Small tiles</option>
            </select>
          </div>
          <div className="filterrow">
            <p className="count">{filtered.length.toLocaleString()} card{filtered.length !== 1 ? "s" : ""}{filtered.length > RENDER_CAP ? ` · showing first ${RENDER_CAP}` : ""}</p>
            {hasFilters && <button className="clearall" onClick={clearAll}>Clear all</button>}
          </div>
          {view === "list" ? results.map((c) => (
            <button className="row slim" key={key(c)} onClick={() => openItem(c)}>
              <Mini c={c} urls={stockThumb(c)} prem={prem(c)} />
              <div><div className="p">{c.player}</div>
                <div className="m">{c.team} &middot; {c.year} {c.brand} {c.set}</div>
                {prem(c) && <div className="v">{c.variety}</div>}</div>
              {owned(c) && <span className="price" style={{ fontSize: 11 }}>Owned</span>}
            </button>
          )) : (
            <TileGrid cards={results} small={view === "tileSm"} onOpen={openItem} thumb={stockThumb} prem={prem} />
          )}
          {filtered.length === 0 && <div className="empty">No cards match.<br />Clear the filters, or add a missing card below.</div>}
          <button className="btn line" style={{ marginTop: 12 }} onClick={() => setSubmitSheet(true)}>+ Add a missing card</button>
          <p className="note">{all.length.toLocaleString()} cards in the catalogue. Spotted a gap? Add it.</p>
        </main>
      )}

      {tab === "collection" && (
        <main className="pane">
          {binder && <button className="back" onClick={() => setBinder(null)}>&#8592; Clear {binder} filter</button>}
          <div className="viewbar">
            <span style={{ fontSize: 11, color: "var(--mut)", fontWeight: 600 }}>Group by</span>
            <select value={collSort} onChange={(e) => setCollSort(e.target.value)}>
              <option value="team">Team</option><option value="year">Year</option>
              <option value="player">Player A-Z</option><option value="recent">Recently added</option>
            </select>
            <button className={`vbtn ${collView === "list" ? "on" : ""}`} onClick={() => setCollView("list")}>List</button>
            <button className={`vbtn ${collView === "tile" ? "on" : ""}`} onClick={() => setCollView("tile")}>Tiles</button>
            <button className={`vbtn ${collView === "tileSm" ? "on" : ""}`} onClick={() => setCollView("tileSm")}>Small</button>
          </div>
          {collection.length === 0 ? (
            <div className="empty">Nothing in the vault yet.<br />Find cards in Search and add them.</div>
          ) : sortedCollection.groups.map(([gname, items]) => (
            <div key={gname || "all"}>
              {gname && <div className="grouph">{gname}</div>}
              {collView === "list" ? items.map((i) => (
                <div className="row" key={i.id} style={{ cursor: "default" }}>
                  <button style={{ background: "none", border: "none", padding: 0, cursor: "pointer" }} onClick={() => openItem(toCard(i))} aria-label={`Open ${i.player}`}>
                    <Mini c={i} urls={myThumb(i)} prem={prem(i)} />
                  </button>
                  <div style={{ flex: 1, cursor: "pointer" }} onClick={() => openItem(toCard(i))}>
                    <div className="p">{i.player}{i.qty > 1 ? ` x${i.qty}` : ""}</div>
                    <div className="m">{i.team} &middot; {i.year} {i.brand} {i.set_name}</div>
                    <div className="m">{i.condition}</div>
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                    <button className="btn small gold" onClick={() => { setCond(i.condition); setPrice(""); setSaleType("sale"); setSellSheet(i); }}>Sell</button>
                    <button className="danger" onClick={() => removeCard(i)}>Remove</button>
                  </div>
                </div>
              )) : (
                <TileGrid cards={items} small={collView === "tileSm"} onOpen={(i) => openItem(toCard(i))} thumb={myThumb} prem={prem} isCollection />
              )}
            </div>
          ))}
        </main>
      )}

      {tab === "market" && (
        <main className="pane">
          {listings.length === 0 ? (
            <div className="empty">No live listings.<br />Sell or trade from your collection to open the market.</div>
          ) : listings.map((l) => (
            <div className="row" key={l.id} style={{ cursor: "default" }}>
              <button style={{ background: "none", border: "none", padding: 0, cursor: "pointer" }} onClick={() => openItem(toCard(l))} aria-label={`Open ${l.player}`}>
                <Mini c={l} urls={stockThumb(l)} prem={prem(l)} />
              </button>
              <div style={{ flex: 1, cursor: "pointer" }} onClick={() => openItem(toCard(l))}>
                <div className="p">{l.player}</div>
                <div className="m">{l.team} &middot; {l.year} {l.brand} {l.set_name}</div>
                <div className="m">{l.condition} &middot; @{l.seller_name} &middot; {String(l.listed_at).slice(0, 10)}</div>
              </div>
              <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 6 }}>
                <span className="price">{l.listing_type === "trade" ? "TRADE" : `$${Number(l.price).toFixed(2)}`}</span>
                {l.seller_id === session.user.id && <button className="danger" onClick={() => delist(l.id)}>Delist</button>}
              </div>
            </div>
          ))}
          <p className="note">Listings are public to all signed-in collectors. Tap a listing to compare it and see similar items on its card page.</p>
        </main>
      )}

      {addSheet && <AddSheet c={addSheet} cond={cond} setCond={setCond} qty={qty} setQty={setQty} onClose={() => setAddSheet(null)} onAdd={addCard} />}
      {sellSheet && <SellSheet c={sellSheet} cond={cond} setCond={setCond} price={price} setPrice={setPrice} saleType={saleType} setSaleType={setSaleType} onClose={() => setSellSheet(null)} onSell={sell} />}
      {submitSheet && <SubmitSheet onClose={() => setSubmitSheet(false)} onSubmit={submitCard} />}
      {avatarSheet && <AvatarSheet profile={profile} onClose={() => setAvatarSheet(false)} onSave={saveAvatar} />}
      {toast && <div className="toast">{toast}</div>}
      <TabBar tab={tab} onGo={(t) => navigate({ tab: t, item: null, binder: null })} />
    </div>
  );
}

// ---------------- Components ----------------
function Mini({ c, urls, prem }) {
  const [idx, setIdx] = useState(0);
  useEffect(() => { setIdx(0); }, [urls.join("|")]);
  const src = urls[idx];
  return (
    <div className={`mini ${prem ? "prem" : ""}`} style={{ position: "relative", overflow: "hidden" }}>
      {c.no || c.card_no}
      {src && <img src={src} alt="" loading="lazy" onError={() => setIdx(idx + 1)}
        style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" }} />}
    </div>
  );
}
function CardImg({ srcs, alt, fallback }) {
  const [idx, setIdx] = useState(0);
  useEffect(() => { setIdx(0); }, [srcs.join("|")]);
  const src = srcs[idx];
  if (!src) return fallback;
  return <img className="userphoto" src={src} alt={alt} onError={() => setIdx(idx + 1)} />;
}
function TileGrid({ cards, small, onOpen, thumb, prem, isCollection }) {
  return (
    <div className={`tilegrid ${small ? "sm" : ""}`}>
      {cards.map((c) => (
        <button className="tile" key={c.id || key(c)} onClick={() => onOpen(c)}>
          <TileFace c={c} urls={thumb(c)} prem={prem(c)} />
          <div className="tn">{c.player}{isCollection && c.qty > 1 ? ` x${c.qty}` : ""}</div>
          <div className="tm">{c.year} {c.set_name || c.set}</div>
        </button>
      ))}
    </div>
  );
}
function TileFace({ c, urls, prem }) {
  const [idx, setIdx] = useState(0);
  useEffect(() => { setIdx(0); }, [urls.join("|")]);
  const src = urls[idx];
  return (
    <div className={`face ${prem ? "prem" : ""}`}>
      {c.no || c.card_no}
      {src && <img src={src} alt="" loading="lazy" onError={() => setIdx(idx + 1)} />}
    </div>
  );
}
function TabBar({ tab, onGo }) {
  return (
    <nav className="tabs">
      {["profile", "search", "collection", "market"].map((t) => (
        <button key={t} className={tab === t ? "on" : ""} onClick={() => onGo(t)}>
          {t === "market" ? "Marketplace" : t === "search" ? "Catalogue" : t[0].toUpperCase() + t.slice(1)}
        </button>
      ))}
    </nav>
  );
}
function StockFront({ c }) {
  const [c1, c2] = teamCol(c.team);
  const premium = (c.variety || "Base") !== "Base";
  return (
    <div className="cf-front" style={{ background: `linear-gradient(155deg, ${c1} 0%, ${c2} 100%)` }}>
      <div className="cf-topstrip"><span>{c.brand}</span><span>{c.year}</span></div>
      {premium && <div className="cf-var">{c.variety}</div>}
      <div className="cf-art">
        <svg className="cf-sil" viewBox="0 0 100 110" role="img" aria-label="Player silhouette">
          <g fill="rgba(255,255,255,0.88)">
            <circle cx="50" cy="16" r="8.5" />
            <path d="M50 26 L45 50 L31 78 L37 82 L50 58 L60 84 L67 80 L56 50 L57 28 Z" />
            <path d="M46 32 L29 43 L32 48 L48 39 Z" /><path d="M55 31 L72 25 L74 30 L57 39 Z" />
            <ellipse cx="77" cy="55" rx="8" ry="5" transform="rotate(-24 77 55)" />
          </g>
        </svg>
      </div>
      <div className="cf-nameband">
        <div className="nm">{c.player}</div>
        <div className="tm">{c.team}{c.no ? ` · No. ${c.no}` : ""}</div>
      </div>
    </div>
  );
}
function StockBack({ c }) {
  return (
    <div className="cf-back">
      <div className="bh">{c.player}{c.no ? <span>#{c.no}</span> : null}</div>
      <div className="bstats">
        <div><span>Club</span><b>{c.team}</b></div><div><span>Set</span><b>{c.set}</b></div>
        <div><span>Year</span><b>{c.year}</b></div><div><span>Variety</span><b>{c.variety}</b></div>
        <div><span>Maker</span><b>{c.brand}</b></div>
      </div>
      <div className="btxt">{`Collector card for ${c.player}${c.no ? `, card ${c.no}` : ""} in the ${c.year} ${c.brand} ${c.set} release. No photo yet, add one from your copy.`}</div>
      <div className="bfoot">{c.brand} &middot; {c.year} &middot; 63 x 88 mm card stock</div>
    </div>
  );
}
function AddSheet({ c, cond, setCond, qty, setQty, onClose, onAdd }) {
  return (
    <div className="sheetback" onClick={onClose}>
      <div className="sheet" onClick={(e) => e.stopPropagation()}>
        <h3>Add to collection</h3>
        <p className="sub">{c.player} &middot; {c.year} {c.brand} {c.set || c.set_name} #{c.no || c.card_no}</p>
        <label className="fld" htmlFor="sc">Condition</label>
        <select id="sc" value={cond} onChange={(e) => setCond(e.target.value)}>{CONDITIONS.map((x) => <option key={x}>{x}</option>)}</select>
        <label className="fld" htmlFor="sq">Quantity</label>
        <input id="sq" type="number" min="1" value={qty} onChange={(e) => setQty(Math.max(1, parseInt(e.target.value) || 1))} />
        <div className="actions">
          <button className="btn line" onClick={onClose}>Cancel</button>
          <button className="btn" onClick={onAdd}>Add card</button>
        </div>
      </div>
    </div>
  );
}
function SellSheet({ c, cond, setCond, price, setPrice, saleType, setSaleType, onClose, onSell }) {
  return (
    <div className="sheetback" onClick={onClose}>
      <div className="sheet" onClick={(e) => e.stopPropagation()}>
        <h3>List this card</h3>
        <p className="sub">{c.player} &middot; {c.year} {c.brand} {c.set || c.set_name} #{c.no || c.card_no}</p>
        <div className="flipbar" style={{ marginBottom: 4 }}>
          <button className={saleType === "sale" ? "on" : ""} onClick={() => setSaleType("sale")}>For sale</button>
          <button className={saleType === "trade" ? "on" : ""} onClick={() => setSaleType("trade")}>For trade</button>
        </div>
        <label className="fld" htmlFor="lc">Condition</label>
        <select id="lc" value={cond} onChange={(e) => setCond(e.target.value)}>{CONDITIONS.map((x) => <option key={x}>{x}</option>)}</select>
        {saleType === "sale" && (<>
          <label className="fld" htmlFor="lp">Asking price (AUD)</label>
          <input id="lp" type="number" min="0" step="0.01" placeholder="0.00" value={price} onChange={(e) => setPrice(e.target.value)} />
        </>)}
        {saleType === "trade" && <p className="note">Trade listings show as TRADE in the marketplace; collectors contact you to negotiate.</p>}
        <div className="actions">
          <button className="btn line" onClick={onClose}>Cancel</button>
          <button className="btn gold" onClick={onSell}>{saleType === "sale" ? "Post listing" : "Post trade"}</button>
        </div>
      </div>
    </div>
  );
}
function SubmitSheet({ onClose, onSubmit }) {
  const [form, setForm] = useState({ mfg: "", year: "", set: "", variety: "", team: "", player: "", no: "", note: "" });
  const upd = (k, v) => setForm({ ...form, [k]: v });
  const go = async () => { const ok = await onSubmit(form); if (ok) onClose(); };
  return (
    <div className="sheetback" onClick={onClose}>
      <div className="sheet" onClick={(e) => e.stopPropagation()}>
        <h3>Add a missing card</h3>
        <p className="sub">Not in the catalogue? Add the details for review.</p>
        <label className="fld">Player *</label>
        <input value={form.player} onChange={(e) => upd("player", e.target.value)} placeholder="e.g. Tony Lockett" />
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          <div><label className="fld">Year *</label><input type="number" value={form.year} onChange={(e) => upd("year", e.target.value)} placeholder="2018" /></div>
          <div><label className="fld">Card no.</label><input value={form.no} onChange={(e) => upd("no", e.target.value)} placeholder="LGS18" /></div>
        </div>
        <label className="fld">Manufacturer</label>
        <input value={form.mfg} onChange={(e) => upd("mfg", e.target.value)} placeholder="Select" />
        <label className="fld">Set</label>
        <input value={form.set} onChange={(e) => upd("set", e.target.value)} placeholder="Footy Stars" />
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          <div><label className="fld">Variety</label><input value={form.variety} onChange={(e) => upd("variety", e.target.value)} placeholder="Base" /></div>
          <div><label className="fld">Team</label><input value={form.team} onChange={(e) => upd("team", e.target.value)} placeholder="St Kilda" /></div>
        </div>
        <label className="fld">Note (optional)</label>
        <textarea rows="2" value={form.note} onChange={(e) => upd("note", e.target.value)} placeholder="Anything that helps identify it" />
        <div className="actions">
          <button className="btn line" onClick={onClose}>Cancel</button>
          <button className="btn" onClick={go}>Submit card</button>
        </div>
      </div>
    </div>
  );
}
function AvatarSheet({ profile, onClose, onSave }) {
  const [emoji, setEmoji] = useState(profile?.avatar || "");
  const [color, setColor] = useState(profile?.avatar_color || "#5b2d8e");
  return (
    <div className="sheetback" onClick={onClose}>
      <div className="sheet" onClick={(e) => e.stopPropagation()}>
        <h3>Edit avatar</h3>
        <p className="sub">Pick an emoji (or leave blank for your initial) and a colour.</p>
        <label className="fld">Emoji</label>
        <input value={emoji} maxLength={4} onChange={(e) => setEmoji(e.target.value)} placeholder="e.g. 🏉" />
        <label className="fld">Colour</label>
        <div className="swatches">
          {AVATAR_COLORS.map((c) => (
            <button key={c} className={`swatch ${color === c ? "on" : ""}`} style={{ background: c }} onClick={() => setColor(c)} aria-label={c} />
          ))}
        </div>
        <div className="actions">
          <button className="btn line" onClick={onClose}>Cancel</button>
          <button className="btn" onClick={() => onSave(emoji.trim(), color)}>Save</button>
        </div>
      </div>
    </div>
  );
}
