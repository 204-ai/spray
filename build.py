#!/usr/bin/env python3
"""Build index.html from src/.

The app ships as one page plus vendor/three.min.js. Everything in src/ is inlined:
style.css, body.html, model.js (the spray can mesh and label texture) and the app scripts,
which run in order inside one closure.

  python3 build.py           write index.html
  python3 build.py --check   exit 1 if index.html is out of date (used by CI)
"""
import pathlib, sys

ROOT = pathlib.Path(__file__).resolve().parent
SRC = ROOT / 'src'
PARTS = ['a1_core.js', 'a2_materials.js', 'a3_walls.js', 'a4_paint.js', 'a5_guide.js', 'a6_auto.js',
         'a7_input.js', 'a8_ui.js', 'a9_extras.js', 'a11_store.js', 'a10_boot.js']

CSP = ("default-src 'self'; "
       "script-src 'self' 'unsafe-inline' 'wasm-unsafe-eval' https://cdn.jsdelivr.net; "
       "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; "
       "font-src https://fonts.gstatic.com; "
       "img-src 'self' data: blob:; media-src 'self' blob: mediastream:; "
       "connect-src 'self' data: blob: https://cdn.jsdelivr.net https://storage.googleapis.com; "
       "worker-src 'self' blob:; object-src 'none'; base-uri 'none'; form-action 'none'")


def build():
    version = (ROOT / 'VERSION').read_text().strip()
    read = lambda name: (SRC / name).read_text()
    app = '\n'.join(read(p) for p in PARTS)
    body = read('body.html').replace('{{VERSION}}', version)
    fail = ("document.body.insertAdjacentHTML('beforeend','<div id=\"err\"><div><div class=\"logo\">SPRAY</div>"
            "<p>The 3D engine could not load. Reload the page to try again.</p></div></div>');")
    return f'''<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta http-equiv="Content-Security-Policy" content="{CSP}">
<title>Spray - JAS.BLACK</title>
<meta name="description" content="A 3D graffiti wall studio in the browser: real spray caps, paint markers, image guides, auto paint and time-lapse export.">
<meta name="theme-color" content="#121314">
<meta property="og:title" content="Spray - JAS.BLACK">
<meta name="twitter:title" content="Spray - JAS.BLACK">
<meta property="og:description" content="Paint a yard of walls, one can at a time.">
<meta property="og:image" content="https://spray.jas.black/og.png">
<meta property="og:url" content="https://spray.jas.black/">
<meta name="twitter:card" content="summary_large_image">
<link rel="icon" href="favicon.svg" type="image/svg+xml">
<link rel="icon" href="favicon-32.png" sizes="32x32" type="image/png">
<link rel="apple-touch-icon" href="apple-touch-icon.png">
<link rel="manifest" href="site.webmanifest">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Archivo:wght@800&family=IBM+Plex+Mono:wght@400;500;600&display=swap">
<style>
{read('style.css')}</style>
</head>
{body}
<script src="vendor/three.min.js"></script>
<script>
{read('model.js')}</script>
<script>
(function(){{
if (!window.THREE) {{ {fail} return; }}
{app}
}})();
</script>
</body>
</html>
'''


if __name__ == '__main__':
    out = ROOT / 'index.html'
    html = build()
    if '--check' in sys.argv:
        if not out.exists() or out.read_text() != html:
            sys.exit('index.html is out of date: run python3 build.py and commit the result.')
        print('index.html is up to date.')
    else:
        out.write_text(html)
        print(f'wrote {out.name} ({len(html) // 1024} KB)')
