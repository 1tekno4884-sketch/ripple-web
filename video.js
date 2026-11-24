// Update 2 "video" area on the Ripple web viewer (src/video.ts on the Worker): Buoys (chapters), creator captions and
// speed on video posts, plus Rising Tide, Deep Dives, Currents and premiere countdown pages. Text-only DOM (no innerHTML).

const SPEEDS = [0.5, 0.75, 1, 1.25, 1.5, 1.75, 2];
const dur = (s) => { s = Math.max(0, Math.floor(s)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`; };
const vttTime = (s) => { const ms = Math.round(s * 1000); const h = Math.floor(ms / 3600000), m = Math.floor(ms / 60000) % 60, x = Math.floor(ms / 1000) % 60; return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(x).padStart(2, "0")}.${String(ms % 1000).padStart(3, "0")}`; };

/** Full post page: Buoys list (click to seek), captions track, speed menu. */
export async function enhance(p, box, body, { h, api }) {
  const video = box?.querySelector("video");
  if (!video) return;
  let info = null;
  try { info = await api(`/v1/videos/${encodeURIComponent(p.id)}`); } catch { return; }
  const bar = h("div", { class: "actions", style: "flex-wrap:wrap;gap:.4em" });
  const speed = h("select", { "aria-label": "Playback speed", style: "width:auto;padding:.3em .6em" }, ...SPEEDS.map((s) => h("option", { value: String(s), selected: s === 1 }, `${s}×`)));
  speed.onchange = () => { video.playbackRate = Number(speed.value); };
  bar.append(h("span", { class: "meta" }, "Speed"), speed);
  if (info?.captions?.cues?.length) {
    const vtt = "WEBVTT\n\n" + info.captions.cues.map((c, i) => `${i + 1}\n${vttTime(c.s)} --> ${vttTime(c.e)}\n${String(c.t).replace(/-->/g, "→")}\n`).join("\n");
    const track = h("track", { kind: "captions", label: info.captions.lang || "Captions", srclang: "en", src: URL.createObjectURL(new Blob([vtt], { type: "text/vtt" })) });
    video.append(track);
    const cc = h("button", { class: "tonal" }, "CC off");
    cc.onclick = () => { const t = video.textTracks[0]; if (!t) return; t.mode = t.mode === "showing" ? "hidden" : "showing"; cc.textContent = t.mode === "showing" ? "CC on" : "CC off"; };
    bar.append(cc);
  }
  if (info?.long) bar.append(h("span", { class: "chip" }, "Deep Dive"));
  box.after(bar);
  if (info?.chapters?.length) {
    const list = h("div", { class: "card", style: "padding:.6em 1em" }, h("div", { class: "title", style: "font-size:1em" }, "Buoys"));
    for (const b of info.chapters) {
      const a = h("a", { href: "#", style: "display:block;padding:.15em 0" }, `${dur(b.t)}  ${b.title}`);
      a.onclick = (e) => { e.preventDefault(); video.currentTime = b.t; video.play().catch(() => {}); };
      list.append(a);
    }
    bar.after(list);
  }
  if (info?.launch && !info.launch.live) bar.after(h("div", { class: "meta" }, "⏳ Scheduled — ", h("a", { href: `#/premiere/${encodeURIComponent(p.id)}` }, "countdown")));
}

export function routes({ h, api, list, postCard, items }) {
  return {
    async rising(kind = "all") {
      const tabs = h("div", { class: "tabs" }, ...[["all", "Everything"], ["videos", "Videos"], ["shorts", "Shorts"], ["posts", "Posts"]]
        .map(([k, l]) => h("a", { href: `#/rising/${k}`, class: k === kind ? "on" : null }, l)));
      let rows = [];
      try { rows = items(await api(`/v1/rising?kind=${encodeURIComponent(kind)}`)); } catch { /* shown as empty */ }
      return [h("h2", {}, "Rising Tide"), h("div", { class: "meta" }, "What's climbing fastest right now."), tabs,
        ...(rows.length ? rows.map((p, i) => h("div", {}, h("div", { class: "meta" }, `#${i + 1}`), postCard(p))) : [h("div", { class: "empty" }, "Calm waters — nothing is rising yet.")])];
    },
    async deep() {
      return [h("h2", {}, "Deep Dives"), h("div", { class: "meta" }, "Longer videos, up to 3 minutes."), await list("/v1/videos", postCard, "No Deep Dives yet.")];
    },
    async current(id) {
      let r;
      try { r = await api(`/v1/currents/${encodeURIComponent(id)}`); } catch { return h("div", { class: "empty" }, "That Current is private or gone."); }
      const c = r.current || {};
      return [h("h2", {}, c.name || "Current"), h("div", { class: "meta" }, `${c.count || 0} items`, c.owner ? ` · by @${c.owner.username}` : ""), c.description ? h("p", {}, c.description) : "",
        ...items(r).map((p) => postCard(p))];
    },
    async premiere(id) {
      let l;
      try { l = await api(`/v1/launch/${encodeURIComponent(id)}`); } catch { return h("div", { class: "empty" }, "That premiere doesn't exist."); }
      const skew = (l.serverNow || Date.now()) - Date.now();
      const clock = h("div", { style: "font-size:2.4em;font-weight:800;font-variant-numeric:tabular-nums" });
      const box = h("div", { class: "card", style: "text-align:center" }, h("div", { class: "meta" }, l.premiere ? "Premiere" : "Scheduled"),
        h("div", { class: "title" }, l.title || "Untitled"), l.author ? h("a", { href: `#/u/${encodeURIComponent(l.author.username)}` }, `@${l.author.username}`) : "", clock,
        h("div", { class: "meta" }, new Date(l.at).toLocaleString()));
      const tick = () => {
        const left = l.at - (Date.now() + skew);
        if (left <= 0) { clock.textContent = "Live now"; setTimeout(() => { location.hash = `#/p/${encodeURIComponent(id)}`; }, 1500); return; }
        const s = Math.floor(left / 1000), d = Math.floor(s / 86400), hh = Math.floor(s % 86400 / 3600), m = Math.floor(s % 3600 / 60), x = s % 60;
        clock.textContent = d ? `${d}d ${hh}h ${m}m` : `${hh}:${String(m).padStart(2, "0")}:${String(x).padStart(2, "0")}`;
        if (location.hash.startsWith("#/premiere/")) setTimeout(tick, 1000);
      };
      if (l.state === "live") { location.hash = `#/p/${encodeURIComponent(id)}`; return h("div", { class: "empty" }, "Live now…"); }
      tick();
      return box;
    },
  };
}
