import { useState, useEffect, useMemo } from "react";
import { supabase } from "./lib/supabase";
import { CONDITIONS, key, safeKey, flat, teamCol, resizeImg, allBrands, yearsFor, setsFor } from "./lib/catalog";

export default function App() {
  const [theme, setTheme] = useState("light");
  const [session, setSession] = useState(null);
  const [profile, setProfile] = useState(null);
  const [booted, setBooted] = useState(false);

  const [tab, setTab] = useState("profile");
  const [item, setItem] = useState(null);
  const [binder, setBinder] = useState(null);
  const [toast, setToast] = useState(null);

  const [collection, setCollection] = useState([]);
  const [listings, setListings] = useState([]);
  const [photos, setPhotos] = useState({});

  const [brand, setBrand] = useState("");
  const [year, setYear] = useState("");
  const [setN, setSetN] = useState("");
  const [q, setQ] = useState("");

  const [addSheet, setAddSheet] = useState(null);
  const [sellSheet, setSellSheet] = useState(null);
  const [cond, setCond] = useState("Near Mint");
  const [qty, setQty] = useState(1);
  const [price, setPrice] = useState("");
  const [side, setSide] = useState("front");
  const [viewMine, setViewMine] = useState(false);
  const [submitSheet, setSubmitSheet] = useState(false);

  const flash = (m) => { setToast(m); setTimeout(() => setToast(null), 2200); };

  // ---------- Session ----------
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => { setSession(data.session); setBooted(true); });
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => setSession(s));
    return () => sub.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (session) loadAll();
    else { setProfile(null); setCollection([]); }
  }, [session]);

  useEffect(() => { setSide("front"); setViewMine(false); }, [item]);

  const loadAll = async () => {
    const uid = session.user.id;
    // Ensure profile exists (created from signup metadata on first login)
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

    await refreshListings();
    await refreshPhotos();
  };

  const refreshListings = async () => {
    const { data } = await supabase.from("listings").select().order("listed_at", { ascending: false });
    setListings(data || []);
  };
  const refreshPhotos = async () => {
    // Private: only this user's own photos
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
    const { data, error } = await supabase.auth.signUp({
      email: f.email.trim(),
      password: f.password,
      options: { data: { username: f.username.trim(), bio: f.bio.trim() } },
    });
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

  const signout = async () => {
    await supabase.auth.signOut();
    setTab("profile"); setItem(null);
  };

  // ---------- Catalog + filters ----------
  const all = useMemo(flat, []);
  const brands = allBrands;
  const years = useMemo(() => yearsFor(brand), [brand]);
  const sets = useMemo(() => setsFor(brand, year), [brand, year]);

  const RENDER_CAP = 60;
  const filtered = useMemo(() => {
    const tokens = q.trim().toLowerCase().split(/\s+/).filter(Boolean);
    return all.filter((c) => {
      if (brand && c.brand !== brand) return false;
      if (year && c.year !== +year) return false;
      if (setN && c.set !== setN) return false;
      if (tokens.length === 0) return true;
      const hay = `${c.player} ${c.team} ${c.brand} ${c.set} ${c.year} ${c.no} ${c.variety}`.toLowerCase();
      return tokens.every((t) => hay.includes(t));
    });
  }, [all, brand, year, setN, q]);
  const results = filtered.slice(0, RENDER_CAP);

  const owned = (c) => collection.find((i) => i.card_key === key(c));
  const prem = (c) => (c.variety || "Base") !== "Base";
  // Catalog contexts (search, marketplace, similar cards): STOCK image only.
  // Personal photos never appear here, not even your own.
  const stockThumb = (c) => {
    const cat = c.card_key ? all.find((x) => key(x) === c.card_key) : c;
    return cat && cat.img ? [cat.img] : [];
  };
  // Collection context: your photo first, stock as fallback.
  const myThumb = (c) => {
    const k = c.card_key || key(c);
    const p = photos[k];
    const list = [];
    if (p && p.front) list.push(p.front);
    return [...list, ...stockThumb(c)];
  };
  const toCatalogCard = (rowOrCard) =>
    rowOrCard.card_key ? all.find((x) => key(x) === rowOrCard.card_key) || null : rowOrCard;

  const binders = useMemo(() => {
    const g = {};
    collection.forEach((i) => { g[i.brand] = g[i.brand] || []; g[i.brand].push(i); });
    return Object.entries(g).map(([name, items]) => ({ name, items, count: items.reduce((a, i) => a + i.qty, 0) }));
  }, [collection]);

  // ---------- Collection ops ----------
  const addCard = async () => {
    const c = addSheet, k = key(c), uid = session.user.id;
    const existing = collection.find((i) => i.card_key === k);
    if (existing) {
      const { data, error } = await supabase.from("collections")
        .update({ qty: existing.qty + qty, condition: cond }).eq("id", existing.id).select().single();
      if (error) { flash("Save failed"); return; }
      setCollection(collection.map((i) => (i.id === existing.id ? data : i)));
    } else {
      const { data, error } = await supabase.from("collections").insert({
        user_id: uid, card_key: k, brand: c.brand, year: c.year, set_name: c.set,
        card_no: c.no, player: c.player, team: c.team, variety: c.variety,
        condition: cond, qty,
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

  // ---------- Marketplace ops ----------
  const sell = async () => {
    const p = parseFloat(price);
    if (!p || p <= 0) { flash("Enter a price"); return; }
    const i = sellSheet;
    const { error } = await supabase.from("listings").insert({
      seller_id: session.user.id, seller_name: profile.username,
      card_key: i.card_key || key(i), brand: i.brand, year: i.year,
      set_name: i.set_name || i.set, card_no: i.card_no || i.no,
      player: i.player, team: i.team, variety: i.variety,
      condition: cond, price: p,
    });
    if (error) { flash("Listing failed"); return; }
    await refreshListings();
    setSellSheet(null); setPrice(""); flash(`Listed for $${p.toFixed(2)}`);
  };

  const delist = async (id) => {
    const { error } = await supabase.from("listings").delete().eq("id", id);
    if (error) { flash("Delist failed"); return; }
    setListings(listings.filter((l) => l.id !== id));
    flash("Delisted");
  };

  const submitCard = async (form) => {
    if (!form.player.trim() || !form.year) { flash("Player and year required"); return false; }
    const { error } = await supabase.from("card_submissions").insert({
      submitter_id: session.user.id, submitter_name: profile?.username,
      mfg: form.mfg.trim() || "Unknown", year: parseInt(form.year) || null,
      set_name: form.set.trim(), variety: form.variety.trim() || "Base",
      team: form.team.trim(), player: form.player.trim(), card_no: form.no.trim(),
      note: form.note.trim(),
    });
    if (error) { flash("Submission failed"); return false; }
    flash("Card submitted, thanks");
    return true;
  };

  // ---------- Private photos (yours only) ----------
  const onPhoto = async (e) => {
    const file = e.target.files && e.target.files[0];
    if (!file || !item) return;
    e.target.value = "";
    if (!owned(item)) { flash("Add the card to your collection first"); return; }
    try {
      flash("Uploading...");
      const blob = await resizeImg(file);
      const k = key(item);
      const uid = session.user.id;
      // Per-user folder keeps each collector's photos separate and private
      const path = `private/${uid}/${safeKey(k)}-${side}.jpg`;
      const up = await supabase.storage.from("card-photos").upload(path, blob, { upsert: true, contentType: "image/jpeg" });
      if (up.error) { flash("Upload failed"); return; }
      const { data: pub } = supabase.storage.from("card-photos").getPublicUrl(path);
      const url = `${pub.publicUrl}?v=${Date.now()}`;
      const { error } = await supabase.from("my_card_photos").upsert(
        { user_id: uid, card_key: k, side, url },
        { onConflict: "user_id,card_key,side" }
      );
      if (error) { flash("Save failed"); return; }
      setPhotos({ ...photos, [k]: { ...(photos[k] || {}), [side]: url } });
      setViewMine(true);
      flash("Photo saved to your copy");
    } catch { flash("Couldn't read that image"); }
  };

  const removePhoto = async () => {
    if (!item) return;
    const k = key(item);
    const uid = session.user.id;
    await supabase.from("my_card_photos").delete().match({ user_id: uid, card_key: k, side });
    await supabase.storage.from("card-photos").remove([`private/${uid}/${safeKey(k)}-${side}.jpg`]);
    const next = { ...photos };
    if (next[k]) { delete next[k][side]; if (!next[k].front && !next[k].back) delete next[k]; }
    setPhotos(next);
    setViewMine(false);
    flash("Photo removed, stock restored");
  };

  if (!booted) return <div className={`app ${theme}`} />;

  // ================= AUTH =================
  if (!session) {
    const isUp = authMode === "signup";
    return (
      <div className={`app ${theme}`}>
        <div className="auth-wrap">
          <div className="auth-card">
            <div className="auth-avatar">&#128100;</div>
            <h2>Enter the Vault</h2>
            <p className="sub">Your collection awaits</p>
            <label className="fld" htmlFor="ae">Email</label>
            <input id="ae" type="email" placeholder="you@example.com" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} />
            {isUp && <>
              <label className="fld" htmlFor="an">Username</label>
              <input id="an" type="text" placeholder="player-ish-bish" value={f.username} onChange={(e) => setF({ ...f, username: e.target.value })} />
            </>}
            <label className="fld" htmlFor="ap">Password</label>
            <input id="ap" type="password" placeholder="********" value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} />
            {isUp && <>
              <label className="fld" htmlFor="ab">Bio (optional)</label>
              <textarea id="ab" rows="2" placeholder="A collector since the 90s..." value={f.bio} onChange={(e) => setF({ ...f, bio: e.target.value })} />
            </>}
            {authErr && <p className="autherr">{authErr}</p>}
            {authOk && <p className="authok">{authOk}</p>}
            <button className="btn" disabled={busy} onClick={isUp ? signup : signin}>{busy ? "Working..." : isUp ? "Create Account" : "Sign In"}</button>
            <p className="authswap">
              {isUp
                ? <>Have an account? <a onClick={() => { setAuthMode("signin"); setAuthErr(""); setAuthOk(""); }}>Sign in</a></>
                : <>New here? <a onClick={() => { setAuthMode("signup"); setAuthErr(""); setAuthOk(""); }}>Create an account</a></>}
            </p>
          </div>
        </div>
      </div>
    );
  }

  // ================= ITEM PAGE =================
  if (item) {
    const c = item;
    const similar = all.filter((x) => x.set === c.set && x.year === c.year && key(x) !== key(c)).slice(0, 4);
    const have = owned(c);
    const ph = photos[key(c)] || {};
    const hasMine = Boolean(ph.front || ph.back);
    // Catalog view: stock image (generated art fallback). "My photo" view: your shot for this side.
    const stockSrcs = c.img ? [c.img] : [];
    const mineSrc = ph[side];
    const showMine = viewMine && have && mineSrc;
    return (
      <div className={`app ${theme}`}>
        <div className="topbar">
          <button className="back" onClick={() => setItem(null)}>&#8592; Back</button>
          <button className="iconbtn" onClick={() => setTheme(theme === "light" ? "dark" : "light")}>{theme === "light" ? "Dark" : "Light"}</button>
        </div>
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
                {have ? (
                  <>
                    <label className="photobtn">
                      {ph[side] ? `Replace my ${side} photo` : `Photo my copy (${side})`}
                      <input type="file" accept="image/*" capture="environment" onChange={onPhoto} />
                    </label>
                    {ph[side] && (
                      <button className="photobtn" onClick={removePhoto}>Remove my photo</button>
                    )}
                  </>
                ) : (
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
          <p className="para"><b>Information:</b> {c.player} {c.variety === "Base" ? "base card" : c.variety.toLowerCase()} from the {c.year} {c.brand} {c.set} release{c.team && c.team !== "Unknown" ? `, a piece for ${c.team} collectors` : ""}.</p>
          {have && <p className="para"><b>Provenance:</b> In your collection, held as {have.condition}, quantity {have.qty}.</p>}
          {similar.length > 0 && (
            <div className="morelike">
              <h4>More like this...</h4>
              <div className="strip">
                {similar.map((s) => (
                  <button key={key(s)} onClick={() => setItem(s)}>
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
            {have && <button className="btn line" onClick={() => { setCond(have.condition); setPrice(""); setSellSheet(have); }}>Sell</button>}
          </div>
        </main>
        {addSheet && <AddSheet c={addSheet} cond={cond} setCond={setCond} qty={qty} setQty={setQty} onClose={() => setAddSheet(null)} onAdd={addCard} />}
        {sellSheet && <SellSheet c={sellSheet} cond={cond} setCond={setCond} price={price} setPrice={setPrice} onClose={() => setSellSheet(null)} onSell={sell} />}
        {toast && <div className="toast">{toast}</div>}
        <TabBar tab={tab} onGo={(t) => { setItem(null); setTab(t); setBinder(null); }} />
      </div>
    );
  }

  // ================= MAIN TABS =================
  return (
    <div className={`app ${theme}`}>
      <div className="topbar">
        <span className="brand">Card Vault AFL</span>
        <div style={{ display: "flex", gap: 8 }}>
          <button className="iconbtn" onClick={() => setTheme(theme === "light" ? "dark" : "light")}>{theme === "light" ? "Dark" : "Light"}</button>
          <button className="iconbtn" onClick={signout}>Sign out</button>
        </div>
      </div>

      {tab === "profile" && (
        <main className="pane">
          <div className="prof-head">
            <div className="avatar">{(profile?.username || "?")[0].toUpperCase()}</div>
            <div>
              <h2>{profile?.username || "..."}</h2>
              <div className="stats"><span>Cards: <b>{collection.reduce((a, i) => a + i.qty, 0)}</b></span><span>Listings: <b>{listings.filter((l) => l.seller_id === session.user.id).length}</b></span></div>
              <p className="bio">{profile?.bio}</p>
            </div>
          </div>
          <div className="searchbar">
            <input type="text" placeholder="Search the catalog" aria-label="Search the catalog"
              onChange={(e) => setQ(e.target.value)} onFocus={() => setTab("search")} />
          </div>
          {binders.length === 0 ? (
            <div className="empty">No binders yet.<br />Add cards from Search and they'll group here by brand.</div>
          ) : (
            <div className="grid">
              {binders.map((b) => (
                <button className="binder" key={b.name} onClick={() => { setBinder(b.name); setTab("collection"); }}>
                  <div className="tile">
                    <span className="pub">PUBLIC</span>
                    <span className="cnt">{b.count}</span>
                    <span style={{ fontSize: 11, color: "var(--mut)" }}>cards</span>
                  </div>
                  <span className="lbl">{b.name} Collectables</span>
                </button>
              ))}
            </div>
          )}
        </main>
      )}

      {tab === "search" && (
        <main className="pane">
          <div className="searchline">
            <input type="text" aria-label="Search player, club, set or card number" placeholder="Search player, club, set, card no." value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
          <div className="filters compact">
            <select aria-label="Brand" value={brand} onChange={(e) => { setBrand(e.target.value); setYear(""); setSetN(""); }}>
              <option value="">Brand</option>{brands.map((b) => <option key={b}>{b}</option>)}
            </select>
            <select aria-label="Year" value={year} onChange={(e) => { setYear(e.target.value); setSetN(""); }}>
              <option value="">Year</option>{years.map((y) => <option key={y}>{y}</option>)}
            </select>
            <select aria-label="Set" value={setN} onChange={(e) => setSetN(e.target.value)}>
              <option value="">Set</option>{sets.map((s) => <option key={s}>{s}</option>)}
            </select>
          </div>
          <p className="count">
            {filtered.length.toLocaleString()} card{filtered.length !== 1 ? "s" : ""}
            {filtered.length > RENDER_CAP ? ` · showing first ${RENDER_CAP}, refine to narrow` : ""}
          </p>
          {results.map((c) => (
            <button className="row slim" key={key(c)} onClick={() => setItem(c)}>
              <Mini c={c} urls={stockThumb(c)} prem={prem(c)} />
              <div>
                <div className="p">{c.player}</div>
                <div className="m">{c.team} &middot; {c.year} {c.brand} {c.set}</div>
                {prem(c) && <div className="v">{c.variety}</div>}
              </div>
              {owned(c) && <span className="price" style={{ fontSize: 11 }}>Owned</span>}
            </button>
          ))}
          {filtered.length === 0 && (
            <div className="empty">No cards match.<br />Widen the filters, or add a missing card below.</div>
          )}
          <button className="btn line" style={{ marginTop: 12 }} onClick={() => setSubmitSheet(true)}>+ Add a missing card</button>
          <p className="note">{all.length.toLocaleString()} cards in the catalog (1994 to 2023). Spotted a gap? Add it and it joins the community list.</p>
        </main>
      )}

      {tab === "collection" && (
        <main className="pane">
          {binder && <button className="back" onClick={() => setBinder(null)}>&#8592; Clear {binder} filter</button>}
          {collection.length === 0 ? (
            <div className="empty">Nothing in the vault yet.<br />Find cards in Search and add them.</div>
          ) : (
            (binder ? collection.filter((i) => i.brand === binder) : collection).map((i) => (
              <div className="row" key={i.id} style={{ cursor: "default" }}>
                <button style={{ background: "none", border: "none", padding: 0, cursor: "pointer" }}
                  onClick={() => { const c = toCatalogCard(i); if (c) setItem(c); }} aria-label={`Open ${i.player}`}>
                  <Mini c={i} urls={myThumb(i)} prem={prem(i)} />
                </button>
                <div style={{ flex: 1 }}>
                  <div className="p">{i.player}{i.qty > 1 ? ` x${i.qty}` : ""}</div>
                  <div className="m">{i.team} &middot; {i.year} {i.brand} {i.set_name}</div>
                  <div className="m">{i.condition}</div>
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  <button className="btn small" onClick={() => { setCond(i.condition); setPrice(""); setSellSheet(i); }}>Sell</button>
                  <button className="danger" onClick={() => removeCard(i)}>Remove</button>
                </div>
              </div>
            ))
          )}
        </main>
      )}

      {tab === "market" && (
        <main className="pane">
          {listings.length === 0 ? (
            <div className="empty">No live listings.<br />Sell from your collection to open the market.</div>
          ) : listings.map((l) => (
            <div className="row" key={l.id} style={{ cursor: "default" }}>
              <button style={{ background: "none", border: "none", padding: 0, cursor: "pointer" }}
                onClick={() => { const c = toCatalogCard(l); if (c) setItem(c); }} aria-label={`Open ${l.player}`}>
                <Mini c={l} urls={stockThumb(l)} prem={prem(l)} />
              </button>
              <div style={{ flex: 1 }}>
                <div className="p">{l.player}</div>
                <div className="m">{l.team} &middot; {l.year} {l.brand} {l.set_name}</div>
                <div className="m">{l.condition} &middot; @{l.seller_name} &middot; {String(l.listed_at).slice(0, 10)}</div>
              </div>
              <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 6 }}>
                <span className="price">${Number(l.price).toFixed(2)}</span>
                {l.seller_id === session.user.id && <button className="danger" onClick={() => delist(l.id)}>Delist</button>}
              </div>
            </div>
          ))}
          <p className="note">Listings are public to all signed-in collectors. Payments and buyer messaging are the next build phase.</p>
        </main>
      )}

      {addSheet && <AddSheet c={addSheet} cond={cond} setCond={setCond} qty={qty} setQty={setQty} onClose={() => setAddSheet(null)} onAdd={addCard} />}
      {sellSheet && <SellSheet c={sellSheet} cond={cond} setCond={setCond} price={price} setPrice={setPrice} onClose={() => setSellSheet(null)} onSell={sell} />}
      {submitSheet && <SubmitSheet onClose={() => setSubmitSheet(false)} onSubmit={submitCard} />}
      {toast && <div className="toast">{toast}</div>}

      <TabBar tab={tab} onGo={(t) => { setItem(null); setTab(t); setBinder(null); }} />
    </div>
  );
}

// ---------------- Image components with cascading fallback ----------------
// Tries each URL in order; if one fails to load, moves to the next.
// Order everywhere: your photo -> catalog stock image -> generated art.
// A dead photo link can never block the stock image.
function Mini({ c, urls, prem }) {
  const [idx, setIdx] = useState(0);
  useEffect(() => { setIdx(0); }, [urls.join("|")]);
  const src = urls[idx];
  return (
    <div className={`mini ${prem ? "prem" : ""}`} style={{ position: "relative", overflow: "hidden" }}>
      {c.no || c.card_no}
      {src && (
        <img src={src} alt="" loading="lazy" onError={() => setIdx(idx + 1)}
          style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" }} />
      )}
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

// ---------------- Bottom nav (persistent) ----------------
function TabBar({ tab, onGo }) {
  return (
    <nav className="tabs">
      {["profile", "search", "collection", "market"].map((t) => (
        <button key={t} className={tab === t ? "on" : ""} onClick={() => onGo(t)}>
          {t === "market" ? "Marketplace" : t[0].toUpperCase() + t.slice(1)}
        </button>
      ))}
    </nav>
  );
}

// ---------------- Stock card artwork ----------------
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
            <path d="M46 32 L29 43 L32 48 L48 39 Z" />
            <path d="M55 31 L72 25 L74 30 L57 39 Z" />
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
        <div><span>Club</span><b>{c.team}</b></div>
        <div><span>Set</span><b>{c.set}</b></div>
        <div><span>Year</span><b>{c.year}</b></div>
        <div><span>Variety</span><b>{c.variety}</b></div>
        <div><span>Maker</span><b>{c.brand}</b></div>
      </div>
      <div className="btxt">{`Collector card for ${c.player}${c.no ? `, card ${c.no}` : ""} in the ${c.year} ${c.brand} ${c.set} release. No photo yet, add one to help the community.`}</div>
      <div className="bfoot">{c.brand} &middot; {c.year} &middot; 63 x 88 mm card stock</div>
    </div>
  );
}

// ---------------- Submit missing card ----------------
function SubmitSheet({ onClose, onSubmit }) {
  const [form, setForm] = useState({ mfg: "", year: "", set: "", variety: "", team: "", player: "", no: "", note: "" });
  const upd = (k, v) => setForm({ ...form, [k]: v });
  const go = async () => { const ok = await onSubmit(form); if (ok) onClose(); };
  return (
    <div className="sheetback" onClick={onClose}>
      <div className="sheet" onClick={(e) => e.stopPropagation()} style={{ maxHeight: "88vh", overflowY: "auto" }}>
        <h3>Add a missing card</h3>
        <p className="sub">Not in the catalog? Add the details and it joins the community submissions.</p>
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

// ---------------- Sheets ----------------
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
function SellSheet({ c, cond, setCond, price, setPrice, onClose, onSell }) {
  return (
    <div className="sheetback" onClick={onClose}>
      <div className="sheet" onClick={(e) => e.stopPropagation()}>
        <h3>List for sale</h3>
        <p className="sub">{c.player} &middot; {c.year} {c.brand} {c.set || c.set_name} #{c.no || c.card_no}</p>
        <label className="fld" htmlFor="lc">Condition</label>
        <select id="lc" value={cond} onChange={(e) => setCond(e.target.value)}>{CONDITIONS.map((x) => <option key={x}>{x}</option>)}</select>
        <label className="fld" htmlFor="lp">Asking price (AUD)</label>
        <input id="lp" type="number" min="0" step="0.01" placeholder="0.00" value={price} onChange={(e) => setPrice(e.target.value)} />
        <div className="actions">
          <button className="btn line" onClick={onClose}>Cancel</button>
          <button className="btn" onClick={onSell}>Post listing</button>
        </div>
      </div>
    </div>
  );
}
