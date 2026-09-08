"""Dependency-free Python function, used to isolate runtime problems.

When /api/predict-passes hangs it is ambiguous whether the fault is the Vercel Python
runtime, the routing, the handler pattern, or skyfield. This function shares the first
three and has none of the fourth, so comparing the two answers that question in one deploy
instead of several.

Kept in the repo deliberately: the next time a Python function misbehaves, this is the
control that says whether the platform or our code is at fault.
"""

import json
import sys
from http.server import BaseHTTPRequestHandler


class handler(BaseHTTPRequestHandler):
    def do_GET(self) -> None:
        body = json.dumps({
            'ok': True,
            'runtime': 'python',
            'version': sys.version.split()[0],
        }).encode('utf-8')
        self.send_response(200)
        self.send_header('Content-Type', 'application/json')
        self.send_header('Content-Length', str(len(body)))
        self.send_header('Cache-Control', 'no-store')
        self.end_headers()
        self.wfile.write(body)

    def log_message(self, format, *args) -> None:
        pass
