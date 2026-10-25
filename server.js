const express = require("express");

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
    const res = await fetch(`https://1.1.1.1/dns-query?name=${encodeURIComponent(host)}&type=A`, {
      headers: { "Accept": "application/dns-json" }
    });
    if (res.ok) {
      const json = await res.json();
      const a = json && json.Answer && json.Answer.find(x => x.type === 1);
      if (a && a.data) {
        _dns.set(host, a.data);
        return a.data;
      }
    }
  } catch (_) {}
  return host;
}

async function transformUrl(rawUrl) {
  try {
    const u = new URL(rawUrl);
    const ip = await resolveIp(u.hostname);
    if (ip && ip !== u.hostname) {
      u.hostname = ip;
      return u.toString();
    }
  } catch (_) {}
  return rawUrl;
}

async function getSig() {
  const now = Date.now();
  if (_sig && now < _exp) return _sig;

  const endpoints = [
    "https://www.vypn.net/api/app/ping",
    "https://cache.vypn.net/api/app/ping",
    "https://www.vavoo.tv/api/app/ping"
  ];

  const payload = {
    reason: "app-focus",
    locale: "en",
    theme: "dark",
    metadata: {
      device: { type: "desktop", uniqueId: "3a8c7b6d-5e4f-4a3b-2c1d-0e9f8a7b6c5d" },
      os: { name: "win32", version: "Windows 10 Pro", abis: ["x64"], host: "Lenovo" },
      app: { platform: "electron" },
      version: { package: "net.vypn.app", binary: "3.1.0", js: "3.1.0" }
    },
    appFocusTime: 0,
    playerActive: false,
    playDuration: 0,
    devMode: false,
    hasAddon: true,
    castConnected: false,
    package: "net.vypn.app",
    version: "3.1.0",
    process: "app",
    firstAppStart: now,
    lastAppStart: now,
    ipLocation: null,
    adblockEnabled: true,
    proxy: { supported: ["ss"], engine: "Mu", enabled: false, autoServer: true },
    iap: { supported: false }
  };

  for (const ep of endpoints) {
    try {
      const c = new AbortController();
      const t = setTimeout(() => c.abort(), 4000);
      const res = await fetch(ep, {
        method: "POST",
        headers: { "User-Agent": UA, "Content-Type": "application/json; charset=utf-8" },
        body: JSON.stringify(payload),
        signal: c.signal
      });
      clearTimeout(t);

      if (res.ok) {
        const d = await res.json();
        const s = d.sig || d.addonSig || d.signature || d.token;
        if (s) {
          _sig = s;
          _exp = now + 900000;
          return s;
        }
      }
    } catch (_) {}
  }
  return _sig;
}

function sanitize(str) {
  if (!str) return "Kanal";
  return str.replace(/\s*(\.[a-zA-Z0-9]{1,3})+$/g, "").replace(/\s*\((?:\d+|[A-Za-z]{1,3})\)\s*$/g, "").trim();
}

function detectCategory(name, baseGroup) {
  const n = (name || "").toUpperCase();

  if (baseGroup === "Turkey") {
    if (/SPOR|BEIN|SSPORT|TIVIBU SPOR|SMART SPOR|EUROSPORT|F1|NBA|GOL|MATCH|FIGHT/i.test(n)) {
      return "TR: SPOR";
    }
    if (/SINEMA|CINEMA|FILM|ACTION|COMEDY|FAMILY|MOVIE|DIZI|PREMIERE/i.test(n)) {
      return "TR: SİNEMA & DİZİ";
    }
    if (/BELGESEL|DOCU|NAT GEO|DISCOVERY|ANIMAL|HISTORY|BBC EARTH/i.test(n)) {
      return "TR: BELGESEL";
    }
    if (/COCUK|ÇOCUK|CARTOON|NICK|DISNEY|BOOMERANG|MINIKA|TRT COCUK/i.test(n)) {
      return "TR: ÇOCUK";
    }
    if (/HABER|NEWS|CNN|NTV|HABERTURK|A HABER|TRT HABER|TELE1|HALK TV|SOZCU/i.test(n)) {
      return "TR: HABER";
    }
    if (/MUZIK|MÜZİK|MUSIC|KRAL|POWERTURK|NUMBER ONE|DREAM/i.test(n)) {
      return "TR: MÜZİK";
    }
    if (/ATV|KANAL D|SHOW|STAR|TRT 1|NOW|TV8|BEYAZ|KANAL 7/i.test(n)) {
      return "TR: ULUSAL";
    }
    return "TR: GENEL";
  }

  if (baseGroup === "Germany") {
    if (/SPORT|SKY SPORT|DAZN|BUNDESLIGA|EUROSPORT/i.test(n)) {
      return "DE: SPORT";
    }
    if (/CINEMA|FILM|SKY CINEMA|ACTION/i.test(n)) {
      return "DE: CINEMA";
    }
    return "DE: ALLGEMEIN";
  }

  return baseGroup;
}

async function collect(group, sig) {
  const items = [];
  let cursor = 0;

  for (let page = 0; page < 15; page++) {
    const body = {
      language: "de",
      region: "AT",
      catalogId: "iptv",
      id: "iptv",
      adult: false,
      search: "",
      sort: "name",
      filter: { group },
      cursor,
      clientVersion: VER
    };

    const headers = {
      "User-Agent": UA,
      "Accept": "application/json",
      "Accept-Language": "de",
      "Content-Type": "application/json; charset=utf-8"
    };
    if (sig) headers["mediahubmx-signature"] = sig;

    try {
      const c = new AbortController();
      const t = setTimeout(() => c.abort(), 6000);
      const res = await fetch("https://vavoo.to/mediahubmx-catalog.json", {
        method: "POST",
        headers,
        body: JSON.stringify(body),
        signal: c.signal
      });
      clearTimeout(t);

      if (!res.ok) break;
      const json = await res.json();
      const batch = json.items || [];
      if (!batch.length) break;

      for (const itm of batch) {
        const title = sanitize(itm.name || "");
        let id = (itm.ids && itm.ids.id) ? itm.ids.id : (itm.id || "");
        let url = itm.url || itm.play || "";

        if (!url && id) url = `https://vavoo.to/vavoo-iptv/play/${id}`;
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
    return d.url || (d.data && d.data.url) || (d.js && d.js.url) || null;
  } catch (_) {
    return null;
  }
}

app.get(["/play", "/play/*"], async (req, res) => {
  let target = req.query.url;
  if (!target && req.path.startsWith("/play/")) {
    const part = req.path.replace("/play/", "").trim();
    if (part) target = part.startsWith("http") ? part : `https://vavoo.to/vavoo-iptv/play/${part}`;
  }

  if (!target) return res.status(400).send("Bad Request");

  const clientIp = req.headers["x-forwarded-for"]?.split(",")[0]?.trim() || req.socket.remoteAddress;
  const sig = await getSig();
  const resolved = await resolveStream(target, sig, clientIp);

  if (!resolved) return res.status(502).send("Service Unavailable");

  const dest = await transformUrl(resolved);
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
  return res.redirect(302, dest);
});

app.get(["/", "/playlist.m3u8"], async (req, res) => {
  const host = req.get("host");
  const protocol = req.headers["x-forwarded-proto"] || req.protocol;
  const baseResolver = `${protocol}://${host}/play`;

  const qGroups = req.query.groups;
  const targetGroups = qGroups ? qGroups.split(",").map(x => x.trim()) : GROUPS;

  const sig = await getSig();
  let playlist = [];

  for (const g of targetGroups) {
    const r = await collect(g, sig);
    playlist = playlist.concat(r);
  }

  const lines = [
    "#EXTM3U",
    `#EXT-X-USER-AGENT:${UA}`,
    "#EXT-X-REFERER:https://vavoo.to/",
    "#EXT-X-ORIGIN:https://vavoo.to"
  ];

  for (const it of playlist) {
    const l = it.logo ? ` tvg-logo="${it.logo}"` : "";
    const t = it.tvgId ? ` tvg-id="${it.tvgId}"` : "";
    lines.push(`#EXTINF:-1${t} tvg-name="${it.title}"${l} group-title="${it.group}",${it.title}`);
    lines.push(`${baseResolver}?url=${encodeURIComponent(it.url)}`);
  }

  res.setHeader("Content-Type", "application/vnd.apple.mpegurl; charset=utf-8");
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.send(lines.join("\n") + "\n");
});

app.listen(PORT, () => {
  console.log(`Sunucu aktif: Port ${PORT}`);
});
