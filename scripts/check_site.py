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
for key, identifier in (('dibud', '2609.15143'), ('opacity', '2609.14971'), ('desa', '2608.15851'), ('eahr', '2608.07152')):
    home = (root / 'index.html').read_text()
    publications = (root / 'publications/index.html').read_text()
    anchor = f'pub-zhang2026{key}'
    if f'/publications/#{anchor}' not in home:
        errors.append(f'Homepage: missing work link {anchor}')
    if f'id="{anchor}"' not in publications or f'https://arxiv.org/abs/{identifier}' not in publications:
        errors.append(f'Publications: missing {identifier} or its anchor')
assert not (root / 'practice').exists(), 'Unpublished Practice output must not be generated'
for public_file in (root / 'index.html', root / 'assets/search.json', root / 'sitemap.xml'):
    assert '/practice' not in public_file.read_text(), f'Practice still exposed in {public_file}'
for private in ('AGENTS.md', 'MIGRATION.md', 'CONTENT_SOURCES.md', 'docs', 'assets/citesty.csl', 'package.json', 'scripts', '_practice', 'output'):
    if (root/private).exists(): errors.append(f'Build exposes {private}')
assert (root / 'papers/Chunran_Zhang_CV.pdf').read_bytes().startswith(b'%PDF-'), 'CV download must be a PDF'
# Search results must lead to real pages and publication anchors.
search_records = json.loads((root / 'assets/search.json').read_text())
publication_records = [item for item in search_records if item.get('kind') == 'publication']
if len(publication_records) < 4:
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
print('Passed: internal links/assets, all four preprints, demo removal, source-file exclusions, and search destinations.')
