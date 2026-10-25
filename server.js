import express from "express";

const app = express();
const PORT = process.env.PORT || 3000;

const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/147.0.0.0 Safari/537.36";
const VER = "3.1.4";
const GROUPS = ["Turkey", "Germany"];

let _sig = null;
let _exp = 0;
const _dns = new Map();

async function resolveIp(host) {
  if (!host || /^(\d{1,3}\.){3}\d{1,3}$/.test(host)) return host;
  if (_dns.has(host)) return _dns.get(host);

  try {
    const res = await fetch(`https://1.1.1.1/dns-query?name=${encodeURIComponent(host)}&type=A`, { headers: { "Accept": "application/dns-json" } }); if (res.ok) { const json = await res.json(); const a = json?.Answer?.find(x => x.type === 1); if (a?.data) { _dns.set(host, a.data); return a.data; } } } catch (_) {} return host; }  async function transformUrl(rawUrl) { try { const u = new URL(rawUrl); const ip = await resolveIp(u.hostname); if (ip && ip !== u.hostname) { u.hostname = ip; return u.toString(); } } catch (_) {} return rawUrl; }  async function getSig() { const now = Date.now(); if (_sig && now < _exp) return _sig;  const endpoints = [ "https://www.vypn.net/api/app/ping", "https://cache.vypn.net/api/app/ping", "https://www.vavoo.tv/api/app/ping" ];  const payload = { reason: "app-focus", locale: "en", theme: "dark", metadata: { device: { type: "desktop", uniqueId: crypto.randomUUID() }, os: { name: "win32", version: "Windows 10 Pro", abis: ["x64"], host: "Lenovo" }, app: { platform: "electron" }, version: { package: "net.vypn.app", binary: "3.1.0", js: "3.1.0" } }, appFocusTime: 0, playerActive: false, playDuration: 0, devMode: false, hasAddon: true, castConnected: false, package: "net.vypn.app", version: "3.1.0", process: "app", firstAppStart: now, lastAppStart: now, ipLocation: null, adblockEnabled: true, proxy: { supported: ["ss"], engine: "Mu", enabled: false, autoServer: true }, iap: { supported: false } };  for (const ep of endpoints) { try { const c = new AbortController(); const t = setTimeout(() => c.abort(), 4000); const res = await fetch(ep, { method: "POST", headers: { "User-Agent": UA, "Content-Type": "application/json; charset=utf-8" }, body: JSON.stringify(payload), signal: c.signal }); clearTimeout(t);  if (res.ok) { const d = await res.json(); const s = d.sig \vert{}\vert{} d.addonSig \vert{}\vert{} d.signature \vert{}\vert{} d.token; if (s) { _sig = s; _exp = now + 900000; return s; } } } catch (_) {} } return _sig; }  function sanitize(str) { if (!str) return "Kanal"; return str.replace(/\s*(\.[a-zA-Z0-9]{1,3})+$/g, "").replace(/\s*\((?:\d+\vert{}[A-Za-z]{1,3})\)\s*$/g, "").trim(); }  // Kanal ismine göre otomatik kategori belirleme function detectCategory(name, baseGroup) { const n = name.toUpperCase();  if (baseGroup === "Turkey") { if (/SPOR\vert{}BEIN\vert{}SSPORT\vert{}TIVIBU SPOR\vert{}SMART SPOR\vert{}EUROSPORT\vert{}F1\vert{}NBA\vert{}GOL\vert{}MATCH\vert{}FIGHT/i.test(n)) { return "TR: SPOR"; } if (/SINEMA\vert{}CINEMA\vert{}FILM\vert{}ACTION\vert{}COMEDY\vert{}FAMILY\vert{}MOVIE\vert{}DIZI\vert{}PREMIERE/i.test(n)) { return "TR: SİNEMA & DİZİ"; } if (/BELGESEL\vert{}DOCU\vert{}NAT GEO\vert{}DISCOVERY\vert{}ANIMAL\vert{}HISTORY\vert{}BBC EARTH/i.test(n)) { return "TR: BELGESEL"; } if (/COCUK\vert{}ÇOCUK\vert{}CARTOON\vert{}NICK\vert{}DISNEY\vert{}BOOMERANG\vert{}MINIKA\vert{}TRT COCUK/i.test(n)) { return "TR: ÇOCUK"; } if (/HABER\vert{}NEWS\vert{}CNN\vert{}NTV\vert{}HABERTURK\vert{}A HABER\vert{}TRT HABER\vert{}TELE1\vert{}HALK TV\vert{}SOZCU/i.test(n)) { return "TR: HABER"; } if (/MUZIK\vert{}MÜZİK\vert{}MUSIC\vert{}KRAL\vert{}POWERTURK\vert{}NUMBER ONE\vert{}DREAM/i.test(n)) { return "TR: MÜZİK"; } if (/ATV\vert{}KANAL D\vert{}SHOW\vert{}STAR\vert{}TRT 1\vert{}NOW\vert{}TV8\vert{}BEYAZ\vert{}KANAL 7/i.test(n)) { return "TR: ULUSAL"; } return "TR: GENEL"; }  if (baseGroup === "Germany") { if (/SPORT\vert{}SKY SPORT\vert{}DAZN\vert{}BUNDESLIGA\vert{}EUROSPORT/i.test(n)) { return "DE: SPORT"; } if (/CINEMA\vert{}FILM\vert{}SKY CINEMA\vert{}ACTION/i.test(n)) { return "DE: CINEMA"; } return "DE: ALLGEMEIN"; }  return baseGroup; }  async function collect(group, sig) { const items = []; let cursor = 0;  for (let page = 0; page < 15; page++) { const body = { language: "de", region: "AT", catalogId: "iptv", id: "iptv", adult: false, search: "", sort: "name", filter: { group }, cursor, clientVersion: VER };  const headers = { "User-Agent": UA, "Accept": "application/json", "Accept-Language": "de", "Content-Type": "application/json; charset=utf-8" }; if (sig) headers["mediahubmx-signature"] = sig;  try { const c = new AbortController(); const t = setTimeout(() => c.abort(), 6000); const res = await fetch("https://vavoo.to/mediahubmx-catalog.json", { method: "POST", headers, body: JSON.stringify(body), signal: c.signal }); clearTimeout(t);  if (!res.ok) break; const json = await res.json(); const batch = json.items \vert{}\vert{} []; if (!batch.length) break;  for (const itm of batch) { const title = sanitize(itm.name \vert{}\vert{} ""); let id = (itm.ids && itm.ids.id) ? itm.ids.id : (itm.id \vert{}\vert{} ""); let url = itm.url \vert{}\vert{} itm.play \vert{}\vert{} "";  if (!url && id) url = `https://vavoo.to/vavoo-iptv/play/${id}`;
        else if (url && url.includes("/play/") && !url.includes("/vavoo-iptv/")) {
          url = url.replace(/https?:\/\/[^\/]+\/play\//, "https://vavoo.to/vavoo-iptv/play/");
        }

        if (!url) continue;

        const imgs = itm.images || {};
        const logo = imgs.logo || imgs.poster || itm.logo || itm.poster || "";
        const tvgId = (itm.ids && itm.ids.tvg) ? itm.ids.tvg : "";
        const category = detectCategory(title, group);

        items.push({ title, url, group: category, logo, tvgId });
      }

      cursor = json.nextCursor;
      if (!cursor) break;
    } catch (_) {
      break;
    }
  }

  return items;
}

async function resolveStream(target, sig, clientIp) {
  const api = target.includes("kool.to")
    ? "https://kool.to/mediahubmx-resolve.json"
    : "https://vavoo.to/mediahubmx-resolve.json";

  const body = { language: "de", region: "AT", url: target, clientVersion: VER };
  const headers = {
    "User-Agent": UA,
    "Referer": "https://vavoo.to/",
    "Origin": "https://vavoo.to",
    "Content-Type": "application/json; charset=utf-8"
  };

  if (sig) headers["mediahubmx-signature"] = sig;
  if (clientIp) {
    headers["X-Forwarded-For"] = clientIp;
    headers["X-Real-IP"] = clientIp;
  }

  try {
    const c = new AbortController();
    const t = setTimeout(() => c.abort(), 6000);
    const res = await fetch(api, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
      signal: c.signal
    });
    clearTimeout(t);

    if (!res.ok) return null;
    const d = await res.json();
    if (Array.isArray(d) && d.length > 0 && d[0].url) return d[0].url;
    return d.url || d.data?.url || d.js?.url || null;
  } catch (_) {
    return null;
  }
}

// 1. Kanal Çözücü Yönlendirme Endpoint'i
app.get(["/play", "/play/*"], async (req, res) => {
  let target = req.query.url;
  if (!target && req.path.startsWith("/play/")) {
    const part = req.path.replace("/play/", "").trim();
    if (part) target = part.startsWith("http") ? part : `
