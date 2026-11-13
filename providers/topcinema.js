"use strict";

/**
 * CVN-TopCinema — Nuvio provider.
 * Uses TopCinema's own search, series/season pages and watch-server AJAX
 * endpoint. Only media URLs extracted from the selected episode's players
 * are returned.
 */
var PROVIDER="CVN-TopCinema";
var BASES=["https://web6.topcinema.fan","https://topcinema.fan"];
var TMDB_KEY="8265bd1679663a7ea12ac168da84d2e8";
var UA="Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 Chrome/131.0 Mobile Safari/537.36";

function decode(s){return String(s||"").replace(/&amp;/gi,"&").replace(/&quot;/gi,'"').replace(/&#39;|&apos;/gi,"'").replace(/&#x([0-9a-f]+);/gi,function(_,n){return String.fromCharCode(parseInt(n,16));}).replace(/&#(\d+);/g,function(_,n){return String.fromCharCode(Number(n));});}
function strip(s){return decode(String(s||"").replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi," ").replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi," ").replace(/<[^>]+>/g," ")).replace(/\s+/g," ").trim();}
function attr(tag,k){var m=String(tag||"").match(new RegExp("\\b"+k+"\\s*=\\s*(?:\"([^\"]*)\"|'([^']*)'|([^\\s>]+))","i"));return m?decode(m[1]||m[2]||m[3]||""):"";}
function abs(u,b){try{return new URL(decode(u),b).href;}catch(_){return "";}}
function norm(s){return strip(s).toLowerCase().replace(/[\u064b-\u065f\u0670ـ]/g,"").replace(/[أإآٱ]/g,"ا").replace(/ى/g,"ي").replace(/(?:مدبلج|مترجم|الحلقة|الحلقه|حلقة|episode|ep)\s*\d*/gi," ").replace(/[^a-z0-9\u0600-\u06ff]+/g," ").trim();}
function score(a,b){a=norm(a);b=norm(b);if(!a||!b)return 0;if(a===b)return 100;if(a.indexOf(b)>=0||b.indexOf(a)>=0)return 88;var aw=a.split(" "),bw=b.split(" "),n=0;aw.forEach(function(w){if(bw.indexOf(w)>=0)n++;});return Math.round(n/Math.max(aw.length,bw.length)*80);}
function fetchPage(url,referer,method,body){
 return fetch(url,{method:method||"GET",headers:{
  "User-Agent":UA,"Accept":"text/html,application/xhtml+xml,application/json,*/*",
  "Accept-Language":"ar-EG,ar;q=0.9,en-US;q=0.8","Referer":referer||BASES[0]+"/",
  "X-Requested-With":method==="POST"?"XMLHttpRequest":"",
  "Content-Type":method==="POST"?"application/x-www-form-urlencoded; charset=UTF-8":""
 },body:body}).then(function(r){if(!r||!r.ok)throw new Error("HTTP "+(r?r.status:"no response"));return r.text().then(function(html){return {html:html,url:r.url||url};});});
}
function titlesFor(id,type){
 var t=String(type||"tv").toLowerCase()==="movie"?"movie":"tv";
 return fetch("https://api.themoviedb.org/3/"+t+"/"+encodeURIComponent(String(id))+"?api_key="+TMDB_KEY+"&append_to_response=translations,alternative_titles",{headers:{"Accept":"application/json","User-Agent":UA}})
 .then(function(r){if(!r.ok)throw new Error("TMDB "+r.status);return r.json();}).then(function(d){
  var a=[];function add(v){if(v&&String(v).trim()&&a.indexOf(String(v).trim())<0)a.push(String(v).trim());}
  add(t==="tv"?d.name:d.title);add(t==="tv"?d.original_name:d.original_title);
  if(d.translations&&d.translations.translations)d.translations.translations.forEach(function(x){if(x&&x.iso_639_1==="ar"&&x.data)add(x.data.name||x.data.title);});
  var alt=d.alternative_titles;if(alt)(alt.results||alt.titles||[]).forEach(function(x){add(x.title||x.name);});
  return a;
 });
}
function links(html,base){
 var re=/<a\b[^>]*>[\s\S]*?<\/a>/gi,m,out=[];
 while((m=re.exec(html))!==null){var tag=(m[0].match(/^<a\b[^>]*>/i)||[""])[0],url=abs(attr(tag,"href"),base),title=attr(tag,"title")||strip(m[0]);if(url&&title)out.push({url:url,title:title,html:m[0],tag:tag});}
 return out;
}
function epNo(s){var m=String(s||"").match(/(?:الحلقة|الحلقه|حلقة|episode|ep)\s*[-:#]?\s*(\d+)/i);if(!m)m=String(s||"").match(/(?:episode-|ep-)(\d+)/i);return m?Number(m[1]):null;}
function discoverBase(){
 var i=0;function next(){if(i>=BASES.length)return Promise.reject(new Error("TopCinema domains unavailable"));
  var b=BASES[i++];return fetchPage(b+"/").then(function(p){if(/Posts--List|Small--Box|Slides--Main/i.test(p.html))return new URL(p.url).origin;throw new Error("catalog missing");}).catch(next);
 }return next();
}
function unpack(html){
 var m=String(html||"").match(/eval\(function\(p,a,c,k,e,d\)\{[\s\S]*?\}\(\s*(['"])([\s\S]*?)\1\s*,\s*(\d+)\s*,\s*(\d+)\s*,\s*(['"])([\s\S]*?)\5\.split\(['"]\|['"]\)/);
 if(!m)return [];var p=m[2].replace(/\\'/g,"'"),radix=Math.min(Number(m[3])||62,62),count=Number(m[4])||0,k=m[6].split("|"),chars="0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ";
 function b(n,r){if(!n)return "0";var s="";while(n>0){s=chars[n%r]+s;n=Math.floor(n/r);}return s;}
 for(var i=0;i<count;i++){var key=b(i,radix);if(k[i])p=p.replace(new RegExp("\\b"+key+"\\b","g"),k[i]);}
 return p.match(/https?:\/\/[^\s"'<>]+?\.(?:m3u8|mp4|m4v)(?:\?[^\s"'<>]*)?/gi)||[];
}
function mediaIn(html,pageUrl){
 var found=[],seen={};function add(raw){var u=abs(String(raw||"").replace(/\\\//g,"/"),pageUrl);if(u&&/\.(?:m3u8|mp4|m4v)(?:[?#]|$)/i.test(u)&&!seen[u]){seen[u]=1;found.push(u);}}
 var raw=String(html||"").match(/https?:\\?\/\\?\/[^"'\s<>]+?\.(?:m3u8|mp4|m4v)(?:\?[^"'\s<>]*)?/gi)||[];raw.forEach(add);
 unpack(html).forEach(add);
 var tags=String(html||"").match(/<(?:video|source)[^>]*>/gi)||[];tags.forEach(function(t){add(attr(t,"src"));});
 return found;
}
function getIframeUrls(html,base){
 var tags=String(html||"").match(/<iframe\b[^>]*>/gi)||[],out=[];
 tags.forEach(function(t){var u=abs(attr(t,"src"),base);if(u&&out.indexOf(u)<0)out.push(u);});
 return out;
}
function resolveEmbed(url,referer,depth,seen,streams){
 if(depth>2||streams.length>=6)return Promise.resolve();
 return fetchPage(url,referer).then(function(p){
  var media=mediaIn(p.html,p.url);media.forEach(function(u){if(!seen[u]){seen[u]=1;streams.push({name:PROVIDER,title:"TopCinema | "+(u.match(/\.m3u8/i)?"HLS":"MP4"),url:u,quality:"auto",language:"ar",type:u.match(/\.m3u8/i)?"hls":"mp4",headers:{"User-Agent":UA,"Referer":p.url}});}});
  if(streams.length>=6)return;
  var nested=getIframeUrls(p.html,p.url).slice(0,4),jobs=[];nested.forEach(function(v){if(!seen["frame:"+v]){seen["frame:"+v]=1;jobs.push(resolveEmbed(v,p.url,depth+1,seen,streams).catch(function(){}));}});
  return Promise.all(jobs);
 }).catch(function(){});
}
function getStreams(tmdbId,mediaType,season,episode){
 if(!tmdbId||!["tv","series","show"].includes(String(mediaType||"").toLowerCase()))return Promise.resolve([]);
 return Promise.all([discoverBase(),titlesFor(tmdbId,mediaType)]).then(function(info){
  var base=info[0],titles=info[1],idx=0;
  function searchNext(){
   if(idx>=titles.length)return Promise.resolve([]);
   var q=titles[idx++];
   return fetchPage(base+"/search/?query="+encodeURIComponent(q)+"&type=all",base+"/").then(function(sp){
    var cards=links(sp.html,sp.url),best=null,bestScore=0;
    cards.forEach(function(a){if(/مدبلج/i.test(a.title))return;var s=0;titles.forEach(function(t){s=Math.max(s,score(a.title,t));});if(s>bestScore){best=a;bestScore=s;}});
    if(!best||bestScore<40)return searchNext();
    return fetchPage(best.url,sp.url).then(function(detail){
     var seasonLinks=links(detail.html,detail.url).filter(function(a){return /season|الموسم/i.test(a.title)||/allseasonss/i.test(a.tag);});
     var seasonNum=Number(season)||1,episodeNum=Number(episode),episodePages=[];
     function readSeason(page){
      links(page.html,page.url).forEach(function(a){
       var n=epNo(a.title+" "+a.url);
       if(n===episodeNum && (/episode|الحلقة|حلقة|ep/i.test(a.title+" "+a.url))){episodePages.push(a.url);}
      });
     }
     if(seasonLinks.length){
      var selected=seasonLinks.filter(function(a){var m=(a.title+" "+a.url).match(/(?:season|الموسم)\s*(\d+)/i);return m?Number(m[1])===seasonNum:seasonLinks.length===1;});
      var chain=Promise.resolve();selected.forEach(function(a){chain=chain.then(function(){return fetchPage(a.url,detail.url).then(readSeason).catch(function(){});});});
      return chain.then(function(){if(!episodePages.length)readSeason(detail);return episodePages;});
     }
     readSeason(detail);return Promise.resolve(episodePages);
    }).then(function(pages){
     if(!pages.length)return searchNext();
     var i=0,streams=[],seen={};
     function nextEp(){
      if(i>=pages.length||streams.length>=6)return Promise.resolve(streams);
      var epUrl=pages[i++],watchUrl=epUrl.replace(/\/$/,"")+"/watch/";
      return fetchPage(watchUrl,base+"/").then(function(watch){
       var iframe=getIframeUrls(watch.html,watch.url),serverTags=watch.html.match(/<li\b[^>]*class=["'][^"']*server--item[^"']*["'][^>]*>/gi)||[],jobs=[];
       jobs.push(resolveEmbed(watch.url,base+"/",0,seen,streams));
       iframe.forEach(function(u){jobs.push(resolveEmbed(u,watch.url,0,seen,streams));});
       var ajaxBase=new URL(watch.url).origin+"/wp-content/themes/movies2023/Ajaxat/Single/Server.php";
       var ajaxJobs=[];
       serverTags.forEach(function(tag){
        var id=attr(tag,"data-id"),server=attr(tag,"data-server");if(!id||!server)return;
        var body="id="+encodeURIComponent(id)+"&i="+encodeURIComponent(server);
        ajaxJobs.push(fetchPage(ajaxBase,watch.url,"POST",body).then(function(r){return getIframeUrls(r.html,r.url);}).catch(function(){return [];}));
       });
       return Promise.all(ajaxJobs).then(function(groups){
        groups.forEach(function(group){group.forEach(function(u){jobs.push(resolveEmbed(u,watch.url,0,seen,streams));});});
        return Promise.all(jobs);
       });
      }).catch(function(){return fetchPage(epUrl,base+"/").then(function(p){return resolveEmbed(p.url,p.url,0,seen,streams);}).catch(function(){});}).then(nextEp);
     }
     return nextEp();
    });
   }).catch(function(){return searchNext();});
  }
  return searchNext();
 }).catch(function(e){console.log("[TopCinema] "+(e&&e.message?e.message:e));return [];});
}
module.exports={getStreams:getStreams};
