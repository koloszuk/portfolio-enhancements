"""Build a static, versioned Pages release using only Python's standard library."""
import hashlib
import json
from pathlib import Path
import shutil

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'dist'


def build():
    inputs = []
    for folder in ('css', 'js', 'assets/hover'):
        inputs.extend(p for p in (ROOT / folder).rglob('*')
                      if p.is_file() and not p.name.startswith('.')
                      and p.suffix.lower() != '.md')
    inputs.sort()
    digest = hashlib.sha256()
    for path in inputs:
        digest.update(path.relative_to(ROOT).as_posix().encode())
        digest.update(b'\0')
        digest.update(path.read_bytes())
        digest.update(b'\0')
    release = digest.hexdigest()[:12]
    # Only remove generated output; never touch source folders.
    if OUT.exists():
        shutil.rmtree(OUT)
    target = OUT / 'releases' / release
    for path in inputs:
        destination = target / path.relative_to(ROOT)
        destination.parent.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(path, destination)
    shutil.copyfile(ROOT / 'js/loader.js', OUT / 'loader.js')
    (OUT / '.nojekyll').touch()
    (OUT / 'release.json').write_text(json.dumps({'release': release}) + '\n')
    (OUT / 'index.html').write_text('''<!doctype html>
<html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width">
<title>Daniel Rodrigues · Code deployment</title>
<style>body{font:18px system-ui;max-width:48rem;margin:4rem auto;padding:1rem}code{overflow-wrap:anywhere}</style>
<h1>Portfolio code deployment</h1><p>This hosts external enhancements for the Cargo portfolio.</p>
<p id="status">Checking loader…</p><script defer src="./loader.js"></script>
<script>const check=setInterval(()=>{const s=window.danPortfolio;if(s){document.getElementById('status').textContent=JSON.stringify(s);if(s.state==='ready'||s.state==='error')clearInterval(check)}},250);setTimeout(()=>clearInterval(check),15000)</script>
</html>''')
    assert (target / 'js/main.js').is_file()
    assert (target / 'css/main.css').is_file()
    assert not (OUT / 'Layout_references').exists()
    assert not (target / 'assets/Projects').exists()
    print(f'Built release {release}: {len(inputs)} files in dist/')


if __name__ == '__main__':
    build()
