import ipaddress
import socket
import http.server
import socketserver
import urllib.parse
import urllib.request
import urllib.error
import json
import os
import re
import ssl
import time
import threading

try:
    import yt_dlp
except ImportError:
    yt_dlp = None

PORT = 8080

BASE_DIR = os.path.abspath(os.path.dirname(__file__))

AUDIO_URL_CACHE = {}
AUDIO_CACHE_LOCK = threading.Lock()

def create_ssl_context():
    ctx = ssl._create_unverified_context() if hasattr(ssl, '_create_unverified_context') else ssl.create_default_context()
    ctx.check_hostname = False
    ctx.verify_mode = ssl.CERT_NONE
    return ctx



ALLOWED_ORIGIN_PATTERNS = [
    re.compile(r'^http://(127\.0\.0\.1|localhost)(:\d+)?$'),
    re.compile(r'^https://isthatnyte\.github\.io$'),
]

def is_allowed_origin(origin):
    if not origin:
        return False
    return any(p.match(origin) for p in ALLOWED_ORIGIN_PATTERNS)

def is_safe_target_url(url):
    try:
        parsed = urllib.parse.urlparse(url)
        if parsed.scheme not in ('http', 'https'):
            return False
        hostname = (parsed.hostname or '').strip().lower()
        if not hostname:
            return False
        if hostname in ('localhost', '127.0.0.1', '::1', '0.0.0.0'):
            return False
        if hostname.endswith('.local') or hostname.endswith('.internal'):
            return False
        addrs = socket.getaddrinfo(hostname, None)
        for _, _, _, _, sockaddr in addrs:
            ip = ipaddress.ip_address(sockaddr[0])
            if ip.is_private or ip.is_loopback or ip.is_link_local or ip.is_reserved or ip.is_multicast:
                return False
        return True
    except Exception:
        return False

STRIP_HEADERS = {
    'x-frame-options',
    'content-security-policy',
    'content-security-policy-report-only',
    'frame-options',
    'transfer-encoding',
    'content-encoding',
    'content-length',
    'strict-transport-security',
    'cross-origin-opener-policy',
    'cross-origin-embedder-policy',
    'cross-origin-resource-policy',
}


class ProxyHTTPRequestHandler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=BASE_DIR, **kwargs)

    def end_headers(self):
        client_origin = self.headers.get('Origin', '').strip()
        if is_allowed_origin(client_origin):
            self.send_header('Access-Control-Allow-Origin', client_origin)
            self.send_header('Vary', 'Origin')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type, Range')
        self.send_header('Cache-Control', 'no-cache')
        self.send_header('X-Content-Type-Options', 'nosniff')
        super().end_headers()

    def do_OPTIONS(self):
        self.send_response(200)
        self.end_headers()

    def do_HEAD(self):
        parsed = urllib.parse.urlparse(self.path)
        if parsed.path == '/audio':
            self.handle_audio(parsed.query, is_head=True)
            return
        super().do_HEAD()

    def do_GET(self):
        parsed = urllib.parse.urlparse(self.path)
        if parsed.path == '/proxy':
            self.handle_proxy(parsed.query)
            return
        if parsed.path == '/audio':
            self.handle_audio(parsed.query)
            return
        if parsed.path == '/import-playlist':
            self.handle_import_playlist(parsed.query)
            return
        if parsed.path == '/ai':
            self.handle_ai_get(parsed.query)
            return
        super().do_GET()

    def do_POST(self):
        parsed = urllib.parse.urlparse(self.path)
        if parsed.path == '/ai':
            content_length = int(self.headers.get('Content-Length', 0))
            body = self.rfile.read(content_length).decode('utf-8', errors='replace')
            try:
                data = json.loads(body)
            except Exception:
                data = {}
            self.handle_ai_request(data)
            return
        self.send_response(404)
        self.end_headers()

    def handle_ai_get(self, query_string):
        params = urllib.parse.parse_qs(query_string)
        prompt = params.get('q', [''])[0].strip()
        sys_prompt = params.get('sys', [''])[0].strip()
        api_key = params.get('key', [''])[0].strip()
        self.handle_ai_request({'prompt': prompt, 'system': sys_prompt, 'apiKey': api_key})

    def handle_ai_request(self, data):
        prompt = (data.get('prompt') or '').strip()
        system_instruction = (
            data.get('system')
            or 'You are Droplet, the built-in assistant for AeroOS. Reply in 1 to 4 clear, concise sentences. Never use em-dashes.'
        ).strip()
        api_key = (
            data.get('apiKey')
            or os.environ.get('GEMINI_API_KEY')
            or os.environ.get('GOOGLE_API_KEY')
            or ''
        ).strip()

        ctx = create_ssl_context()

        reply_text = ''
        provider_used = 'none'

        # 1. Try Google Gemini API (gemini-2.0-flash, gemini-1.5-flash, gemini-1.5-pro)
        if api_key:
            for model_name in ['gemini-2.0-flash', 'gemini-1.5-flash', 'gemini-1.5-pro']:
                try:
                    url = f'https://generativelanguage.googleapis.com/v1beta/models/{model_name}:generateContent?key={urllib.parse.quote(api_key)}'
                    payload = json.dumps({
                        'contents': [
                            {
                                'role': 'user',
                                'parts': [{'text': prompt}],
                            }
                        ],
                        'systemInstruction': {
                            'parts': [{'text': system_instruction}]
                        },
                        'generationConfig': {'temperature': 0.4, 'maxOutputTokens': 600},
                    }).encode('utf-8')
                    req = urllib.request.Request(
                        url,
                        data=payload,
                        headers={
                            'Content-Type': 'application/json',
                            'x-goog-api-key': api_key,
                        },
                        method='POST',
                    )
                    with urllib.request.urlopen(req, timeout=8, context=ctx) as resp:
                        res_json = json.loads(resp.read().decode('utf-8', errors='replace'))
                        candidate = (
                            res_json.get('candidates', [{}])[0]
                            .get('content', {})
                            .get('parts', [{}])[0]
                            .get('text', '')
                        )
                        if candidate:
                            reply_text = candidate.strip()
                            provider_used = model_name
                            break
                except Exception:
                    # Fallback retry without systemInstruction field for older models
                    try:
                        url = f'https://generativelanguage.googleapis.com/v1beta/models/{model_name}:generateContent?key={urllib.parse.quote(api_key)}'
                        payload = json.dumps({
                            'contents': [
                                {
                                    'role': 'user',
                                    'parts': [{'text': f'{system_instruction}\n\nUser: {prompt}'}],
                                }
                            ],
                            'generationConfig': {'temperature': 0.4, 'maxOutputTokens': 600},
                        }).encode('utf-8')
                        req = urllib.request.Request(url, data=payload, headers={'Content-Type': 'application/json'}, method='POST')
                        with urllib.request.urlopen(req, timeout=8, context=ctx) as resp:
                            res_json = json.loads(resp.read().decode('utf-8', errors='replace'))
                            candidate = (
                                res_json.get('candidates', [{}])[0]
                                .get('content', {})
                                .get('parts', [{}])[0]
                                .get('text', '')
                            )
                            if candidate:
                                reply_text = candidate.strip()
                                provider_used = model_name
                                break
                    except Exception:
                        continue

        # 2. Zero-config AI fallback via Pollinations OpenAI-compatible text endpoint
        if not reply_text:
            try:
                pol_url = 'https://text.pollinations.ai/openai'
                payload = json.dumps({
                    'model': 'openai',
                    'messages': [
                        {'role': 'system', 'content': system_instruction},
                        {'role': 'user', 'content': prompt},
                    ],
                    'temperature': 0.4,
                }).encode('utf-8')
                req = urllib.request.Request(
                    pol_url,
                    data=payload,
                    headers={
                        'Content-Type': 'application/json',
                        'User-Agent': 'Mozilla/5.0 AeroOS/1.0',
                    },
                    method='POST',
                )
                with urllib.request.urlopen(req, timeout=10, context=ctx) as resp:
                    res_json = json.loads(resp.read().decode('utf-8', errors='replace'))
                    choices = res_json.get('choices') or []
                    if choices:
                        reply_text = (choices[0].get('message', {}).get('content') or '').strip()
                        provider_used = 'cloud-ai'
            except Exception:
                pass

        # 3. Wikipedia / DuckDuckGo instant summary fallback
        if not reply_text:
            try:
                topic = re.sub(
                    r'^(what is|who is|who was|tell me about|explain|define|where is)\s+',
                    '',
                    prompt,
                    flags=re.IGNORECASE,
                ).strip(' ?.,!')
                if topic:
                    wiki_url = f'https://en.wikipedia.org/api/rest_v1/page/summary/{urllib.parse.quote(topic)}'
                    req = urllib.request.Request(wiki_url, headers={'User-Agent': 'AeroOS/1.0'})
                    with urllib.request.urlopen(req, timeout=6, context=ctx) as resp:
                        wdata = json.loads(resp.read().decode('utf-8', errors='replace'))
                        extract = (wdata.get('extract') or '').strip()
                        if extract:
                            sentences = extract.split('. ')
                            reply_text = '. '.join(sentences[:3]).strip()
                            if not reply_text.endswith('.'):
                                reply_text += '.'
                            provider_used = 'wikipedia'
            except Exception:
                pass

        if not reply_text:
            try:
                ddg_url = f'https://api.duckduckgo.com/?q={urllib.parse.quote(prompt)}&format=json&no_html=1&skip_disambig=1'
                req = urllib.request.Request(ddg_url, headers={'User-Agent': 'AeroOS/1.0'})
                with urllib.request.urlopen(req, timeout=6, context=ctx) as resp:
                    ddg = json.loads(resp.read().decode('utf-8', errors='replace'))
                    abstract = (ddg.get('AbstractText') or ddg.get('Answer') or '').strip()
                    if abstract:
                        reply_text = abstract
                        provider_used = 'ddg'
            except Exception:
                pass

        if reply_text:
            reply_text = reply_text.replace('\u2014', ', ').replace('\u2013', '-')

        self.send_json_response({'ok': bool(reply_text), 'reply': reply_text, 'provider': provider_used})

    def send_json_response(self, data, status=200):
        out = json.dumps(data).encode('utf-8')
        self.send_response(status)
        self.send_header('Content-Type', 'application/json; charset=utf-8')
        self.send_header('Content-Length', str(len(out)))
        self.end_headers()
        self.wfile.write(out)

    def resolve_yt_audio(self, video_id, query_fallback=''):
        now = time.time()
        with AUDIO_CACHE_LOCK:
            cached = AUDIO_URL_CACHE.get(video_id)
            if cached and now - cached['ts'] < 1800:
                return cached

        if not yt_dlp:
            return None

        ydl_opts = {
            'format': 'bestaudio[ext=m4a]/bestaudio/best',
            'quiet': True,
            'no_warnings': True,
            'noplaylist': True,
            'geo_bypass': True,
        }

        target = f'https://www.youtube.com/watch?v={video_id}' if video_id else f'ytsearch1:{query_fallback}'
        try:
            with yt_dlp.YoutubeDL(ydl_opts) as ydl:
                info = ydl.extract_info(target, download=False)
                if 'entries' in info and info['entries']:
                    info = info['entries'][0]
                stream_url = info.get('url')
                if not stream_url:
                    return None
                entry = {
                    'url': stream_url,
                    'headers': info.get('http_headers') or {},
                    'content_type': 'audio/mp4' if info.get('ext') == 'm4a' else 'audio/webm',
                    'duration': info.get('duration') or 0,
                    'is_live': bool(info.get('is_live')),
                    'ts': now,
                }
                with AUDIO_CACHE_LOCK:
                    if video_id:
                        AUDIO_URL_CACHE[video_id] = entry
                return entry
        except Exception:
            if query_fallback:
                try:
                    with yt_dlp.YoutubeDL(ydl_opts) as ydl:
                        info = ydl.extract_info(f'ytsearch1:{query_fallback}', download=False)
                        if 'entries' in info and info['entries']:
                            info = info['entries'][0]
                        stream_url = info.get('url')
                        if stream_url:
                            entry = {
                                'url': stream_url,
                                'headers': info.get('http_headers') or {},
                                'content_type': 'audio/mp4' if info.get('ext') == 'm4a' else 'audio/webm',
                                'duration': info.get('duration') or 0,
                                'is_live': bool(info.get('is_live')),
                                'ts': now,
                            }
                            with AUDIO_CACHE_LOCK:
                                if video_id:
                                    AUDIO_URL_CACHE[video_id] = entry
                            return entry
                except Exception:
                    pass
            return None

    def handle_audio(self, query_string, is_head=False):
        params = urllib.parse.parse_qs(query_string)
        video_id = params.get('v', [''])[0].strip()
        q_fallback = params.get('q', [''])[0].strip()

        if not video_id and not q_fallback:
            self.send_response(400)
            self.end_headers()
            return

        resolved = self.resolve_yt_audio(video_id, q_fallback)
        if not resolved or not resolved.get('url'):
            self.send_response(404)
            self.end_headers()
            return

        ctx = create_ssl_context()

        req_headers = dict(resolved.get('headers') or {})
        client_range = self.headers.get('Range')
        if client_range:
            req_headers['Range'] = client_range

        try:
            req = urllib.request.Request(resolved['url'], headers=req_headers)
            with urllib.request.urlopen(req, timeout=15, context=ctx) as upstream:
                status = upstream.getcode() or 200
                self.send_response(status)
                ctype = upstream.headers.get('Content-Type') or resolved.get('content_type', 'audio/mp4')
                self.send_header('Content-Type', ctype)
                self.send_header('Accept-Ranges', 'bytes')
                for hdr in ['Content-Length', 'Content-Range']:
                    val = upstream.headers.get(hdr)
                    if val:
                        self.send_header(hdr, val)
                self.end_headers()

                if is_head:
                    return

                while True:
                    chunk = upstream.read(65536)
                    if not chunk:
                        break
                    try:
                        self.wfile.write(chunk)
                    except (BrokenPipeError, ConnectionResetError, ConnectionAbortedError):
                        break
        except Exception:
            with AUDIO_CACHE_LOCK:
                AUDIO_URL_CACHE.pop(video_id, None)
            try:
                self.send_response(502)
                self.end_headers()
            except Exception:
                pass

    def handle_import_playlist(self, query_string):
        params = urllib.parse.parse_qs(query_string)
        url = params.get('url', [''])[0].strip()
        if not url:
            self.send_json_response({'ok': False, 'error': 'Missing url parameter'}, 400)
            return

        ctx = create_ssl_context()

        # 1. Spotify playlist, album, or track
        spotify_match = re.search(r'spotify\.com\/(playlist|album|track)\/([a-zA-Z0-9]+)', url)
        if not spotify_match:
            spotify_match = re.search(r'spotify:(playlist|album|track):([a-zA-Z0-9]+)', url)

        if spotify_match:
            t_type, t_id = spotify_match.groups()
            embed_url = f'https://open.spotify.com/embed/{t_type}/{t_id}'
            req = urllib.request.Request(
                embed_url,
                headers={
                    'User-Agent': (
                        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) '
                        'AppleWebKit/537.36 (KHTML, like Gecko) '
                        'Chrome/124.0.0.0 Safari/537.36'
                    ),
                    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
                },
            )
            try:
                with urllib.request.urlopen(req, timeout=12, context=ctx) as resp:
                    html = resp.read().decode('utf-8', 'ignore')
                m_json = re.search(r'<script id="__NEXT_DATA__"[^>]*>(.*?)</script>', html)
                if m_json:
                    data = json.loads(m_json.group(1))
                    entity = (
                        data.get('props', {})
                        .get('pageProps', {})
                        .get('state', {})
                        .get('data', {})
                        .get('entity', {})
                    )
                    if entity:
                        title = entity.get('name') or entity.get('title') or 'Spotify Playlist'
                        cover_sources = entity.get('coverArt', {}).get('sources', [])
                        cover_url = cover_sources[0].get('url') if cover_sources else ''

                        raw_tracks = entity.get('trackList') or []
                        if not raw_tracks and entity.get('type') == 'track':
                            raw_tracks = [entity]

                        tracks = []
                        for idx, t in enumerate(raw_tracks):
                            track_title = t.get('title') or t.get('name') or 'Track'
                            artist = t.get('subtitle') or entity.get('subtitle') or 'Artist'
                            dur_ms = t.get('duration') or 180000
                            dur_sec = max(30, round(dur_ms / 1000))
                            t_uri = t.get('uri') or f'sp-{idx}'
                            tracks.append({
                                'id': f'spotify-{t_uri.replace(":", "-")}',
                                'title': track_title,
                                'artist': artist,
                                'duration': dur_sec,
                                'cover': cover_url,
                                'source': 'spotify',
                            })

                        if tracks:
                            self.send_json_response({
                                'ok': True,
                                'name': title,
                                'cover': cover_url,
                                'type': t_type,
                                'tracks': tracks,
                            })
                            return
            except Exception:
                pass

        # 2. YouTube / YouTube Music playlist or album via yt-dlp flat extraction
        if yt_dlp:
            try:
                ydl_opts = {'extract_flat': True, 'quiet': True, 'no_warnings': True}
                with yt_dlp.YoutubeDL(ydl_opts) as ydl:
                    info = ydl.extract_info(url, download=False)
                    if info:
                        title = info.get('title') or 'Imported Playlist'
                        entries = info.get('entries') or []
                        if not entries and info.get('id'):
                            entries = [info]

                        tracks = []
                        for e in entries:
                            vid = e.get('id') or ''
                            if not vid and e.get('url'):
                                vid_match = re.search(r'v=([a-zA-Z0-9_-]+)', e['url'])
                                if vid_match:
                                    vid = vid_match.group(1)
                            t_title = e.get('title') or 'Untitled'
                            t_artist = e.get('uploader') or e.get('artist') or 'YouTube Music'
                            t_dur = e.get('duration') or 210
                            t_thumb = (
                                (e.get('thumbnails') or [{}])[-1].get('url')
                                or (f'https://i.ytimg.com/vi/{vid}/hqdefault.jpg' if vid else '')
                            )
                            tracks.append({
                                'id': f'yt-{vid}' if vid else f'track-{len(tracks)}',
                                'videoId': vid,
                                'title': t_title,
                                'artist': t_artist,
                                'duration': t_dur,
                                'cover': t_thumb,
                                'source': 'youtube',
                            })

                        if tracks:
                            self.send_json_response({
                                'ok': True,
                                'name': title,
                                'cover': (info.get('thumbnails') or [{}])[-1].get('url') or '',
                                'tracks': tracks,
                            })
                            return
            except Exception:
                pass

        self.send_json_response({'ok': False, 'error': 'Could not extract playlist tracks'}, 400)

    def handle_proxy(self, query_string):
        params = urllib.parse.parse_qs(query_string)
        target_url = params.get('url', [''])[0].strip()
        if not target_url:
            self.send_response(400)
            self.send_header('Content-Type', 'text/plain; charset=utf-8')
            self.end_headers()
            self.wfile.write(b'Missing url parameter')
            return

        if 'uddg=' in target_url:
            uddg_match = re.search(r'uddg=([^&]+)', target_url)
            if uddg_match:
                target_url = urllib.parse.unquote(uddg_match.group(1))

        if not target_url.startswith(('http://', 'https://')):
            target_url = 'https://' + target_url

        if not is_safe_target_url(target_url):
            self.send_response(403)
            self.send_header('Content-Type', 'text/plain; charset=utf-8')
            self.end_headers()
            self.wfile.write(b'Access denied: target address is private or restricted.')
            return

        ctx = create_ssl_context()

        req = urllib.request.Request(
            target_url,
            headers={
                'User-Agent': (
                    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) '
                    'AppleWebKit/537.36 (KHTML, like Gecko) '
                    'Chrome/124.0.0.0 Safari/537.36'
                ),
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
                'Accept-Language': 'en-US,en;q=0.9',
                'Accept-Encoding': 'identity',
            },
        )

        try:
            with urllib.request.urlopen(req, timeout=12, context=ctx) as resp:
                status = resp.getcode() or 200
                raw_body = resp.read()
                content_type = resp.headers.get('Content-Type', 'text/html; charset=utf-8')
                final_url = resp.geturl() or target_url

                if 'text/html' in content_type.lower():
                    try:
                        text = raw_body.decode('utf-8', errors='replace')
                    except Exception:
                        text = raw_body.decode('latin-1', errors='replace')

                    parsed_final = urllib.parse.urlparse(final_url)
                    base_href = f"{parsed_final.scheme}://{parsed_final.netloc}/"
                    base_tag = f'<base href="{base_href}">'

                    nav_script = (
                        '<script>'
                        '(function(){'
                        'function wrap(u){'
                        'var m=u.match(/uddg=([^&]+)/);'
                        'if(m)u=decodeURIComponent(m[1]);'
                        'return "/proxy?url="+encodeURIComponent(u);'
                        '}'
                        'document.addEventListener("click",function(e){'
                        'var a=e.target&&e.target.closest("a");'
                        'if(!a||!a.href||a.href.startsWith("javascript:")||a.href.startsWith("#"))return;'
                        'e.preventDefault();'
                        'window.location.href=wrap(a.href);'
                        '},true);'
                        'document.addEventListener("submit",function(e){'
                        'var f=e.target;'
                        'if(!f)return;'
                        'e.preventDefault();'
                        'var act=f.action||window.location.href;'
                        'var fd=new FormData(f);'
                        'var p=new URLSearchParams();'
                        'for(var pair of fd.entries()){p.append(pair[0],pair[1]);}'
                        'var full=act+(act.indexOf("?")>=0?"&":"?")+p.toString();'
                        'window.location.href=wrap(full);'
                        '},true);'
                        '})();'
                        '</script>'
                    )

                    # Rewrite root-relative asset URLs so they load from the target origin
                    text = re.sub(r'(href|src)=(["\'])/(?!/)', r'\1=\2' + base_href, text)

                    inject = base_tag + nav_script
                    if re.search(r'<head[^>]*>', text, flags=re.IGNORECASE):
                        text = re.sub(
                            r'(<head[^>]*>)',
                            r'\1' + inject,
                            text,
                            count=1,
                            flags=re.IGNORECASE,
                        )
                    else:
                        text = inject + text

                    raw_body = text.encode('utf-8')
                    content_type = 'text/html; charset=utf-8'

                self.send_response(status)
                skip_headers = STRIP_HEADERS.union({
                    'content-type',
                    'content-length',
                    'transfer-encoding',
                    'connection',
                    'content-encoding'
                })
                for k, v in resp.headers.items():
                    if k.lower() not in skip_headers:
                        self.send_header(k, v)
                self.send_header('Content-Type', content_type)
                self.send_header('Content-Length', str(len(raw_body)))
                self.end_headers()
                self.wfile.write(raw_body)
        except urllib.error.HTTPError as e:
            err_body = e.read() if hasattr(e, 'read') else str(e).encode('utf-8')
            self.send_response(e.code)
            self.send_header('Content-Type', 'text/html; charset=utf-8')
            self.end_headers()
            self.wfile.write(err_body)
        except Exception as e:
            msg = f'<html><body style="background:#0d111a;color:#e2e8f0;font-family:sans-serif;padding:24px;"><h3>Unable to load {target_url}</h3><p>{str(e)}</p></body></html>'.encode('utf-8')
            self.send_response(502)
            self.send_header('Content-Type', 'text/html; charset=utf-8')
            self.send_header('Content-Length', str(len(msg)))
            self.end_headers()
            self.wfile.write(msg)


class ThreadedHTTPServer(socketserver.ThreadingMixIn, http.server.HTTPServer):
    daemon_threads = True
    allow_reuse_address = True


if __name__ == '__main__':
    with ThreadedHTTPServer(('', PORT), ProxyHTTPRequestHandler) as httpd:
        print(f'Serving AeroOS with proxy and AI bridge on http://localhost:{PORT}')
        httpd.serve_forever()
