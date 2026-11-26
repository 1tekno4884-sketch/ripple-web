// U4-fixes catch-up: Ripple Effect + Tide Report on Ripple web (the app had them since Update 3; the web didn't).
// Same Worker routes as the app: GET /v1/u3/ripple-effect/:postId (beta ripple.ripple_effect) and
// GET /v1/u3/tide-report?range=week|month|year&tzo= (beta ripple.tide_report). Text-only DOM (no innerHTML from data).
//   #/effect/<postId>   how a post spread: rings of reposts + quotes, a 72-hour timeline, totals
//   #/tide[/<range>]    your week / month / year as story cards
let C = null;   // { h, api, postCard, avatar, keyUrl, fmt, toast, me, betaOn }
const RIPPLE_EFFECT = "ripple.ripple_effect", TIDE_REPORT = "ripple.tide_report";
const reduceMotion = () => window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
const SVG = "http://www.w3.org/2000/svg";
function s(tag, attrs = {}, ...kids) {
  const el = document.createElementNS(SVG, tag);
  for (const [k, v] of Object.entries(attrs)) if (v !== null && v !== undefined && v !== false) el.setAttribute(k, String(v));
  for (const k of kids.flat()) if (k !== null && k !== undefined && k !== false) el.append(k instanceof Node ? k : document.createTextNode(String(k)));
  return el;
}

function css() {
  if (document.getElementById("u4c-css")) return;
  const st = document.createElement("style"); st.id = "u4c-css";
  st.textContent = `
.u4c-head{display:flex;align-items:center;gap:10px;margin:4px 0 14px}.u4c-head h1{margin:0;font-size:24px}
.u4c-sub{color:var(--muted);font-size:14px}
.u4c-link{display:inline-flex;align-items:center;gap:6px;border-radius:999px;padding:.4em .95em;background:var(--surface3);color:var(--text);font-weight:600;font-size:14px;margin:0 0 14px}
.u4c-link:hover{text-decoration:none;filter:brightness(1.1)}
.u4c-pond{position:relative;aspect-ratio:1;max-width:440px;margin:0 auto 6px}
.u4c-pond svg{width:100%;height:100%;display:block}
.u4c-pond .u4c-center{position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);border-radius:50%;box-shadow:0 0 0 4px var(--surface),0 0 0 6px var(--primary)}
.u4c-pond .u4c-center .avatar{width:58px;height:58px;font-size:22px}
.u4c-dot{cursor:pointer;transition:transform .15s}.u4c-dot:hover{transform:scale(1.25)}
.u4c-wave{fill:none;stroke:var(--primary);stroke-width:2;opacity:0;transform-origin:50% 50%;animation:u4c-ring 4.2s ease-out infinite}
@keyframes u4c-ring{0%{transform:scale(.18);opacity:.7}100%{transform:scale(1);opacity:0}}
.u4c-in{opacity:0;animation:u4c-in .5s ease-out forwards}@keyframes u4c-in{from{opacity:0;transform:scale(.4)}to{opacity:1;transform:none}}
.u4c-legend{display:flex;gap:16px;justify-content:center;color:var(--muted);font-size:13px;margin-bottom:16px}
.u4c-legend i{display:inline-block;width:10px;height:10px;border-radius:50%;margin-right:6px;vertical-align:middle}
.u4c-tiles{display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin:14px 0}
@media (max-width:560px){.u4c-tiles{grid-template-columns:repeat(2,1fr)}}
.u4c-tile{background:var(--surface2);border-radius:16px;padding:12px 14px}.u4c-tile b{display:block;font-size:22px;line-height:1.2}.u4c-tile span{color:var(--muted);font-size:13px}
.u4c-bars{width:100%;height:110px;display:block}.u4c-axis{display:flex;justify-content:space-between;color:var(--muted);font-size:12px;margin-top:4px}.u4c-bars rect{fill:var(--primary)}.u4c-bars text{fill:var(--muted);font-size:10px}
.u4c-q{display:flex;gap:10px;align-items:flex-start;padding:10px 0;border-top:1px solid var(--line)}.u4c-q:first-child{border-top:0}
.u4c-tabs{display:flex;gap:8px;margin-bottom:14px}.u4c-tabs a{padding:.4em 1em;border-radius:999px;background:var(--surface2);color:var(--muted);font-weight:600}
.u4c-tabs a.on{background:var(--vivid);color:#fff}.u4c-tabs a:hover{text-decoration:none}
.u4c-deck{display:flex;overflow-x:auto;scroll-snap-type:x mandatory;gap:14px;padding:4px 4px 22px;margin:0 -4px;scrollbar-width:none}.u4c-deck::-webkit-scrollbar{display:none}
.u4c-card{position:relative;flex:0 0 min(360px,86vw);aspect-ratio:9/15;border-radius:28px;overflow:hidden;scroll-snap-align:center;color:#fff;padding:30px 26px 54px;display:flex;flex-direction:column;justify-content:center;box-shadow:0 8px 18px rgba(4,20,60,.22)}
.u4c-card .u4c-k{letter-spacing:2px;text-transform:uppercase;font-size:13px;font-weight:600;color:rgba(255,255,255,.72);margin-bottom:6px}
.u4c-card .u4c-big{font-size:64px;font-weight:900;line-height:1.02}.u4c-card .u4c-hl{font-size:26px;font-weight:700;line-height:1.2;margin:4px 0 8px}
.u4c-card .u4c-dim{color:rgba(255,255,255,.75)}.u4c-card .u4c-row{display:flex;justify-content:space-between;align-items:baseline;padding:8px 0;border-bottom:1px solid rgba(255,255,255,.14)}
.u4c-card .u4c-row b{font-size:24px}.u4c-card .u4c-foot{position:absolute;left:24px;right:24px;bottom:16px;display:flex;justify-content:space-between;font-size:12px;font-weight:600;color:rgba(255,255,255,.7)}
.u4c-card svg.sea{position:absolute;left:0;right:0;bottom:0;width:100%;height:30%;pointer-events:none}
.u4c-card .sea path{fill:#fff}.u4c-card .sea .a{opacity:.05;animation:u4c-drift 9s ease-in-out infinite alternate}.u4c-card .sea .b{opacity:.07;animation:u4c-drift 12s ease-in-out infinite alternate-reverse}
@keyframes u4c-drift{from{transform:translateX(-6%)}to{transform:translateX(0)}}
.u4c-card .avatar{width:84px;height:84px;font-size:32px;margin-bottom:18px;border:3px solid rgba(255,255,255,.5)}
.u4c-card .u4c-mini{display:flex;align-items:center;gap:10px;margin:6px 0}.u4c-card .u4c-mini .avatar{width:40px;height:40px;font-size:16px;margin:0;border-width:2px}
.u4c-card .u4c-post{background:rgba(255,255,255,.12);border-radius:18px;padding:12px 14px;margin:10px 0;font-size:15px;max-height:9.5em;overflow:hidden}
.u4c-card a{color:#fff;text-decoration:underline}
.u4c-card a.u4c-tag{text-decoration:none;color:#fff;display:inline-block;background:rgba(255,255,255,.14);border-radius:999px;padding:.3em .9em;margin:4px 6px 4px 0;font-weight:600}
.u4c-nav{display:flex;gap:8px;align-items:center;justify-content:center;margin:8px 0 18px}
.u4c-nav .dots{display:flex;gap:6px}.u4c-nav .dots i{width:7px;height:7px;border-radius:50%;background:var(--line)}.u4c-nav .dots i.on{background:var(--primary)}
@media (prefers-reduced-motion: reduce){.u4c-wave,.u4c-card .sea path{animation:none}.u4c-in{animation:none;opacity:1}}
`;
  document.head.append(st);
}

export function init(ctx) { C = ctx; }

/** A link under a post (post page only) to its Ripple Effect, shown once the beta check says yes. */
export function effectLink(p) {
  const slot = C.h("div");   // filled in place (the page may not be attached yet when the beta check answers)
  if (!C.me() || !p?.id) return slot;
  C.betaOn(RIPPLE_EFFECT).then((on) => { if (on) { css(); slot.append(C.h("a", { class: "u4c-link", href: `#/effect/${encodeURIComponent(p.id)}` }, "〰 Ripple Effect · how this spread")); } });
  return slot;
}
/** "✨ Tide Report" on your own profile (beta). */
export function reportButton() {
  const slot = C.h("span");
  if (!C.me()) return slot;
  C.betaOn(TIDE_REPORT).then((on) => { if (on) slot.append(C.h("button", { class: "tonal", onclick: () => (location.hash = "#/tide/week") }, "✨ Tide Report")); });
  return slot;
}

const errPage = (e, what) => C.h("div", { class: "empty" }, e?.status === 403 ? `${what} isn't turned on for your account yet. It's a beta — turn it on from the Beta screen in the app.`
  : e?.status === 404 ? "This post is private, was removed, or doesn't exist." : e?.status === 401 ? "Sign in to see this." : "Couldn't load this right now.");
function ago(ms) { const h = Math.round(ms / 3600000); return h < 1 ? "within the hour" : h < 48 ? `${h} h later` : `${Math.round(h / 24)} days later`; }

// ------------------------------------------------------------------ Ripple Effect
async function effectPage(postId) {
  css();
  const { h } = C;
  if (!C.me()) return h("div", { class: "empty" }, "Sign in to see how posts spread.");
  let r;
  try { r = await C.api(`/v1/u3/ripple-effect/${encodeURIComponent(postId)}`); } catch (e) { return errPage(e, "Ripple Effect"); }
  const rings = r.rings || [];
  const all = rings.flat();
  const root = r.post || {};
  const t0 = root.createdAt || 0;
  const head = h("div", { class: "u4c-head" }, h("button", { class: "ghost", onclick: () => history.back(), "aria-label": "Back" }, "←"),
    h("div", {}, h("h1", {}, "Ripple Effect"), h("div", { class: "u4c-sub" }, all.length ? `${C.fmt(r.reach)} ${r.reach === 1 ? "person" : "people"} carried it further` : "No reposts or quotes yet")));

  // the pond: center = the post's author, rings = waves of reposts/quotes (inner = direct, outer = reposts of quotes)
  const W = 400, cx = W / 2, R = [92, 140, 182];
  const svg = s("svg", { viewBox: `0 0 ${W} ${W}`, role: "img", "aria-label": `${all.length} reposts and quotes in ${rings.length} rings` });
  R.forEach((rad, i) => svg.append(s("circle", { cx, cy: cx, r: rad, fill: "none", stroke: "var(--line)", "stroke-width": 1, "stroke-dasharray": i < rings.length ? null : "3 5" })));
  if (!reduceMotion()) for (let i = 0; i < 3; i++) svg.append(s("circle", { class: "u4c-wave", cx, cy: cx, r: R[2] + 8, style: `animation-delay:${i * 1.4}s` }));
  const pos = new Map([[root.id, [cx, cx]]]);
  const maxLikes = Math.max(1, ...all.map((x) => x.likes || 0));
  rings.forEach((ring, ri) => {
    const rad = R[Math.min(ri, 2)];
    const off = ri * 0.6;
    ring.forEach((it, i) => {
      const a = off + (i / ring.length) * Math.PI * 2 - Math.PI / 2;
      const x = cx + Math.cos(a) * rad, y = cx + Math.sin(a) * rad;
      pos.set(it.id, [x, y]);
      const from = pos.get(it.parent);
      if (from && ri > 0) svg.append(s("line", { x1: from[0], y1: from[1], x2: x, y2: y, stroke: "var(--line)", "stroke-width": 1.2 }));
      const r0 = 5 + 7 * Math.sqrt((it.likes || 0) / maxLikes);
      const dot = s("circle", { class: "u4c-dot u4c-in", cx: x, cy: y, r: r0, fill: it.kind === "quote" ? "#2ec4b6" : "var(--primary)",
        stroke: "var(--surface)", "stroke-width": 2, style: `animation-delay:${reduceMotion() ? 0 : 0.25 + ri * 0.35 + i * 0.02}s;transform-origin:${x}px ${y}px` },
        s("title", {}, `@${it.user?.username || "someone"} ${it.kind === "quote" ? "quoted" : "reposted"} · ${ago((it.at || 0) - t0)}${it.likes ? ` · ♥ ${it.likes}` : ""}`));
      dot.addEventListener("click", () => (location.hash = `#/p/${encodeURIComponent(it.kind === "quote" ? it.id : it.parent)}`));
      svg.append(dot);
    });
  });
  const center = h("div", { class: "u4c-center" }, C.avatar(root.author?.avatar, root.author?.name || root.author?.username));
  const pond = h("div", { class: "u4c-pond" }, svg, center);
  const legend = h("div", { class: "u4c-legend" }, h("span", {}, h("i", { style: "background:var(--primary)" }), "Repost"), h("span", {}, h("i", { style: "background:#2ec4b6" }), "Quote"), h("span", {}, "Bigger dot = more likes"));

  // first 72 hours
  const tl = new Array(72).fill(0); for (const p of r.timeline || []) if (p.h >= 0 && p.h < 72) tl[p.h] = p.n;
  const peak = Math.max(1, ...tl);
  const bars = s("svg", { class: "u4c-bars", viewBox: "0 0 360 102", preserveAspectRatio: "none", role: "img", "aria-label": "Reposts and quotes per hour, first 72 hours" });
  tl.forEach((n, i) => { if (n) bars.append(s("rect", { x: i * 5, y: 100 - (n / peak) * 92, width: 3.6, height: (n / peak) * 92, rx: 1.5 }, s("title", {}, `Hour ${i + 1}: ${n}`))); });
  bars.append(s("line", { x1: 0, x2: 360, y1: 100, y2: 100, stroke: "var(--line)", "vector-effect": "non-scaling-stroke" }));
  const axis = h("div", { class: "u4c-axis" }, ...["0 h", "24 h", "48 h", "72 h"].map((t) => h("span", {}, t)));

  const t = r.totals || {};
  const tile = (n, label) => h("div", { class: "u4c-tile" }, h("b", {}, C.fmt(n)), h("span", {}, label));
  const tiles = h("div", { class: "u4c-tiles" }, tile(r.reach, "reach"), tile(t.reposts, "reposts"), tile(t.quotes, "quotes"), tile(t.views, "views"),
    tile(t.likes, "likes"), tile(t.comments, "comments"), tile(t.saves, "saves"), tile(t.shares, "shares"));

  const quotes = all.filter((x) => x.kind === "quote" && x.text);
  const qBox = quotes.length ? h("div", { class: "card" }, h("h3", { style: "margin-top:0" }, "What people said"),
    ...quotes.slice(0, 30).map((q) => h("div", { class: "u4c-q" }, C.avatar(q.user?.avatar, q.user?.name || q.user?.username),
      h("div", {}, h("a", { href: `#/p/${encodeURIComponent(q.id)}`, class: "name" }, q.user?.name || `@${q.user?.username || ""}`),
        h("div", { class: "meta" }, `@${q.user?.username || ""} · ${ago((q.at || 0) - t0)}`), h("div", {}, q.text))))) : "";

  return [head, h("div", { class: "card" }, pond, legend), h("div", { class: "card" }, h("h3", { style: "margin-top:0" }, "The first 72 hours"), bars, axis), tiles, qBox,
    h("h3", {}, "The post"), C.postCard(root)];
}

// ------------------------------------------------------------------ Tide Report
const CARD_COLORS = { intro: ["#061a3d", "#1565ff"], got: ["#0A2F6B", "#2F8DFF"], followers: ["#00363F", "#00A3A3"], made: ["#17154D", "#5468D4"],
  topPost: ["#04253F", "#2C7DB8"], topShort: ["#21124A", "#7A56D6"], time: ["#050B24", "#243B8F"], fans: ["#002F3A", "#0E7C86"], tags: ["#0B2246", "#3B76B5"], outro: ["#061a3d", "#1565ff"] };
const WORD = { week: "week", month: "month", year: "year" };
const fmtDay = (ms) => new Date(ms).toLocaleDateString(undefined, { month: "short", day: "numeric" });
const hourLabel = (h) => new Date(Date.UTC(2020, 0, 1, h)).toLocaleTimeString(undefined, { hour: "numeric", timeZone: "UTC" });

function countUp(el, n) {
  el.textContent = C.fmt(n);
  if (reduceMotion() || !n) return;
  el.dataset.n = n; el.textContent = "0";
}
function runCount(card) {
  card.querySelectorAll("[data-n]").forEach((el) => {
    const n = Number(el.dataset.n); delete el.dataset.n;
    const start = performance.now(), dur = 1100;
    const step = (now) => { const p = Math.min(1, (now - start) / dur); el.textContent = C.fmt(Math.round(n * (1 - Math.pow(1 - p, 3)))); if (p < 1) requestAnimationFrame(step); };
    requestAnimationFrame(step);
  });
}

async function tidePage(range0) {
  css();
  const { h } = C;
  if (!C.me()) return h("div", { class: "empty" }, "Sign in to see your Tide Report.");
  const range = WORD[range0] ? range0 : "week";
  let r;
  try { r = await C.api(`/v1/u3/tide-report?range=${range}&tzo=${-new Date().getTimezoneOffset()}`); } catch (e) { return errPage(e, "Tide Report"); }
  const word = WORD[r.range] || range;
  const me = C.me().user || {};
  const span = `${fmtDay(r.from)} – ${fmtDay(r.to)}`;
  const big = (n) => { const b = h("div", { class: "u4c-big" }); countUp(b, n); return b; };
  const row = (label, n) => { const b = h("b"); countUp(b, n); return h("div", { class: "u4c-row" }, h("span", { class: "u4c-dim" }, label), b); };
  const sea = () => s("svg", { class: "sea", viewBox: "0 0 400 120", preserveAspectRatio: "none", "aria-hidden": "true" },
    s("path", { class: "a", d: "M0 40 Q50 20 100 40 T200 40 T300 40 T400 40 T500 40 V120 H0 Z" }), s("path", { class: "b", d: "M0 70 Q60 50 120 70 T240 70 T360 70 T480 70 V120 H0 Z" }));
  const card = (key, ...kids) => { const [a, b] = CARD_COLORS[key]; return h("section", { class: "u4c-card", style: `background:linear-gradient(170deg,${a},${b})`, "aria-label": key },
    sea(), ...kids, h("div", { class: "u4c-foot" }, h("span", {}, "Ripple · Tide Report"), h("span", {}, span))); };
  const postBlurb = (p, kind) => {
    if (!p) return null;
    const c = p.counts || {};
    return [h("div", { class: "u4c-post" }, p.title || p.text || (kind === "short" ? "Your Short" : "Your post")),
      h("div", { class: "u4c-dim" }, `♥ ${C.fmt(c.up)} · 💬 ${C.fmt(c.comments)} · ${C.fmt(c.views)} views`),
      h("div", { style: "margin-top:12px" }, h("a", { href: `#/p/${encodeURIComponent(p.id)}` }, kind === "short" ? "Watch it →" : "Open it →"))];
  };
  const cards = [
    card("intro", C.avatar(me.avatar, me.displayName || me.username, true), h("div", { class: "u4c-k" }, "Tide Report"), h("div", { class: "u4c-big", style: "font-size:44px" }, `Your ${word}`, h("br"), "on Ripple"),
      h("div", { class: "u4c-dim", style: "margin-top:12px" }, "Scroll sideways to dive in →")),
    card("got", h("div", { class: "u4c-k" }, `This ${word} you got`), big(r.got?.views), h("div", { class: "u4c-hl" }, "views"), row("Likes", r.got?.likes), row("Comments", r.got?.comments)),
    card("followers", h("div", { class: "u4c-k" }, "New followers"), h("div", { class: "u4c-big" }, "+", (() => { const b = h("span"); countUp(b, r.got?.followers); return b; })()),
      h("div", { class: "u4c-hl" }, r.got?.followers ? "people joined your tide" : "Quiet waters — keep posting")),
    card("made", h("div", { class: "u4c-k" }, `You made`), row("Posts", r.made?.posts), row("Shorts", r.made?.shorts), row("Comments", r.made?.comments), row("Likes given", r.made?.likesGiven)),
    r.topPost ? card("topPost", h("div", { class: "u4c-k" }, "Your top post"), ...postBlurb(r.topPost, "post")) : null,
    r.topShort ? card("topShort", h("div", { class: "u4c-k" }, "Your top Short"), ...postBlurb(r.topShort, "short")) : null,
    (r.bestDay || r.peakHour !== null) ? card("time", h("div", { class: "u4c-k" }, "Your best time"),
      r.bestDay ? [h("div", { class: "u4c-hl" }, new Date(r.bestDay.day * 86400000).toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric", timeZone: "UTC" })),
        h("div", { class: "u4c-dim" }, `Biggest day · ${C.fmt(r.bestDay.views)} view${r.bestDay.views === 1 ? "" : "s"}`)] : null,
      r.peakHour !== null && r.peakHour !== undefined ? [h("div", { class: "u4c-big", style: "margin-top:22px" }, hourLabel(r.peakHour)), h("div", { class: "u4c-dim" }, "peak hour")] : null) : null,
    (r.fans || []).length ? card("fans", h("div", { class: "u4c-k" }, "Your biggest fans"),
      ...r.fans.map((f, i) => h("div", { class: "u4c-mini" }, C.avatar(f.user?.avatar, f.user?.name || f.user?.username),
        h("div", {}, h("div", { style: i ? "" : "font-size:20px;font-weight:700" }, f.user?.name || `@${f.user?.username || ""}`), h("div", { class: "u4c-dim" }, `@${f.user?.username || ""} · ${C.fmt(f.likes)} like${f.likes === 1 ? "" : "s"}`))))) : null,
    (r.tags || []).length ? card("tags", h("div", { class: "u4c-k" }, "Your tags"), h("div", {}, ...r.tags.map((t) => h("a", { class: "u4c-tag", href: `#/t/${encodeURIComponent(t.tag)}` }, `#${t.tag} · ${t.n}`)))) : null,
    card("outro", h("div", { class: "u4c-big", style: "font-size:44px" }, "That's your tide"), h("div", { class: "u4c-dim", style: "margin-top:10px" }, `See you next ${word}.`)),
  ].filter(Boolean);
  const deck = h("div", { class: "u4c-deck", tabindex: 0, "aria-label": "Tide Report cards — scroll sideways" }, ...cards);
  const dots = h("div", { class: "dots" }, ...cards.map(() => h("i")));
  let idx = 0;
  const go = (i) => { idx = Math.max(0, Math.min(cards.length - 1, i)); cards[idx].scrollIntoView({ behavior: reduceMotion() ? "auto" : "smooth", inline: "center", block: "nearest" }); };
  const io = new IntersectionObserver((es) => es.forEach((e) => { if (e.isIntersecting) { runCount(e.target); idx = cards.indexOf(e.target); [...dots.children].forEach((d, k) => d.classList.toggle("on", k === idx)); } }), { root: deck, threshold: 0.6 });
  setTimeout(() => cards.forEach((c) => io.observe(c)), 0);
  deck.addEventListener("keydown", (e) => { if (e.key === "ArrowRight") { e.preventDefault(); go(idx + 1); } if (e.key === "ArrowLeft") { e.preventDefault(); go(idx - 1); } });
  const summary = () => [`My ${word} on Ripple (${span})`, `${C.fmt(r.got?.views)} views · ${C.fmt(r.got?.likes)} likes · +${C.fmt(r.got?.followers)} followers`,
    `Made ${r.made?.posts || 0} posts, ${r.made?.shorts || 0} Shorts`, ...(r.tags || []).length ? [`Top tags: ${r.tags.map((t) => "#" + t.tag).join(" ")}`] : []].join("\n");
  const nav = h("div", { class: "u4c-nav" }, h("button", { class: "tonal", "aria-label": "Previous card", onclick: () => go(idx - 1) }, "‹"), dots,
    h("button", { class: "tonal", "aria-label": "Next card", onclick: () => go(idx + 1) }, "›"),
    h("button", { class: "ghost", onclick: () => { navigator.clipboard?.writeText(summary()).then(() => C.toast("Summary copied"), () => C.toast("Couldn't copy")); } }, "Copy summary"));
  const tabs = h("div", { class: "u4c-tabs" }, ...["week", "month", "year"].map((k) => h("a", { href: `#/tide/${k}`, class: k === range ? "on" : "" }, k[0].toUpperCase() + k.slice(1))));
  const head = h("div", { class: "u4c-head" }, h("button", { class: "ghost", onclick: () => history.back(), "aria-label": "Back" }, "←"),
    h("div", {}, h("h1", {}, "Tide Report"), h("div", { class: "u4c-sub" }, "Your stats as story cards · beta")));
  return [head, tabs, deck, nav];
}

export function routes() { return { effect: (id) => effectPage(id || ""), tide: (range) => tidePage(range) }; }
