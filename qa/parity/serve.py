"""Serves one build with the QA harness injected, and collects traces.

    python serve.py <build dir> <port>
"""
import http.server
import os
import sys
import urllib.parse

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(sys.argv[1])
PORT = int(sys.argv[2])
TRACES = os.path.join(HERE, 'traces')
os.makedirs(TRACES, exist_ok=True)


class Handler(http.server.SimpleHTTPRequestHandler):
    extensions_map = {
        **http.server.SimpleHTTPRequestHandler.extensions_map,
        '.html': 'text/html; charset=utf-8',
        '.js': 'application/javascript; charset=utf-8',
    }

    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=ROOT, **kwargs)

    def log_message(self, *args):
        pass

    def do_GET(self):
        path = urllib.parse.urlparse(self.path).path
        if path == '/__qa.js':
            return self._send(open(os.path.join(HERE, 'qa.js'), 'rb').read(), 'application/javascript; charset=utf-8')
        if path in ('/', '/index.html'):
            html = open(os.path.join(ROOT, 'index.html'), encoding='utf-8').read()
            html = html.replace('<head>', '<head><script src="/__qa.js"></script>', 1)
            return self._send(html.encode('utf-8'), 'text/html; charset=utf-8')
        return super().do_GET()

    def do_POST(self):
        query = urllib.parse.parse_qs(urllib.parse.urlparse(self.path).query)
        name = query.get('name', ['trace'])[0]
        body = self.rfile.read(int(self.headers.get('Content-Length', 0)))
        with open(os.path.join(TRACES, name + '.json'), 'wb') as f:
            f.write(body)
        self._send(b'ok', 'text/plain')

    def _send(self, data, kind):
        self.send_response(200)
        self.send_header('Content-Type', kind)
        self.send_header('Content-Length', str(len(data)))
        self.send_header('Cache-Control', 'no-store')
        self.end_headers()
        self.wfile.write(data)


http.server.ThreadingHTTPServer(('127.0.0.1', PORT), Handler).serve_forever()
