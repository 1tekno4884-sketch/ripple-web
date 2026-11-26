// Ripple web viewer. Talks only to the Ripple Worker API (docs/API.md) — no Firebase.
// Public posts, shorts, profiles, Pools and tags without signing in; signed-in users can like, dislike,
// comment, reply and follow.
import { CONFIG } from "./config.js";
import * as U2V from "./video.js";   // U2-video: Buoys, captions, speed, Rising Tide, Deep Dives, Currents, premieres
import { flairAvatar, flairName, ribbonsHtml } from "./identity.js";   // U2-identity: banners + flair
import * as U3M from "./u3map.js";   // U3-social: Tide Map (beta ripple.tide_map)
import * as U4C from "./u4catchup.js";   // U4-fixes catch-up: Ripple Effect + Tide Report on the web
import * as U4R from "./u4report.js";   // U4-fixes: unified reports + review queue (moderators)

const API = CONFIG.apiUrl;
const TOKEN_KEY = "ripple_token";

// ------------------------------------------------------------------ tiny DOM helpers (text only → no XSS)
function h(tag, attrs = {}, ...kids) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v == null || v === false) continue;
    if (k.startsWith("on")) el.addEventListener(k.slice(2), v);
    else if (k === "class") el.className = v;
    else el.setAttribute(k, v === true ? "" : v);
  }
  for (const c of kids.flat()) if (c != null && c !== false) el.append(c instanceof Node ? c : document.createTextNode(String(c)));
  return el;
}
const $ = (s) => document.querySelector(s);
const view = $("#view");
function toast(msg) { const t = $("#toast"); t.textContent = msg; t.hidden = false; clearTimeout(toast.t); toast.t = setTimeout(() => (t.hidden = true), 2600); }
const fmt = (n) => { n = Number(n) || 0; return n >= 1e6 ? (n / 1e6).toFixed(1).replace(/\.0$/, "") + "M" : n >= 1e4 ? Math.floor(n / 1e3) + "K" : n >= 1e3 ? (n / 1e3).toFixed(1).replace(/\.0$/, "") + "K" : String(n); };
function ago(ms) {
  ms = Number(ms) || 0; if (!ms) return "now";
  const d = Date.now() - ms;
  if (d < 6e4) return "now"; if (d < 36e5) return Math.floor(d / 6e4) + "m"; if (d < 864e5) return Math.floor(d / 36e5) + "h";
  if (d < 6048e5) return Math.floor(d / 864e5) + "d"; return new Date(ms).toLocaleDateString();
}
// only our own storage keys (u/<uid>/…) — profile fields are user-editable, so never trust them as URLs/CSS
const safeKey = (k) => typeof k === "string" && /^u\/[A-Za-z0-9_-]+\/[A-Za-z0-9_./-]+$/.test(k) && !k.includes("..");
const keyUrl = (k) => (safeKey(k) ? `${CONFIG.mediaUrl}/${k}` : null);
const safeHref = (u) => { try { const x = new URL(u); return ["http:", "https:"].includes(x.protocol) ? x.href : null; } catch { return null; } };
const mediaUrl = (m, thumb) => {
  const key = thumb ? m.thumb || m.key : m.key; const b = thumb ? m.tb || m.b : m.b;
  return b === "pub" ? keyUrl(key) : null; // private media isn't shown on the web
};

// rich text: #tags, @mentions, links
function rich(text) {
  const out = h("div", { class: "text" });
  const rx = /(#[A-Za-z0-9_]{1,40})|(@[A-Za-z0-9._]{3,20})|(https?:\/\/[^\s]+)/g;
  let i = 0, m;
  text = String(text || "");
  while ((m = rx.exec(text))) {
    out.append(text.slice(i, m.index));
    const t = m[0];
    if (t[0] === "#") out.append(h("a", { href: `#/t/${encodeURIComponent(t.slice(1).toLowerCase())}` }, t));
    else if (t[0] === "@") out.append(h("a", { href: `#/u/${encodeURIComponent(t.slice(1).toLowerCase())}` }, t));
    else out.append(safeHref(t) ? h("a", { href: safeHref(t), rel: "noopener nofollow ugc", target: "_blank" }, t) : t);
    i = m.index + t.length;
  }
  out.append(text.slice(i));
  return out;
}

// ------------------------------------------------------------------ API client
let token = localStorage.getItem(TOKEN_KEY);
class ApiError extends Error { constructor(status, msg) { super(msg); this.status = status; } }
async function api(path, { method = "GET", body } = {}) {
  const headers = {};
  if (body !== undefined) headers["content-type"] = "application/json";
  if (token) headers.authorization = "Bearer " + token;
  let r;
  try { r = await fetch(API + path, { method, headers, body: body !== undefined ? JSON.stringify(body) : undefined }); }
  catch { throw new ApiError(0, "You're offline or Ripple is unreachable."); }
  const j = await r.json().catch(() => ({}));
  if (r.status === 401 && token) { setToken(null); renderMe(); }
  if (!r.ok) throw new ApiError(r.status, j.error || `Request failed (${r.status})`);
  return j;
}
const items = (j) => (Array.isArray(j) ? j : j?.items ?? []);
function setToken(t) { token = t; if (t) localStorage.setItem(TOKEN_KEY, t); else localStorage.removeItem(TOKEN_KEY); }

/** passwordHash = base64url(PBKDF2-HMAC-SHA256(password, "ripple:" + username.lower(), 100 000, 32 bytes)) — same as the app. */
async function passwordHash(username, password) {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey("raw", enc.encode(password), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt: enc.encode("ripple:" + username.trim().toLowerCase()), iterations: 100000 }, key, 256);
  return btoa(String.fromCharCode(...new Uint8Array(bits))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

// ------------------------------------------------------------------ badges (original shapes, same as the app)
function badgeSvg(kind) {
  const ns = "http://www.w3.org/2000/svg";
  const s = document.createElementNS(ns, "svg"); s.setAttribute("viewBox", "0 0 20 20"); s.setAttribute("class", "badge");
  const t = document.createElementNS(ns, "title"); t.textContent = { verified: "Verified", creator: "Verified Creator", brand: "Brand", org: "Organization" }[kind]; s.append(t);
  if (kind === "brand" || kind === "org") {
    const r = document.createElementNS(ns, "rect"); r.setAttribute("width", "20"); r.setAttribute("height", "20"); r.setAttribute("rx", "4.4"); r.setAttribute("fill", kind === "brand" ? "#E0A100" : "#8A94A6"); s.append(r);
  } else {
    let d = ""; for (let i = 0; i <= 20; i++) { const a = Math.PI * 2 * i / 20 - Math.PI / 2, r = i % 2 ? 8.4 : 10; d += (i ? "L" : "M") + (10 + r * Math.cos(a)).toFixed(2) + "," + (10 + r * Math.sin(a)).toFixed(2); }
    const p = document.createElementNS(ns, "path"); p.setAttribute("d", d + "Z"); p.setAttribute("fill", kind === "creator" ? "#3b6cff" : "#1E7BFF"); s.append(p);
  }
  const c = document.createElementNS(ns, "path"); c.setAttribute("d", "M6,10.4 L8.8,13 L14.2,7.4"); c.setAttribute("fill", "none"); c.setAttribute("stroke", "#fff"); c.setAttribute("stroke-width", "2.2"); c.setAttribute("stroke-linecap", "round"); s.append(c);
  return s;
}
// Owner badge (Sonar 2.0 / Ripple 1.4): one account only. Blue crest with a white wave-crown + sparkle (same art as the apps).
const OWNER_SVG = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" class="badge owner" role="img" aria-label="Owner"><title>Owner</title>' +
  '<defs><linearGradient id="ownerg" x1="0" y1="1" x2="1" y2="0"><stop offset="0" stop-color="#071D4F"/><stop offset=".5" stop-color="#1E6BFF"/><stop offset="1" stop-color="#3FD8FF"/></linearGradient></defs>' +
  '<path d="M16 10Q50 2 84 10Q93 12 92 24C92 62 74 84 50 97C26 84 8 62 8 24Q7 12 16 10Z" fill="url(#ownerg)" stroke="rgba(255,255,255,.32)" stroke-width="4.5"/>' +
  '<path d="M25 64L25 42Q31 47 36 53Q42 36 50 27Q58 36 64 53Q69 47 75 42L75 64Z" fill="#fff"/>' +
  '<path d="M27 71H73" stroke="#fff" stroke-width="6" stroke-linecap="round"/><circle cx="50" cy="50" r="4.5" fill="#3FD8FF"/>' +
  '<path d="M83 9Q83 20 94 20Q83 20 83 31Q83 20 72 20Q83 20 83 9Z" fill="#fff"/></svg>';
function ownerSvg() { return document.importNode(new DOMParser().parseFromString(OWNER_SVG, "image/svg+xml").documentElement, true); }
function ownerTag() { const s = h("span", { class: "ownertag", title: "The founder of Sonar and Ripple. Only one account has this badge." }); s.append(ownerSvg(), "Owner"); return s; }
function badges(b = {}, dev = true) {
  b = b || {};
  const out = [];
  if (b.owner) out.push(dev ? ownerTag() : ownerSvg());
  if (b.creator) out.push(badgeSvg("creator")); else if (b.verified) out.push(badgeSvg("verified"));
  if (b.brand) out.push(badgeSvg("brand")); if (b.org) out.push(badgeSvg("org"));
  if (b.dev && dev && !b.owner) out.push(h("span", { class: "devtag", title: "Given by Ripple's owner. Nobody can apply for it." }, "Certified Developer"));
  return out;
}
function avatar(key, name, big) {
  const u = keyUrl(key);
  return u ? h("img", { class: "avatar" + (big ? " big" : ""), src: u, alt: "" }) : h("div", { class: "avatar" + (big ? " big" : "") }, String(name || "?").trim().slice(0, 1).toUpperCase());
}

// ------------------------------------------------------------------ U4-glassrs: Sea Glass follows the phone's look (settings.u3.glass)
function applyGlass(settings) {
  let st = settings;
  if (typeof st === "string") { try { st = JSON.parse(st); } catch { st = null; } }
  const g = (st && st.u3 && st.u3.glass) || {};
  const root = document.documentElement;
  root.classList.toggle("sea-glass", !!g.on);
  root.classList.toggle("glass-tinted", !!(g.on && g.tinted));
  root.classList.toggle("glass-solid", !!(g.on && g.reduceTransparency));
  root.dataset.glass = String(g.strength || "Standard").toLowerCase();
}

// ------------------------------------------------------------------ session
let me = null; // { user, role, access }  (U2-identity: access = {dev, owner, admin} — badges.dev is only the stamp)
async function loadMe() {
  if (!token) { me = null; return; }
  try { const j = await api("/v1/me"); me = { user: j.user, role: j.role, access: j.access || null }; applyGlass(j.settings); }   // U2-identity; U4-glassrs
  catch (e) { if (e.status === 401) setToken(null); me = null; }   // U3-social: this catch had been commented out by a merge (SyntaxError → blank site)
}
function renderMe() {
  const box = $("#me"); box.replaceChildren();
  if (!me) box.append(h("button", { onclick: () => signInModal() }, "Sign in"));
  else box.append(
    h("a", { href: `#/u/${encodeURIComponent(me.user?.username ?? "")}`, title: "Your profile" }, flairAvatar(me.user, "", avatar(me.user?.avatar, me.user?.displayName))),   // U2-identity
    h("button", { class: "ghost", onclick: logout }, "Sign out"),
  );
  if (me) U3M.betaOn("ripple.tide_map").then((on) => { if (on && me && !box.querySelector(".u3-maplink")) box.prepend(h("a", { class: "u3-maplink", href: "#/map", title: "Tide Map", "aria-label": "Tide Map", style: "display:inline-grid;place-items:center;width:38px;height:38px;border-radius:50%;color:var(--text)" }, U3M.mapIcon())); });   // U3-social
}
async function logout() {
  try { await api("/v1/auth/logout", { method: "POST", body: {} }); } catch {}
  setToken(null); me = null; renderMe(); route();
}
async function loadOwner() {
  try {
    const cfg = await api("/v1/config");
    if (cfg.ownerUid) { const u = await api(`/v1/users/${encodeURIComponent(cfg.ownerUid)}`); if (u?.username) $("#credit").href = `#/u/${encodeURIComponent(u.username)}`; }
  } catch {}
}

// ------------------------------------------------------------------ modals: sign in, sign up, recovery
function modal(...content) {
  const m = $("#modal"); m.replaceChildren(h("div", { class: "box" }, ...content)); m.hidden = false;
  m.onclick = (e) => { if (e.target === m) m.hidden = true; };
}
const close = () => ($("#modal").hidden = true);
const field = (attrs) => h("input", attrs);
const errText = (e) => e?.message || "Something went wrong";

function signInModal() {
  const err = h("div", { class: "err" });
  const un = field({ placeholder: "Username", autocomplete: "username" });
  const pw = field({ placeholder: "Password", type: "password", autocomplete: "current-password" });
  const go = h("button", {}, "Sign in");
  go.onclick = async () => {
    err.textContent = "";
    const u = un.value.trim();
    if (u.includes("@")) { err.textContent = "Use your Ripple username (no @)."; return; }
    if (!u || !pw.value) { err.textContent = "Enter your username and password."; return; }
    go.disabled = true;
    try {
      const j = await api("/v1/auth/login", { method: "POST", body: { username: u, passwordHash: await passwordHash(u, pw.value) } });
      setToken(j.token); me = { user: j.user, role: j.role }; renderMe(); close(); route();
    } catch (e) { err.textContent = errText(e); }
    go.disabled = false;
  };
  modal(
    h("h2", {}, "Sign in to Ripple"),
    h("div", { class: "stack" }, un, pw, go, err,
      h("a", { href: "#", onclick: (e) => { e.preventDefault(); signUpModal(); } }, "New here? Create an account"),
      h("a", { href: "#", onclick: (e) => { e.preventDefault(); recoverModal(un.value); } }, "Forgot password? Use a recovery code"),
      h("div", { class: "meta" }, "Ripple is for people 13 and older. ", h("a", { href: "#/terms", onclick: close }, "Terms"), " · ", h("a", { href: "#/privacy", onclick: close }, "Privacy"))),
  );
}

function signUpModal() {
  const err = h("div", { class: "err" });
  const avail = h("div", { class: "meta" });
  const un = field({ placeholder: "Username (3–20 letters, numbers, . or _)", autocomplete: "username" });
  const dn = field({ placeholder: "Display name" });
  const pw = field({ placeholder: "Password (8+ characters)", type: "password", autocomplete: "new-password" });
  const by = field({ placeholder: "Birth year", inputmode: "numeric" });
  let t;
  un.addEventListener("input", () => {
    clearTimeout(t); avail.textContent = "";
    const v = un.value.trim(); if (!v) return;
    t = setTimeout(async () => {
      try { const a = await api(`/v1/username-available?u=${encodeURIComponent(v)}`); avail.textContent = a.ok ? `✓ @${a.name} is available` : (a.reason || "That username is taken"); }
      catch {}
    }, 350);
  });
  const go = h("button", {}, "Create account");
  go.onclick = async () => {
    err.textContent = "";
    const u = un.value.trim(); const year = Number(by.value);
    if (u.includes("@")) { err.textContent = "Usernames can't contain @"; return; }
    if (pw.value.length < 8) { err.textContent = "Use at least 8 characters"; return; }
    if (!(year > 1900) || new Date().getFullYear() - year < 13) { err.textContent = "You must be 13 or older to use Ripple"; return; }
    go.disabled = true;
    try {
      const j = await api("/v1/auth/signup", { method: "POST", body: { username: u, passwordHash: await passwordHash(u, pw.value), displayName: dn.value.trim() || u, birthYear: year, interests: [] } });
      setToken(j.token); me = { user: j.user, role: j.role }; renderMe();
      showCodes(j.recoveryCodes || []);
    } catch (e) { err.textContent = errText(e); go.disabled = false; }
  };
  modal(h("h2", {}, "Create your Ripple account"),
    h("div", { class: "stack" }, un, avail, dn, pw, by, go, err,
      h("div", { class: "meta" }, "No email needed. You'll get 8 one-time recovery codes — they're the only way back in if you forget your password."),
      h("a", { href: "#", onclick: (e) => { e.preventDefault(); signInModal(); } }, "Have an account? Sign in")));
}

function showCodes(codes) {
  const ok = h("input", { type: "checkbox", id: "saved" });
  const done = h("button", { disabled: true, onclick: () => { close(); route(); } }, "Continue");
  ok.addEventListener("change", () => (done.disabled = !ok.checked));
  modal(h("h2", {}, "Save your recovery codes"),
    h("p", {}, "Each code works once to reset your password without email. Ripple can't show them again."),
    h("pre", {}, codes.map((c, i) => `${i + 1}. ${c}`).join("\n")),
    h("div", { class: "stack" },
      h("button", { class: "tonal", onclick: () => { navigator.clipboard?.writeText(codes.join("\n")); toast("Copied"); } }, "Copy all"),
      h("label", {}, ok, " I saved them somewhere safe"), done));
}

function recoverModal(prefill = "") {
  const err = h("div", { class: "err" });
  const un = field({ placeholder: "Username", value: prefill });
  const code = field({ placeholder: "Recovery code (XXXX-XXXX)" });
  const pw = field({ placeholder: "New password (8+ characters)", type: "password", autocomplete: "new-password" });
  const go = h("button", {}, "Reset password");
  go.onclick = async () => {
    err.textContent = "";
    if (pw.value.length < 8) { err.textContent = "Use at least 8 characters"; return; }
    go.disabled = true;
    try {
      const u = un.value.trim();
      await api("/v1/recover", { method: "POST", body: { username: u, code: code.value, newPasswordHash: await passwordHash(u, pw.value) } });
      toast("Password changed — sign in"); signInModal();
    } catch (e) { err.textContent = errText(e); }
    go.disabled = false;
  };
  modal(h("h2", {}, "Reset your password"), h("div", { class: "stack" }, un, code, pw, go, err,
    h("a", { href: "#", onclick: (e) => { e.preventDefault(); signInModal(); } }, "Back to sign in")));
}
function needSignIn() { if (!me) { signInModal(); return true; } return false; }

// ------------------------------------------------------------------ rendering
function postCard(p, full = false) {
  if (p.type === "repost" && p.original) {
    const inner = postCard(p.original, full);
    inner.prepend(h("div", { class: "meta" }, `🔁 ${p.author?.name || p.author?.username || "Someone"} reposted`));
    return inner;
  }
  const a = p.author || {};
  const head = h("div", { class: "post-head" },
    h("a", { href: `#/u/${encodeURIComponent(a.username || "")}` }, flairAvatar(a, "", avatar(a.avatar, a.name))),   // U2-identity
    h("div", {},
      h("div", {}, h("a", { href: `#/u/${encodeURIComponent(a.username || "")}`, class: "name" }, flairName(a, a.name || a.username), ...badges(a.badges, false), ribbonsHtml(a, true))),
      h("div", { class: "meta" }, `@${a.username || ""} · ${ago(p.createdAt)}`, p.communityId ? " · " : "", p.communityId ? h("a", { href: `#/c/${encodeURIComponent(p.communityId)}` }, `p/${p.communityId}`) : "", p.editedAt ? " · edited" : "")));
  const body = [];
  if (p.removed) body.push(h("div", { class: "meta" }, "This post was removed by moderators."));
  if (p.title) body.push(h("div", { class: "title" }, p.title));
  if (p.text) body.push(rich(p.text));
  if (p.body) body.push(rich(full ? p.body : p.body.slice(0, 400) + (p.body.length > 400 ? "…" : "")));
  // U2-social: Ripple Back / Tandem / Splice credit, video replies, Ask Me answers, the short's sound
  const rk = { back: "↩ Ripple Back to ", tandem: "Tandem with ", splice: "Splice from " };
  if (p.remixOf?.postId) body.push(h("div", { class: "meta" }, rk[p.remixOf.kind] || rk.back, h("a", { href: `#/p/${encodeURIComponent(p.remixOf.postId)}` }, "@" + (p.remixOf.username || ""))));
  if (p.commentReply?.postId) body.push(h("div", { class: "meta" }, "💬 Video reply to ", h("a", { href: `#/p/${encodeURIComponent(p.commentReply.postId)}` }, "@" + (p.commentReply.username || "")), `: “${p.commentReply.text || ""}”`));
  if (p.askAnswer?.text) body.push(h("div", { class: "meta" }, `❓ Asked: “${p.askAnswer.text}”`));
  if (p.type === "short") body.push(h("div", { class: "meta" }, "♪ " + (p.sound?.title || `Original sound · @${a.username || ""}`)));
  const media = (p.media || []).filter((m) => m.b === "pub" && safeKey(m.key));
  if (media.length) {
    const box = h("div", { class: `media n${Math.min(media.length, 4)}` });
    for (const m of media.slice(0, 4)) {
      const el = m.kind === "video"
        ? h("video", { src: mediaUrl(m), poster: m.thumb ? mediaUrl(m, true) : null, controls: true, playsinline: true, preload: "metadata", loop: p.type === "short" })
        : h("img", { src: mediaUrl(m), alt: m.alt || "", loading: "lazy" });
      if (p.nsfw) { el.classList.add("blur"); el.title = "Sensitive — click to show"; el.addEventListener("click", () => el.classList.remove("blur"), { once: true }); }
      box.append(el);
    }
    body.push(box);
    if (full && media.some((m) => m.kind === "video")) U2V.enhance(p, box, body, { h, api });   // U2-video
  }
  if (p.poll?.options) body.push(h("div", { class: "meta" }, ...p.poll.options.map((o, i) => h("div", {}, `${o} — ${p.poll.total ? Math.round(((p.poll.tally || {})[i] || 0) * 100 / p.poll.total) : 0}%`))));
  if (p.quoteOf && p.original && p.type !== "repost") body.push(h("div", { class: "card" }, postCard(p.original, false)));
  for (const t of (p.tags || []).slice(0, 6)) body.push(h("a", { class: "chip", href: `#/t/${encodeURIComponent(t)}` }, "#" + t));
  const c = { up: 0, down: 0, score: 0, views: 0, comments: 0, replies: 0, ...(p.counts || {}) };
  let my = p.my?.vote || 0;
  const community = p.type === "community";
  const like = h("button", { class: "act" });
  const dis = h("button", { class: "act" });
  const paint = () => {
    like.textContent = p.hideCounts ? (community ? "▲" : "♥") : community ? `▲ ${fmt(c.score)}` : `♥ ${fmt(c.up)}`;
    dis.textContent = p.hideCounts || community ? (community ? "▼" : "👎") : `👎 ${fmt(c.down)}`;
    like.classList.toggle("on", my === 1); dis.classList.toggle("on", my === -1);
  };
  async function vote(v) {
    if (needSignIn()) return;
    const next = my === v ? 0 : v;
    try {
      const r = await api(`/v1/posts/${encodeURIComponent(p.id)}/vote`, { method: "POST", body: { v: next } });
      Object.assign(c, r.counts || {}); my = r.my?.vote ?? next; paint();
    } catch (e) { toast(errText(e)); }
  }
  like.onclick = () => vote(1); dis.onclick = () => vote(-1); paint();
  const actions = h("div", { class: "actions" }, like, dis,
    h("a", { class: "act", href: `#/p/${encodeURIComponent(p.id)}`, style: "border-radius:999px;padding:.35em .85em" }, `💬 ${fmt((c.comments || 0) + (c.replies || 0))}`),
    h("button", { class: "act", onclick: () => { navigator.clipboard?.writeText(`${API}/p/${p.id}`); toast("Link copied"); } }, "Share"),
    me && me.user?.id !== p.authorId ? h("button", { class: "act", title: "Report", onclick: () => U4R.openReport({ kind: p.type === "short" ? "short" : "post", targetId: p.id, ownerId: p.authorId, ownerName: "@" + (p.author?.username || ""), preview: (p.title || p.text || "").slice(0, 200) }) }, "Report") : "",   // U4-fixes
    h("span", { class: "meta", style: "margin-left:auto;align-self:center" }, `${fmt(c.views)} views`));
  const card = h("article", { class: "card" }, head, ...body, actions);
  if (!full) card.querySelector(".text")?.addEventListener("click", () => (location.hash = `#/p/${encodeURIComponent(p.id)}`));
  return card;
}

/** Paged list over a `{items, cursor}` endpoint. */
async function list(path, render = postCard, empty = "Nothing here yet") {
  const box = h("div"); const more = h("button", { class: "tonal more" }, "Load more");
  let cursor = null, first = true;
  async function page() {
    more.disabled = true;
    try {
      const sep = path.includes("?") ? "&" : "?";
      const j = await api(cursor ? `${path}${sep}cursor=${encodeURIComponent(cursor)}` : path);
      const its = items(j);
      cursor = j?.cursor || null;
      its.forEach((p) => box.append(render(p)));
      if (first && !its.length) box.append(h("div", { class: "empty" }, empty));
      more.hidden = !cursor || !its.length;
    } catch (e) { if (first) box.append(h("div", { class: "empty" }, "Couldn't load this right now.")); more.hidden = true; }
    first = false; more.disabled = false;
  }
  more.onclick = page; await page();
  return h("div", {}, box, more);
}

const enc = encodeURIComponent;
const routes = {
  async ""() {
    const tabs = h("div", { class: "tabs" }, h("a", { href: "#/", class: "on" }, me ? "For You" : "Latest"), h("a", { href: "#/shorts" }, "Shorts"), h("a", { href: "#/explore" }, "Trending"), h("a", { href: "#/rising" }, "Rising Tide"), h("a", { href: "#/deep" }, "Deep Dives"));   // U2-video: last two
    return [tabs, await list("/v1/feed/foryou?shorts=0", postCard, "Nothing posted yet — check back soon.")];
  },
  async explore() {
    const [tr, pools, sugg] = await Promise.all([
      api("/v1/trending").catch(() => []), api("/v1/communities/top").catch(() => []), api("/v1/suggested").catch(() => []),
    ]);
    const tags = items(tr);
    return [
      h("h2", {}, "Trending today"),
      tags.length ? h("div", {}, ...tags.map((t) => h("a", { class: "chip", href: `#/t/${enc(t.tag)}` }, `#${t.tag} · ${fmt(t.today)}`))) : h("div", { class: "empty" }, "No trends yet today"),
      h("h2", {}, "People to follow"),
      ...items(sugg).slice(0, 10).map(userRow),
      h("h2", {}, "Top Pools"),
      ...items(pools).map((c) => h("div", { class: "card" }, h("a", { href: `#/c/${enc(c.id)}`, class: "name" }, `p/${c.name}`), h("div", { class: "meta" }, `${fmt(c.counts?.members)} members`), h("div", {}, c.description || ""))),
      h("h2", {}, "Featured"),
      ...(items(await api("/v1/featured").catch(() => [])).map((p) => postCard(p))),
    ];
  },
  async shorts() {
    const j = await api("/v1/feed/foryou?shorts=1").catch(() => null);
    const its = items(j).filter((p) => p.type === "short");
    if (!its.length) return h("div", { class: "empty" }, "No shorts yet.");
    const box = h("div", { class: "shorts" }, ...its.map((p) => {
      const m = (p.media || [])[0];
      return h("section", { class: "short" },
        m && m.b === "pub" && safeKey(m.key) ? h("video", { src: mediaUrl(m), poster: m.thumb ? mediaUrl(m, true) : null, loop: true, muted: true, playsinline: true, controls: true }) : h("div", { class: "meta" }, "Private short"),
        h("div", { class: "cap" }, h("a", { href: `#/u/${enc(p.author?.username || "")}`, style: "color:#fff;font-weight:700" }, flairName(p.author, p.author?.name || "")),   // U2-identity
          rich(p.text || ""),
          h("a", { href: `#/p/${enc(p.id)}`, style: "color:#cfe3ff" }, `♥ ${fmt(p.counts?.up)} · 💬 ${fmt(p.counts?.comments)}`)));
    }));
    const io = new IntersectionObserver((es) => es.forEach((e) => { const v = e.target.querySelector("video"); if (!v) return; if (e.isIntersecting) v.play().catch(() => {}); else v.pause(); }), { threshold: 0.7 });
    setTimeout(() => box.querySelectorAll(".short").forEach((s) => io.observe(s)), 0);
    return box;
  },
  async p(id) {
    let p;
    try { p = await api(`/v1/posts/${enc(id)}`); }
    catch { return h("div", { class: "empty" }, "This post is private, was removed, or doesn't exist.", h("br"), "Open it in the Ripple app if you have access."); }
    const out = [postCard(p, true), U4C.effectLink(p)];   // U4-fixes catch-up
    const replies = items(await api(`/v1/posts/${enc(id)}/replies`).catch(() => []));
    if (replies.length) { out.push(h("h3", {}, `Replies (${fmt(replies.length)})`)); replies.forEach((r) => out.push(postCard(r))); }
    const comments = items(await api(`/v1/posts/${enc(id)}/comments?sort=top`).catch(() => []));
    const byParent = {}; comments.forEach((c) => (byParent[c.parentId || "_"] ||= []).push(c));
    const replyBox = (parent) => {
      if (needSignIn()) return;
      const t = h("textarea", { placeholder: parent ? `Reply to ${parent.author?.name || ""}` : "Add a comment" });
      const err = h("div", { class: "err" });
      modal(h("h2", {}, parent ? "Reply" : "Comment"), h("div", { class: "stack" }, t, h("button", { onclick: async () => {
        if (!t.value.trim()) return;
        try { await api(`/v1/posts/${enc(p.id)}/comments`, { method: "POST", body: { text: t.value.trim(), ...(parent ? { parentId: parent.id } : {}) } }); close(); route(); }
        catch (e) { err.textContent = errText(e); }
      } }, "Post"), err));
    };
    const tree = (pid, depth) => (byParent[pid] || []).sort((a, b) => (b.pinned - a.pinned) || ((b.counts?.score || 0) - (a.counts?.score || 0))).map((c) =>
      h("div", { class: "comment" },
        h("div", { class: "meta" }, c.pinned ? "📌 " : "", h("a", { href: `#/u/${enc(c.author?.username || "")}` }, flairName(c.author, c.author?.name || c.author?.username || "")), ...badges(c.author?.badges, false), ribbonsHtml(c.author, true),   // U2-identity
           ` · ${ago(c.createdAt)} · ▲ ${fmt(c.counts?.score || 0)}`, c.editedAt && !c.deleted ? " · edited" : ""),
        c.deleted || c.removed ? h("div", { class: "meta" }, c.removed ? "[removed]" : "[deleted]") : rich(c.text),
        c.hearted ? h("div", { class: "meta", style: "color:#e5484d" }, "♥ by creator") : "",   // U2-social
        (c.videoReplies || []).length ? h("a", { class: "chip", href: `#/p/${enc(c.videoReplies[0])}` }, `▶ ${c.videoReplies.length} video repl${c.videoReplies.length === 1 ? "y" : "ies"}`) : "",
        !(c.deleted || c.removed) && String(c.gif || "").startsWith("sticker:") ? h("div", { class: "meta" }, "Sent a sticker — open the Ripple app to see it") : "",
        me ? h("button", { class: "ghost", onclick: () => replyBox(c) }, "Reply") : "",
        me && me.user?.id !== c.authorId && !(c.deleted || c.removed) ? h("button", { class: "ghost", onclick: () => U4R.openReport({ kind: "comment", targetId: c.id, ownerId: c.authorId, ownerName: "@" + (c.author?.username || ""), preview: (c.text || "").slice(0, 200) }) }, "Report") : "",   // U4-fixes
        ...(depth < 8 ? tree(c.id, depth + 1) : [])));
    out.push(h("h3", {}, `Comments (${fmt(comments.length)})`));
    out.push(p.locked ? h("div", { class: "meta" }, "🔒 Comments are locked.") : me ? h("button", { onclick: () => replyBox(null) }, "Add a comment") : h("button", { class: "tonal", onclick: () => signInModal() }, "Sign in to comment"));
    out.push(h("div", {}, ...tree("_", 0)));
    return out;
  },
  async u(name) {
    let u;
    try { u = await api(`/v1/u/${enc(name.toLowerCase())}`); }
    catch { return h("div", { class: "empty" }, "No one goes by that username."); }
    if (!u || u.deactivated) return h("div", { class: "empty" }, "This account isn't available.");
    const rel = u.rel || {};
    let following = !!rel.following, requested = !!rel.requested;
    const fb = h("button", {});
    const paint = () => (fb.textContent = following ? "Following" : requested ? "Requested" : "Follow");
    paint();
    fb.onclick = async () => {
      if (needSignIn()) return;
      try {
        await api(`/v1/users/${enc(u.id)}/follow`, { method: "POST", body: { on: !(following || requested) } });
        // re-read the relationship rather than guessing (private accounts turn follows into requests)
        const fresh = await api(`/v1/users/${enc(u.id)}`);
        following = !!fresh?.rel?.following; requested = !!fresh?.rel?.requested;
        paint(); if (requested) toast("Follow request sent");
      } catch (e) { toast(errText(e)); }
    };
    const links = (u.links || []).filter((l) => safeHref(l.url));
    const bannerUrl = keyUrl(u.banner);
    const hero = h("div", { class: "hero" },
      h("div", { class: "banner", style: bannerUrl ? `background-image:url("${bannerUrl}")` : null }),
      h("div", { class: "hero-body" }, flairAvatar(u, "big", avatar(u.avatar, u.displayName, true)),   // U2-identity: flair, animated picture, banners
        h("h1", { style: "margin:.2em 0 0" }, flairName(u, u.displayName || u.username), " ", ...badges(u.badges)),
        ribbonsHtml(u),
        h("div", { class: "handle" }, `@${u.username}`, u.pronouns ? ` · ${u.pronouns}` : ""),
        u.tagline ? h("div", { style: "font-weight:600;margin-top:4px" }, u.tagline) : "",
        u.bio ? rich(u.bio) : "",
        h("div", {}, ...links.map((l) => h("a", { class: "chip", href: safeHref(l.url), rel: "noopener nofollow ugc", target: "_blank" }, l.label || l.url))),
        h("div", { class: "counts" }, h("span", {}, h("b", {}, fmt(u.counts?.posts)), " posts"), h("span", {}, h("b", {}, fmt(u.counts?.followers)), " followers"),
          h("span", {}, h("b", {}, fmt(u.counts?.following)), " following"), h("span", {}, h("b", {}, fmt(u.counts?.karma)), " karma")),
        me?.user?.id !== u.id ? h("div", { style: "display:flex;gap:8px;flex-wrap:wrap" }, fb, me ? h("button", { class: "tonal", onclick: () => U4R.openReport({ kind: "user", targetId: u.id, ownerId: u.id, ownerName: "@" + u.username, preview: "@" + u.username, onBlocked: () => location.reload() }) }, "Report") : "") : U4C.reportButton()));   // U4-fixes: Report   // U4-fixes catch-up: ✨ Tide Report
    if (u.private && !following && me?.user?.id !== u.id) return [hero, h("div", { class: "empty" }, "🔒 This account is private.")];
    return [hero, await list(`/v1/users/${enc(u.id)}/posts?kind=posts`, postCard, "No public posts yet.")];
  },
  async c(name) {
    let c;
    try { c = await api(`/v1/communities/${enc(name.toLowerCase())}`); } catch { return h("div", { class: "empty" }, "That Pool doesn't exist."); }
    if (!c || c.removed) return h("div", { class: "empty" }, "That Pool doesn't exist.");
    const bannerUrl = keyUrl(c.banner);
    return [h("div", { class: "hero" }, h("div", { class: "banner", style: bannerUrl ? `background-image:url("${bannerUrl}")` : null }),
      h("div", { class: "hero-body" }, h("h1", {}, `p/${c.name}`), h("div", { class: "meta" }, `${fmt(c.counts?.members)} members · ${c.type}`), c.description ? rich(c.description) : "",
        (c.rules || []).length ? h("ol", {}, ...c.rules.map((r) => h("li", {}, r))) : "")),
      await list(`/v1/communities/${enc(c.id)}/posts?sort=hot&window=week`, postCard, "No posts yet.")];
  },
  async t(tag) {
    tag = String(tag || "").toLowerCase().replace(/^#/, "");
    const info = await api(`/v1/tags/${enc(tag)}`).catch(() => null);
    return [h("h1", {}, `#${tag}`), info ? h("div", { class: "meta" }, `${fmt(info.total)} posts · ${fmt(info.today)} today`) : "",
      await list(`/v1/tags/${enc(tag)}/posts?sort=new`, postCard, "No posts with this tag yet.")];
  },
  async search(q) {
    q = String(q || "").trim();
    if (!q) return h("div", { class: "empty" }, "Type something to search.");
    const r = await api(`/v1/search?q=${enc(q)}`).catch(() => ({}));
    const sec = (title, arr, fn) => [h("h2", {}, title), ...(arr?.length ? arr.map(fn) : [h("div", { class: "meta" }, "Nothing found")])];
    return [
      ...sec("People", r.users, userRow),
      ...sec("Tags", r.tags, (t) => { const name = typeof t === "string" ? t : t.tag; return h("a", { class: "chip", href: `#/t/${enc(name)}` }, `#${name}`); }),
      ...sec("Pools", r.pools, (c) => h("div", { class: "card" }, h("a", { href: `#/c/${enc(c.id)}`, class: "name" }, `p/${c.name}`))),
      ...sec("Posts", r.posts, (p) => postCard(p)),
    ];
  },
  async privacy() { return legal("privacy"); },
  async terms() { return legal("terms"); },
};
function userRow(u) {
  return h("div", { class: "card post-head" }, flairAvatar(u, "", avatar(u.avatar, u.displayName)),   // U2-identity
    h("div", {}, h("a", { href: `#/u/${enc(u.username)}`, class: "name" }, flairName(u, u.displayName || u.username), ...badges(u.badges, false), ribbonsHtml(u, true)), h("div", { class: "handle" }, `@${u.username}`)));
}

async function legal(doc_) {
  const md = await fetch(`legal/${doc_}.md`).then((r) => (r.ok ? r.text() : "")).catch(() => "");
  const out = h("div", { class: "legal card" });
  for (const line of md.split("\n")) {
    const clean = line.replace(/\*\*/g, "").replace(/(^|\s)\*([^*]+)\*/g, "$1$2");
    if (line.startsWith("# ")) out.append(h("h1", {}, clean.slice(2)));
    else if (line.startsWith("## ")) out.append(h("h2", {}, clean.slice(3)));
    else if (line.startsWith("### ")) out.append(h("h3", {}, clean.slice(4)));
    else if (/^\s*[-*] /.test(line)) out.append(h("li", {}, clean.replace(/^\s*[-*] /, "")));
    else if (line.trim()) out.append(h("p", {}, clean));
  }
  return out.children.length ? out : h("div", { class: "empty" }, "Coming soon.");
}

Object.assign(routes, U2V.routes({ h, api, list, postCard, items }));   // U2-video
// U3-social: Tide Map at #/map (only renders for people with the ripple.tide_map beta; the page checks it)
U3M.initU3({ api, apiBase: API, token: () => token, myId: () => me?.user?.id || null, avatarUrl: keyUrl, profileHref: (u) => `#/u/${encodeURIComponent(u?.username || "")}`,
  betaId: "ripple.tide_map", mapHref: "#/map", toast });
routes.map = U3M.hashRoute({ layout: "stack", title: "Tide Map" });
// U4-fixes catch-up: #/effect/<postId> (Ripple Effect) and #/tide/<range> (Tide Report), both betas
U4C.init({ h, api, postCard, avatar, keyUrl, fmt, toast, me: () => me, betaOn: U3M.betaOn });
Object.assign(routes, U4C.routes());
U4R.initReports({ api, apiBase: API, token: () => token, toast });   // U4-fixes: #/reports (yours), #/mod (review queue, moderators)

async function route() {
  const [, name = "", ...rest] = location.hash.replace(/^#/, "").split("/");
  const fn = routes[name] || routes[""];
  view.replaceChildren(h("div", { class: "empty" }, "Loading…"));
  try {
    const out = await fn(...rest.map((x) => decodeURIComponent(x)));
    view.replaceChildren(...[out].flat());
  } catch (e) { console.error(e); view.replaceChildren(h("div", { class: "empty" }, "Couldn't load this page.")); }
  window.scrollTo(0, 0);
}

$("#search").addEventListener("submit", (e) => { e.preventDefault(); location.hash = `#/search/${encodeURIComponent(e.target.q.value)}`; });
$("#studio").href = CONFIG.studio; $("#getapp").href = CONFIG.androidApp;
window.addEventListener("hashchange", route);
(async () => { await loadMe(); renderMe(); loadOwner(); route(); })();
