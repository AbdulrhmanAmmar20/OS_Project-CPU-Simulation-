#!/usr/bin/env python3
"""Simple dev server for OS-Quest. Run from the project root."""
import http.server, socketserver, os, webbrowser

PORT = 8080
os.chdir(os.path.join(os.path.dirname(__file__), 'public'))

Handler = http.server.SimpleHTTPRequestHandler
Handler.extensions_map.update({'.wasm': 'application/wasm'})

with socketserver.TCPServer(('', PORT), Handler) as httpd:
    url = f'http://localhost:{PORT}'
    print(f'OS-Quest running at {url}')
    print('Press Ctrl+C to stop.')
    webbrowser.open(url)
    httpd.serve_forever()
