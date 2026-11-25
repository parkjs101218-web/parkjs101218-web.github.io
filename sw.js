/* 아플 때 길잡이 - 오프라인용 서비스 워커
   화면(index.html)은 인터넷이 되면 늘 새로 받아 오고, 안 되면 저장해 둔 것을 보여 줘요.
   아이콘 같은 파일은 저장해 둔 것을 먼저 써요.
   아이콘이나 manifest를 바꿨다면 아래 VERSION 숫자를 하나 올려 주세요. */
var VERSION = 'v2';
var CACHE = 'gil-' + VERSION;
var SHELL = './';
var FILES = [
  SHELL,
  './manifest.webmanifest',
  './icon-192.png',
  './icon-512.png',
  './maskable-512.png',
  './apple-touch-icon.png'
];
var WAIT_MS = 3500; // 인터넷이 느리면 이만큼만 기다리고 저장본을 보여 줘요

// 리디렉션을 거친 응답은 그대로 저장하면 나중에 화면 열기가 실패할 수 있어서 깨끗한 응답으로 바꿔 저장해요
function clean(res){
  if (!res.redirected) return Promise.resolve(res);
  return res.blob().then(function(body){
    return new Response(body, { status: res.status, statusText: res.statusText, headers: res.headers });
  });
}

self.addEventListener('install', function(e){
  e.waitUntil(
    caches.open(CACHE).then(function(c){
      return Promise.all(FILES.map(function(u){
        return fetch(u, { cache: 'reload' }).then(function(r){
          if (!r.ok) throw new Error(u + ' ' + r.status);
          return clean(r).then(function(r2){ return c.put(u, r2); });
        });
      }));
    }).then(function(){ return self.skipWaiting(); })
  );
});

self.addEventListener('activate', function(e){
  e.waitUntil(
    caches.keys().then(function(keys){
      return Promise.all(keys.filter(function(k){ return k.indexOf('gil-') === 0 && k !== CACHE; }).map(function(k){ return caches.delete(k); }));
    }).then(function(){ return self.clients.claim(); })
  );
});

self.addEventListener('fetch', function(e){
  var req = e.request;
  if (req.method !== 'GET') return;
  var url = new URL(req.url);
  if (url.origin !== self.location.origin) return; // 바깥 사이트 링크는 손대지 않아요

  if (req.mode === 'navigate') {
    var net = fetch(req).then(function(res){
      if (res && res.ok) {
        var copy = res.clone();
        e.waitUntil(clean(copy).then(function(r2){ return caches.open(CACHE).then(function(c){ return c.put(SHELL, r2); }); }).catch(function(){}));
      }
      return res;
    });
    e.waitUntil(net.catch(function(){}));
    e.respondWith(new Promise(function(resolve){
      var done = false;
      function give(r){ if (!done && r) { done = true; resolve(r); } }
      var timer = setTimeout(function(){ caches.match(SHELL).then(give); }, WAIT_MS);
      net.then(function(res){ clearTimeout(timer); give(res); }).catch(function(){
        clearTimeout(timer);
        caches.match(SHELL).then(function(r){ if (r) give(r); else give(Response.error()); });
      });
    }));
    return;
  }

  e.respondWith(
    caches.match(req).then(function(hit){
      return hit || fetch(req).then(function(res){
        if (res && res.ok && res.type === 'basic') {
          var copy = res.clone();
          e.waitUntil(caches.open(CACHE).then(function(c){ return c.put(req, copy); }).catch(function(){}));
        }
        return res;
      });
    })
  );
});
