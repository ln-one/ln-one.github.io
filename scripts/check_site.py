"""Check built internal links, assets, publication records and demo removal."""
from html.parser import HTMLParser
from pathlib import Path
from urllib.parse import urlsplit, unquote
root = Path('_site')
assert (root / 'index.html').exists(), 'Run npm run build first'
errors = []
class Links(HTMLParser):
    def handle_starttag(self, tag, attrs):
        a = dict(attrs)
        for key in ('href', 'src'):
            value = a.get(key, '')
            url = urlsplit(value)
            if not value or url.scheme or url.netloc or value.startswith('#'): continue
            target = root / unquote(url.path.lstrip('/')) if url.path.startswith('/') else self.file.parent / unquote(url.path)
            if not target.exists(): errors.append(f'{self.file}: missing {value}')
for file in root.rglob('*.html'):
    parser = Links(); parser.file = file
    text = file.read_text(); parser.feed(text)
    for demo in ('Richard Feynman', 'Nobel Prize', 'California Institute of Technology'):
        if demo in text: errors.append(f'{file}: demo content {demo}')
for route in ('index.html', 'publications/index.html'):
    html = (root / route).read_text()
    for identifier in ('2608.15851', '2608.07152'):
        if f'https://arxiv.org/abs/{identifier}' not in html: errors.append(f'{route}: missing {identifier}')
for private in ('AGENTS.md', 'MIGRATION.md', 'CONTENT_SOURCES.md', 'package.json', 'scripts'):
    if (root/private).exists(): errors.append(f'Build exposes {private}')
if errors: raise SystemExit('\n'.join(errors))
print('Passed: internal links/assets, both preprints, demo removal, and source-file exclusions.')
