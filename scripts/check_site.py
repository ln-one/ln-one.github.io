"""Check built internal links, assets, publication records and demo removal."""
import json
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
for route in ('practice', 'practice/workflow', 'practice/figures', 'practice/standards'):
    page = root / route / 'index.html'
    assert page.is_file(), f'Missing {route}'
    assert '[[' not in page.read_text(), f'Unresolved wiki link in {route}'
practice = (root / 'practice/index.html').read_text()
for heading in ('workflow', 'figures', 'standards'):
    assert f'<h2 id="{heading}">' in practice
    assert f'href="#{heading}"' in practice
for heading in ('tools', 'colors', 'appearance'):
    assert f'<h3 id="{heading}">' in practice
for private in ('AGENTS.md', 'MIGRATION.md', 'CONTENT_SOURCES.md', 'package.json', 'scripts', '_practice'):
    if (root/private).exists(): errors.append(f'Build exposes {private}')
# Search results must lead to real pages and publication anchors.
search_records = json.loads((root / 'assets/search.json').read_text())
publication_records = [item for item in search_records if item.get('kind') == 'publication']
if len(publication_records) < 2:
    errors.append('Search index is missing publication records')
class Anchors(HTMLParser):
    def __init__(self):
        super().__init__(); self.ids = set()
    def handle_starttag(self, tag, attrs):
        identifier = dict(attrs).get('id')
        if identifier: self.ids.add(identifier)
for item in search_records:
    url = urlsplit(item['url'])
    target = root / unquote(url.path.lstrip('/'))
    if target.is_dir(): target = target / 'index.html'
    if not target.is_file():
        errors.append(f"Search index: missing {item['url']}")
    elif url.fragment:
        parser = Anchors(); parser.feed(target.read_text())
        if unquote(url.fragment) not in parser.ids:
            errors.append(f"Search index: missing anchor {item['url']}")
if errors: raise SystemExit('\n'.join(errors))
print('Passed: internal links/assets, both preprints, demo removal, source-file exclusions, and search destinations.')
