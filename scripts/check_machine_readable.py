"""Validate generated public machine-readable views and their HTML discovery."""
import json
import re
from pathlib import Path
from html.parser import HTMLParser

root = Path('_site')
class StructuredData(HTMLParser):
    def __init__(self):
        super().__init__(); self.capture = False; self.blocks = []; self.current = ''
    def handle_starttag(self, tag, attrs):
        if tag == 'script' and dict(attrs).get('type') == 'application/ld+json':
            self.capture = True; self.current = ''
    def handle_data(self, data):
        if self.capture: self.current += data
    def handle_endtag(self, tag):
        if tag == 'script' and self.capture:
            self.blocks.append(json.loads(self.current)); self.capture = False

for path in root.rglob('*.html'):
    parser = StructuredData(); parser.feed(path.read_text())
    for block in parser.blocks:
        assert block['@graph'][0]['@type'] == 'Person', path
parser = StructuredData(); parser.feed((root/'publications/index.html').read_text())
articles = [x for b in parser.blocks for x in b['@graph'] if x['@type'] == 'ScholarlyArticle']
markdown = (root/'profile.md').read_text()
guide = (root/'llms.txt').read_text()
assert markdown.startswith('# Chunran Zhang\n')
assert 'Studying computer science, with interests in cognition and philosophy.' in markdown and 'I read' in markdown
assert '{{' not in markdown and '<script' not in markdown
assert len(articles) == len(re.findall(r'^### ', markdown, re.M)) >= 4
for article in articles:
    assert article['name'] in markdown
    assert article['creativeWorkStatus'] in markdown
    assert article['author']
    assert article['url'] in markdown
    for author in article['author']:
        assert '@id' in author or author.get('name')
assert '/profile.md' in guide
assert '/profile.md' in (root/'about/index.html').read_text()
assert '/practice/' not in markdown + guide
print('Passed: valid JSON-LD, complete works, authors/status, biography, and discovery links.')
