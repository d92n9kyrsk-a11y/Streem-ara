"use strict";

/**
 * CVN-SITE — Arabic source adapter for Nuvio.
 * Searches the site's own catalog, validates the requested episode, then
 * extracts direct HLS/MP4 URLs exposed by that episode's player page.
 */
var SITE_NAME="ShoofLive";
var BASE_URL="https://d5.shooflive.sbs";
var PROVIDER="CVN-"+SITE_NAME;
var TMDB_KEY="8265bd1679663a7ea12ac168da84d2e8";
var UA="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/131.0 Safari/537.36";

function decode(s){
 return String(s||"").replace(/&amp;/gi,"&").replace(/&quot;/gi,'"').replace(/&#0*39;|&apos;/gi,"'")
 .replace(/&#x([0-9a-f]+);/gi,function(_,n){return String.fromCharCode(parseInt(n,16));})
 .replace(/&#(\d+);/g,function(_,n){return String.fromCharCode(Number(n));});
}
function strip(s){
 return decode(String(s||"").replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi," ")
 .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi," ").replace(/<[^>]+>/g," ")).replace(/\s+/g," ").trim();
}
function attr(tag,key){
 var re=new RegExp("\\b"+key+"\\s*=\\s*(?:\"([^\"]*)\"|'([^']*)'|([^\\s>]+))","i"),m=String(tag||"").match(re);
 return m?decode(m[1]||m[2]||m[3]||""):"";
}
function absolute(u,b){try{return new URL(decode(u),b).href;}catch(_){return "";}}
function norm(s){
 return strip(s).toLowerCase().replace(/[\u064b-\u065f\u0670ـ]/g,"").replace(/[أإآٱ]/g,"ا").replace(/ى/g,"ي")
 .replace(/(?:مدبلج|مترجم|الحلقة|الحلقه|حلقة|episode|ep)\s*\d*/gi," ").replace(/[^a-z0-9\u0600-\u06ff]+/g," ").trim();
}
function score(a,b){
 a=norm(a);b=norm(b);if(!a||!b)return 0;if(a===b)return 100;if(a.indexOf(b)>=0||b.indexOf(a)>=0)return 88;
 var aw=a.split(" "),bw=b.split(" "),n=0;aw.forEach(function(w){if(bw.indexOf(w)>=0)n++;});
 return Math.round(n/Math.max(aw.length,bw.length)*80);
}
function fetchPage(url,referer){
 return fetch(url,{headers:{"User-Agent":UA,"Accept":"text/html,application/xhtml+xml,application/json,*/*","Accept-Language":"ar,en;q=0.8", "Referer":referer||BASE_URL+"/"}})
 .then(function(r){if(!r||!r.ok)throw new Error("HTTP "+(r?r.status:"no response"));return r.text().then(function(html){return {html:html,url:r.url||url};});});
}
function getTitles(id,type){
 var t=String(type||"tv").toLowerCase()==="movie"?"movie":"tv";
 return fetch("https://api.themoviedb.org/3/"+t+"/"+encodeURIComponent(String(id))+"?api_key="+TMDB_KEY+"&append_to_response=translations,alternative_titles",{headers:{"Accept":"application/json","User-Agent":UA}})
 .then(function(r){if(!r.ok)throw new Error("TMDB "+r.status);return r.json();})
 .then(function(d){
  var out=[];function add(v){if(v&&String(v).trim()&&out.indexOf(String(v).trim())<0)out.push(String(v).trim());}
  add(t==="tv"?d.name:d.title);add(t==="tv"?d.original_name:d.original_title);
  if(d.translations&&d.translations.translations)d.translations.translations.forEach(function(x){if(x&&x.iso_639_1==="ar"&&x.data)add(x.data.name||x.data.title);});
  var a=d.alternative_titles;if(a)(a.results||a.titles||[]).forEach(function(x){add(x.title||x.name);});
  return out;
 });
}
function getAnchors(html,base){
 var re=/<a\b[^>]*>[\s\S]*?<\/a>/gi,m,out=[];
 while((m=re.exec(html))!==null){
  var tag=(m[0].match(/^<a\b[^>]*>/i)||[""])[0],href=attr(tag,"href"),url=absolute(href,base),title=attr(tag,"title")||strip(m[0]);
  if(url&&title)out.push({url:url,title:title,html:m[0],tag:tag});
 }
 return out;
}
function episodeNumber(s){
 var m=String(s||"").match(/(?:الحلقة|الحلقه|حلقة|episode|ep)\s*[-:#]?\s*(\d+)/i);
 if(!m)m=String(s||"").match(/(?:^|[-_\/])(?:episode-|ep-)?(\d+)(?:\D|$)/i);
 return m?Number(m[1]):null;
}
function extractPacked(html){
 var m=String(html||"").match(/eval\(function\(p,a,c,k,e,d\)\{[\s\S]*?\}\((['"])([\s\S]*?)\1\s*,\s*(\d+)\s*,\s*(\d+)\s*,\s*(['"])([\s\S]*?)\5\.split\(['"]\|['"]\)/);
 if(!m)return [];
 var p=m[2],radix=Math.min(Number(m[3])||62,62),count=Number(m[4])||0,dict=m[6].split("|"),chars="0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ";
 function base(n,r){if(!n)return "0";var z="";while(n>0){z=chars[n%r]+z;n=Math.floor(n/r);}return z;}
 for(var i=0;i<count;i++){var k=base(i,radix);if(dict[i])p=p.replace(new RegExp("\\b"+k+"\\b","g"),dict[i]);}
 return p.match(/https?:\/\/[^\s"'<>]+?\.(?:m3u8|mp4|webm)(?:\?[^\s"'<>]*)?/gi)||[];
}
function mediaUrls(html,pageUrl){
 var out=[],seen={};function add(v){var u=absolute(String(v||"").replace(/\\\//g,"/"),pageUrl);if(u&&/^https?:/i.test(u)&&/\.(?:m3u8|mp4|webm)(?:[?#]|$)/i.test(u)&&!seen[u]){seen[u]=1;out.push(u);}}
 var direct=String(html||"").match(/https?:\\?\/\\?\/[^"'\s<>]+?\.(?:m3u8|mp4|webm)(?:\?[^"'\s<>]*)?/gi)||[];
 direct.forEach(add);
 var packed=extractPacked(html);packed.forEach(add);
 var re=/<(?:source|video)[^>]*>/gi,m;while((m=re.exec(html))!==null){add(attr(m[0],"src"));}
 return out;
}
function findEpisodePage(seriesPage,season,episode){
 var links=getAnchors(seriesPage.html,seriesPage.url),out=[],seen={};
 links.forEach(function(a){
  var n=episodeNumber(a.title+" "+a.url),cls=attr(a.tag,"class");
  if(n===Number(episode)&&(/episode|الحلقة|حلقة|ep/i.test(a.title+" "+a.url)||/episode|btn-ep/i.test(cls))&&!seen[a.url]){seen[a.url]=1;out.push(a.url);}
 });
 return out;
}
function extractFromPage(page,depth,seen,streams){
 if(depth>2)return Promise.resolve();
 var urls=mediaUrls(page.html,page.url);
 urls.forEach(function(u){if(!seen[u]){seen[u]=1;streams.push({name:PROVIDER,title:ShoofLive+" | "+(u.match(/\.m3u8/i)?"HLS":"MP4"),url:u,quality:"auto",language:"ar",type:u.match(/\.m3u8/i)?"hls":"mp4",headers:{"User-Agent":UA,"Referer":page.url}});}});
 if(streams.length>=8)return Promise.resolve();
 var frames=page.html.match(/<iframe\b[^>]*>/gi)||[],tasks=[];
 frames.slice(0,5).forEach(function(tag){
  var src=attr(tag,"src"),u=absolute(src,page.url);if(!u||seen["frame:"+u])return;seen["frame:"+u]=1;
  tasks.push(fetchPage(u,page.url).then(function(p){return extractFromPage(p,depth+1,seen,streams);}).catch(function(){}));
 });
 return Promise.all(tasks);
}
function getStreams(tmdbId,mediaType,season,episode){
 if(!tmdbId||!["tv","series","show","movie"].includes(String(mediaType||"").toLowerCase()))return Promise.resolve([]);
 var isMovie=String(mediaType).toLowerCase()==="movie";
 return getTitles(tmdbId,mediaType).then(function(titles){
  var idx=0;
  function nextSearch(){
   if(idx>=titles.length)return Promise.resolve([]);
   var q=titles[idx++];
   return fetchPage(BASE_URL+"/?s="+encodeURIComponent(q)).then(function(search){
    var links=getAnchors(search.html,search.url),direct=[],series=[],seen={};
    links.forEach(function(a){
     if(!/https?:/i.test(a.url)||a.url.indexOf(new URL(BASE_URL).hostname)<0||/مدبلج/i.test(a.title))return;
     var sc=0;titles.forEach(function(t){sc=Math.max(sc,score(a.title,t));});
     if(sc<45)return;
     var n=episodeNumber(a.title+" "+a.url);
     if(isMovie){direct.push({url:a.url,score:sc});return;}
     if(n===Number(episode))direct.push({url:a.url,score:sc});
     else if(n===null)series.push({url:a.url,score:sc});
    });
    direct.sort(function(a,b){return b.score-a.score;});
    if(direct.length)return resolvePages(direct.slice(0,3).map(function(x){return x.url;}));
    series.sort(function(a,b){return b.score-a.score;});
    if(!series.length)return nextSearch();
    var si=0;
    function nextSeries(){
     if(si>=Math.min(series.length,3))return nextSearch();
     var candidate=series[si++].url;
     return fetchPage(candidate,search.url).then(function(sp){
      var eps=isMovie?[candidate]:findEpisodePage(sp,season,episode);
      if(!eps.length)return nextSeries();
      return resolvePages(eps.slice(0,3));
     }).then(function(res){return res.length?res:nextSeries();}).catch(nextSeries);
    }
    return nextSeries();
   }).catch(nextSearch);
  }
  function resolvePages(urls){
   var streams=[],seen={};var i=0;
   function step(){
    if(i>=urls.length||streams.length>=8)return Promise.resolve(streams);
    var u=urls[i++];
    return fetchPage(u,BASE_URL+"/").then(function(p){
     var heading=(p.html.match(/<h1\b[^>]*>[\s\S]*?<\/h1>/i)||[""])[0];
     if(/مدبلج/i.test(strip(heading)))return;
     var titleText=strip(heading)+" "+strip((p.html.match(/<title\b[^>]*>[\s\S]*?<\/title>/i)||[""])[0]);
     var best=0;titles.forEach(function(t){best=Math.max(best,score(titleText,t));});
     if(best<35)return;
     return extractFromPage(p,0,seen,streams);
    }).catch(function(){}).then(step);
   }
   return step();
  }
  return nextSearch();
 }).catch(function(e){console.log("["+ShoofLive+"] "+(e&&e.message?e.message:e));return [];});
}
module.exports={getStreams:getStreams};
