// CVN-Krmzy — Nuvio provider
// Searches the user-specified Krmzy website and extracts publicly exposed media URLs.
// Requires Nuvio to expose TMDB_API_KEY globally for title lookup.

var BASE_URL = "https://krmzy.net";
var UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124.0 Safari/537.36";
// Public TMDB application key fallback; override with Nuvio global key when available.
var DEFAULT_TMDB_KEY = "8265bd1679663a7ea12ac168da84d2e8";

function requestText(url) {
  return fetch(url, {
    method: "GET",
    headers: {
      "User-Agent": UA,
      "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8"
    }
  }).then(function (r) {
    if (!r || !r.ok) throw new Error("HTTP request failed");
    return r.text();
  });
}

function decodeText(s) {
  return String(s || "")
    .replace(/&amp;/g, "&").replace(/&#038;/g, "&")
    .replace(/&quot;/g, '"').replace(/&#039;/g, "'")
    .replace(/&#8217;/g, "'").replace(/&nbsp;/g, " ");
}

function stripTags(s) {
  return decodeText(String(s || "").replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ").replace(/<[^>]+>/g, " "))
    .replace(/\s+/g, " ").trim();
}

function absoluteUrl(href, base) {
  if (!href) return "";
  href = decodeText(href.trim());
  if (/^(javascript:|mailto:|#)/i.test(href)) return "";
  if (/^https?:\/\//i.test(href)) return href;
  if (href.indexOf("//") === 0) return "https:" + href;
  if (href.charAt(0) === "/") return BASE_URL + href;
  return base.replace(/\/$/, "") + "/" + href;
}

function normalize(s) {
  return stripTags(s).toLowerCase()
    .replace(/[ًٌٍَُِّْـ]/g, "")
    .replace(/[أإآٱ]/g, "ا").replace(/ى/g, "ي")
    .replace(/(?:المسلسل|مسلسل|الحلقة|الحلقه|حلقة|حلقه|episode|ep)\\s*\\d*/gi, " ")
    .replace(/[^a-z0-9\\u0600-\\u06ff]+/g, " ").trim();
}

function getTitles(tmdbId, mediaType) {
  var key = (typeof globalThis !== "undefined" && globalThis.TMDB_API_KEY)
    ? String(globalThis.TMDB_API_KEY) : DEFAULT_TMDB_KEY;
  if (!key) return Promise.resolve([]);
  var id = String(tmdbId || "").replace(/^(tmdb:|tv:|movie:)/i, "").split(":")[0];
  if (!/^\d+$/.test(id)) return Promise.resolve([]);
  var type = mediaType === "movie" ? "movie" : "tv";
  var url = "https://api.themoviedb.org/3/" + type + "/" + encodeURIComponent(id) +
    "?api_key=" + encodeURIComponent(key) + "&append_to_response=translations";
  return fetch(url, { headers: { "Accept": "application/json" } })
    .then(function (r) { if (!r.ok) throw new Error("TMDB lookup failed"); return r.json(); })
    .then(function (d) {
      var out = [];
      [d.title, d.name, d.original_title, d.original_name].forEach(function (v) {
        if (v && out.indexOf(v) < 0) out.push(v);
      });
      var trs = d.translations && d.translations.translations ? d.translations.translations : [];
      trs.forEach(function (tr) {
        if (tr.iso_639_1 === "ar" && tr.data) {
          var v = tr.data.title || tr.data.name;
          if (v && out.indexOf(v) < 0) out.push(v);
        }
      });
      return out;
    }).catch(function () { return []; });
}

function searchResult(html, titles) {
  var re = /<a\b[^>]*href=["']([^"'#]+)["'][^>]*>([\s\S]*?)<\/a>/gi;
  var m, candidates = [], best = null, bestScore = 0;
  var wanted = titles.map(normalize).filter(Boolean);
  while ((m = re.exec(html)) !== null) {
    var href = absoluteUrl(m[1], BASE_URL);
    if (!href || href.indexOf("krmzy.net") < 0) continue;
    if (/\/(category|tag|page|author|wp-content|wp-admin)\b/i.test(href)) continue;
    var label = normalize(m[2]);
    var hay = normalize(label + " " + href);
    if (candidates.indexOf(href) < 0) candidates.push(href);
    for (var i = 0; i < wanted.length; i++) {
      var score = label === wanted[i] ? 3000 : (hay.indexOf(wanted[i]) >= 0 ? 1000 + wanted[i].length : 0);
      if (score > bestScore) { bestScore = score; best = href; }
    }
  }
  return best || (candidates.length === 1 ? candidates[0] : null);
}

function findEpisode(html, season, episode) {
  var target = parseInt(episode, 10);
  var wantedSeason = parseInt(season, 10) || 1;
  if (!target) return null;
  var re = /<a\b[^>]*href=["']([^"'#]+)["'][^>]*>([\s\S]*?)<\/a>/gi;
  var m, fallback = null;
  while ((m = re.exec(html)) !== null) {
    var href = absoluteUrl(m[1], BASE_URL);
    if (!href || href.indexOf("krmzy.net") < 0) continue;
    var label = stripTags(m[2]) + " " + href;
    var ep = label.match(/(?:الحلقة|الحلقه|حلقة|حلقه|episode|ep)[\s._:-]*0*(\d{1,4})(?!\d)/i);
    if (!ep || parseInt(ep[1], 10) !== target) continue;
    var sm = label.match(/(?:الموسم|موسم|season|s)[\s._:-]*0*(\d{1,2})/i);
    var sn = sm ? parseInt(sm[1], 10) : 1;
    if (sn === wantedSeason) return href;
    if (!fallback) fallback = href;
  }
  return fallback;
}

function extractUrls(html, pageUrl) {
  var out = [], seen = {};
  var normalized = String(html || "").replace(/\\\//g, "/");
  var patterns = [
    /<(?:source|video)[^>]+src=["']([^"']+)["']/gi,
    /(?:file|src|url)\s*[:=]\s*["'](https?:\/\/[^"']+)["']/gi,
    /https?:\/\/[^\s"'<>\\]+\.(?:m3u8|mp4)(?:\?[^\s"'<>\\]*)?/gi
  ];
  patterns.forEach(function (re, idx) {
    var m;
    while ((m = re.exec(normalized)) !== null) {
      var u = absoluteUrl(m[1] || m[0], pageUrl);
      if (!u || !/\.(m3u8|mp4)(?:$|\?)/i.test(u) || seen[u]) continue;
      seen[u] = true;
      out.push({
        name: "CVN-Krmzy",
        title: /1080/i.test(u) ? "1080p" : (/720/i.test(u) ? "720p" : "HD"),
        url: u,
        quality: /1080/i.test(u) ? "1080p" : (/720/i.test(u) ? "720p" : "HD"),
        headers: { "Referer": pageUrl, "User-Agent": UA }
      });
    }
  });
  return out;
}

function getStreams(tmdbId, mediaType, season, episode) {
  var isTv = ["tv", "series", "show"].indexOf(String(mediaType || "").toLowerCase()) >= 0;
  return getTitles(tmdbId, mediaType).then(function (titles) {
    if (!titles.length) return [];
    var idx = 0;
    function tryTitle() {
      if (idx >= titles.length) return [];
      var searchUrl = BASE_URL + "/?s=" + encodeURIComponent(titles[idx++]);
      return requestText(searchUrl).then(function (html) {
        var itemUrl = searchResult(html, titles);
        if (!itemUrl) return tryTitle();
        return requestText(itemUrl).then(function (detailHtml) {
          if (isTv && episode != null) {
            var epUrl = findEpisode(detailHtml, season, episode);
            if (!epUrl) return [];
            return requestText(epUrl).then(function (epHtml) {
              return extractUrls(epHtml, epUrl);
            });
          }
          return extractUrls(detailHtml, itemUrl);
        });
      }).catch(function () { return tryTitle(); });
    }
    return tryTitle();
  }).catch(function (e) {
    console.log("[CVN-Krmzy] " + (e && e.message ? e.message : e));
    return [];
  });
}

if (typeof globalThis !== "undefined") globalThis.getStreams = getStreams;
if (typeof module !== "undefined") module.exports = { getStreams: getStreams };
