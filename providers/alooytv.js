"use strict";

/**
 * CVN-AlooyTV — Arabic-subtitled source adapter for Nuvio.
 * Searches the site's Turkish catalog, selects the requested episode,
 * and returns only direct media URLs actually exposed by that episode page.
 */

var PROVIDER = "CVN-AlooyTV";
var BASES = [
  "https://ac.alooytv16.com",
  "https://c.alooytv16.com",
  "https://a.alooytv16.com",
  "https://fa.alooytv16.xyz",
  "https://h.alooytv16.com"
];
var HUB = "https://fitnur.com/alooytv";
var TMDB_KEY = "8265bd1679663a7ea12ac168da84d2e8";
var UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/131.0 Safari/537.36";

function textOf(s) {
  return String(s || "")
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, " ")
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;|&#160;/gi, " ")
    .replace(/&amp;/gi, "&").replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&#(\d+);/g, function(_, n){return String.fromCharCode(Number(n));})
    .replace(/&#x([\da-f]+);/gi, function(_, n){return String.fromCharCode(parseInt(n,16));})
    .replace(/\s+/g, " ").trim();
}
function attr(tag, name) {
  var re = new RegExp("\\b" + name + "\\s*=\\s*(?:\"([^\"]*)\"|'([^']*)'|([^\\s>]+))","i");
  var m = String(tag || "").match(re);
  return m ? textOf(m[1] || m[2] || m[3] || "").replace(/\s+/g," ") : "";
}
function abs(url, base) {
  try { return new URL(url, base).href; } catch (_) { return ""; }
}
function norm(s) {
  return textOf(s).toLowerCase()
    .replace(/[\u064b-\u065f\u0670ـ]/g,"")
    .replace(/[أإآٱ]/g,"ا").replace(/ى/g,"ي")
    .replace(/(?:مترجم(?:ة)?|مدبلج(?:ة)?|بالترجمة|ترجمة|دبلجة|الحلقة|الحلقه|حلقة|حلقه|episode|ep)/gi," ")
    .replace(/[^a-z0-9\u0600-\u06ff]+/g," ").trim();
}
function isDubbed(s) {
  return /(?:مدبلج(?:ة|ين)?|مدبلج\s*(?:للعربية|بالعربية|مصري|سوري|فصحى)|الدبلجة|دبلجة|باللهجة\s*(?:السورية|المصرية)|اللهجة\s*(?:السورية|المصرية)|صوت\s*(?:عربي|سوري|مصري)|arabic\s*dub|syrian\s*dub|egyptian\s*dub|dubbed)/i.test(textOf(s));
}
function isTranslated(s) {
  return /(?:مترجم(?:ة)?|مترجم\s*(?:للعربية|بالعربية)|بالترجمة\s*العربية|ترجمة\s*عربية|ترجمة\s*عربي|subbed|arabic\s*subtitle|with\s*arabic\s*subtitles)/i.test(textOf(s));
}
function score(a,b) {
  a=norm(a); b=norm(b);
  if(!a || !b) return 0;
  if(a===b) return 100;
  if(a.indexOf(b)>=0 || b.indexOf(a)>=0) return 85;
  var aw=a.split(" "), bw=b.split(" "), hit=0;
  for(var i=0;i<aw.length;i++) if(bw.indexOf(aw[i])>=0) hit++;
  return Math.round(hit/Math.max(aw.length,bw.length)*75);
}
function fetchText(url, options) {
  var opts=options||{};
  return fetch(url,{
    method:opts.method||"GET",
    headers:Object.assign({
      "User-Agent":UA,
      "Accept":"text/html,application/xhtml+xml,application/json,*/*",
      "Accept-Language":"ar,en-US;q=0.8,en;q=0.7"
    },opts.headers||{}),
    body:opts.body
  }).then(function(r){
    if(!r || !r.ok) throw new Error("HTTP "+(r?r.status:"no response"));
    return r.text().then(function(t){return {html:t,url:r.url||url};});
  });
}
function discoverBase() {
  var i=0;
  function next(){
    if(i>=BASES.length) return fetchText(HUB).then(function(p){
      var links=p.html.match(/https?:\\?\/\\?\/[a-z0-9.-]*alooytv16\\?\.[a-z]+[^"'\\s<>]*/gi)||[];
      for(var j=0;j<links.length;j++){var u=abs(links[j].replace(/\\\//g,"/"),p.url);if(u)return new URL(u).origin;}
      throw new Error("No active Alooy domain found");
    });
    var base=BASES[i++];
    return fetchText(base+"/tv-series.html").then(function(p){
      if(/movie-container|latest-movie-img-container|\.movie-title/i.test(p.html)) return new URL(p.url).origin;
      throw new Error("No catalog markers");
    }).catch(next);
  }
  return next();
}
function tmdbTitles(id,type) {
  var t=(String(type||"tv").toLowerCase()==="movie"?"movie":"tv");
  return fetch("https://api.themoviedb.org/3/"+t+"/"+encodeURIComponent(String(id))+"?api_key="+TMDB_KEY+"&append_to_response=translations,alternative_titles",{
    headers:{"Accept":"application/json","User-Agent":UA}
  }).then(function(r){if(!r.ok)throw new Error("TMDB "+r.status);return r.json();})
  .then(function(d){
    var a=[], add=function(v){if(v && String(v).trim() && a.indexOf(String(v).trim())<0)a.push(String(v).trim());};
    add(t==="tv"?d.name:d.title);
    add(t==="tv"?d.original_name:d.original_title);
    if(d.translations && d.translations.translations) d.translations.translations.forEach(function(x){
      if(x && x.iso_639_1==="ar" && x.data) add(x.data.name||x.data.title);
    });
    var alt=d.alternative_titles;
    if(alt){(alt.results||alt.titles||[]).forEach(function(x){add(x.title||x.name);});}
    return a;
  });
}
function anchors(html, base) {
  var re=/<a\b[^>]*>[\s\S]*?<\/a>/gi, m, out=[];
  while((m=re.exec(html))!==null){
    var tag=(m[0].match(/^<a\b[^>]*>/i)||[""])[0];
    var href=attr(tag,"href");
    var title=attr(tag,"title")||textOf(m[0]);
    var url=abs(href,base);
    if(url && /\/watch\//i.test(url) && title) {
      var context=html.slice(Math.max(0,m.index-450),Math.min(html.length,m.index+m[0].length+450));
      out.push({url:url,title:title,raw:m[0],context:context});
    }
  }
  return out;
}
function findSeries(html,base,titles) {
  var links=anchors(html,base), translated=null, translatedScore=0;
  links.forEach(function(x){
    // Never fall back to an unlabelled result: it may be the dubbed edition.
    var evidence=x.title+" "+x.raw+" "+x.context;
    if(isDubbed(evidence) || !isTranslated(evidence)) return;
    var best=0;
    for(var i=0;i<titles.length;i++) best=Math.max(best,score(x.title,titles[i]));
    if(best<42) return;
    if(best>translatedScore){translated=x;translatedScore=best;}
  });
  return translated;
}
function episodeLinks(html,base,wanted) {
  var links=anchors(html,base), out=[], seen={};
  links.forEach(function(x){
    var tag=(x.raw.match(/^<a\b[^>]*>/i)||[""])[0];
    var cls=attr(tag,"class");
    var n=null, m=x.title.match(/(?:ep(?:isode)?\s*#?|الحلقة|حلقة|الحلقه)\s*[-:#]?\s*(\d+)/i);
    if(m)n=Number(m[1]);
    if(n===null && /btn-ep/i.test(cls)){m=x.title.match(/\d+/);if(m)n=Number(m[0]);}
    if(n===wanted && !seen[x.url]){seen[x.url]=true;out.push(x.url);}
  });
  return out;
}
function extractMedia(html, pageUrl) {
  var found=[], seen={};
  function add(raw){
    var u=abs(String(raw||"").replace(/\\\//g,"/").replace(/&amp;/g,"&"),pageUrl);
    if(!u || !/^https?:/i.test(u) || seen[u]) return;
    if(!/\.(?:mp4|m3u8|webm)(?:[?#]|$)/i.test(u)) return;
    seen[u]=true;found.push(u);
  }
  var re=/(?:src|file|source)\s*[:=]\s*["'](https?:[^"'\s<>]+)["']/gi,m;
  while((m=re.exec(html))!==null)add(m[1]);
  var urls=html.match(/https?:\\?\/\\?\/[^"'\s<>]+?\.(?:mp4|m3u8|webm)(?:\?[^"'\s<>]*)?/gi)||[];
  urls.forEach(add);
  return found;
}
function getStreams(tmdbId, mediaType, season, episode) {
  if(!tmdbId || !["tv","series","show","movie"].includes(String(mediaType||"").toLowerCase())) return Promise.resolve([]);
  var isMovie=String(mediaType).toLowerCase()==="movie";
  return Promise.all([discoverBase(),tmdbTitles(tmdbId,mediaType)]).then(function(info){
    var base=info[0], titles=info[1], idx=0;
    function searchNext(){
      if(idx>=titles.length) return Promise.resolve([]);
      var title=titles[idx++];
      return fetchText(base+"/search?q="+encodeURIComponent(title)).then(function(p){
        var series=findSeries(p.html,p.url||base,titles);
        if(!series) return searchNext();
        return fetchText(series.url).then(function(sp){
          if(isDubbed(sp.html) || !isTranslated(sp.html)) return searchNext();
          if(isMovie) return [series.url];
          var eps=episodeLinks(sp.html,sp.url||series.url,Number(episode));
          if(!eps.length) return [];
          return Promise.resolve(eps);
        }).then(function(pages){
          if(!pages.length) return searchNext();
          var pidx=0, streams=[];
          function nextEpisode(){
            if(pidx>=pages.length) return Promise.resolve(streams);
            var epUrl=pages[pidx++];
            return fetchText(epUrl).then(function(ep){
              // Require positive Arabic-subtitle evidence on the episode itself.
              if(isDubbed(ep.html) || !isTranslated(ep.html)) return nextEpisode();
              var media=extractMedia(ep.html,ep.url||epUrl);
              media.forEach(function(u){
                streams.push({
                  name:PROVIDER+" - AlooyTV",
                  title:"AlooyTV | "+(u.match(/\.m3u8/i)?"HLS":"MP4"),
                  url:u,quality:"auto",language:"tr",
                  type:u.match(/\.m3u8/i)?"hls":"mp4",
                  headers:{"User-Agent":UA,"Referer":ep.url||epUrl},
                  subtitles:[]
                });
              });
              return nextEpisode();
            }).catch(function(){return nextEpisode();});
          }
          return nextEpisode();
        });
      }).catch(function(){return searchNext();});
    }
    return searchNext();
  }).catch(function(e){
    console.log("[AlooyTV] "+(e&&e.message?e.message:e));
    return [];
  });
}
module.exports={getStreams:getStreams};
