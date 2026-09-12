# Academic Website Agent Instructions

## Project Overview

This is Chunran Zhang's English personal academic website, based on
[sbryngelson/academic-website-template](https://github.com/sbryngelson/academic-website-template).
It builds a static site with **Jekyll 4.4**, **Jekyll Scholar 7.3**, Liquid,
Markdown, SCSS, selected Bootstrap 5.3 styles, and vanilla JavaScript.

The project has migrated from AstroWind. Do not apply the old Astro, Tailwind,
TypeScript, MDX, or Sharp workflows. See `MIGRATION.md` for the previous workspace
backup and `README.md` for current setup instructions.

## Code Search

<!-- CODEGRAPH_START -->
### CodeGraph

In repositories indexed by CodeGraph (a `.codegraph/` directory exists at the repo root), reach for it BEFORE grep/find or reading files when you need to understand or locate code:

- **MCP tool** (when available): `codegraph_explore` answers most code questions in one call — the relevant symbols' verbatim source plus the call paths between them, including dynamic-dispatch hops grep can't follow. Name a file or symbol in the query to read its current line-numbered source. If it's listed but deferred, load it by name via tool search.
- **Shell** (always works): `codegraph explore "<symbol names or question>"` prints the same output.

If there is no `.codegraph/` directory, skip CodeGraph entirely — indexing is the user's decision.
<!-- CODEGRAPH_END -->

### ast-grep

`ast-grep` is installed for syntax-aware, tree-sitter structural search and rewrites.

- Use **CodeGraph** for symbol definitions, signatures, callers/callees, dependency graphs, and change impact.
- Prefer **ast-grep** for repeated code-shape questions, API usage patterns, structural conventions, and guarded migrations where supported by its parser.
- Use **rg** for literal text, configuration, Liquid/Markdown text, logs, comments, and exact strings.
- Before a broad API migration or anti-pattern cleanup, run an ast-grep pattern to measure and inspect candidates.
- Preview rewrite matches before applying changes, then validate affected files with available project checks. Do not use ast-grep to infer call graphs or blast radius.

## Local Development

Requires Ruby and Bundler; the documented local baseline is Ruby 3.4+.
CI tests Ruby 3.4 and 4.0, and deployment uses Ruby 4.0.
Python 3 is required for the local site checker. npm is only a command wrapper;
there are no Node package dependencies to install.

```sh
export PATH="/opt/homebrew/opt/ruby/bin:$PATH" # Homebrew Ruby on Apple Silicon
bundle install
```

| Command | Purpose |
| --- | --- |
| `npm run dev` | Serve at `http://127.0.0.1:4321/` |
| `npm run build` | Build with strict front matter into `_site/` |
| `npm run check` | Check the already-built `_site/` with `scripts/check_site.py` |

`scripts/jekyll.sh` selects Homebrew Ruby when available, then runs
`bundle exec jekyll`. There are no `preview` or `fix` npm scripts.
Restart the development server after changing `_config.yml`.

## Architecture and Editing Locations

| Path | Responsibility |
| --- | --- |
| `_config.yml` | Identity, links, navigation, accent color, site URL, Scholar, plugins, build exclusions |
| `_pages/home.md` | Homepage introduction and selected preprints |
| `_pages/about.md` | Education and contact details |
| `_pages/publications.md` | Full publication list and filter |
| `_pages/allnews.md` | News archive |
| `_pages/404.md` | Not-found page |
| `_data/news.yml` | News entries, newest first; `archived: true` hides old updates from home |
| `_data/pi.yml` | Optional short education details consumed by the desktop sidebar |
| `assets/ref.bib` | Publication metadata, summaries, selection, and resource links |
| `_layouts/` | Page layouts, `research-card` for mobile homepage cards, and `bibtemplate` for full citations |
| `_includes/` | Head metadata, navigation, sidebar, footer, SVG icons, analytics, and optional math |
| `assets/main.scss` | SCSS entry point and selected Bootstrap imports |
| `_sass/base/` | Fonts, design variables, typography, reset, and icons |
| `_sass/components/`, `_sass/layouts/`, `_sass/utilities/` | Site styling, responsive layout, dark mode, and print styles |
| `assets/js/site.js` | Mobile menu, theme toggle, publication filtering, BibTeX, and site search |
| `_plugins/` | Ruby extensions, Markdown support, and search-index generation |
| `assets/fonts/` | Self-hosted fonts and their licenses |
| `images/`, `papers/` | Site images and optional local PDFs |
| `scripts/` | Jekyll wrapper and generated-site validation |

`_site/` and `.jekyll-cache/` are generated output; edit their source files instead.
Treat `vendor/` as installed dependencies and `_sass/bootstrap/` as vendored styles.
The `_posts/` directory exists, but currently contains no blog posts. Other template
data files are optional; do not add empty sections merely to use them.

## Implementation Conventions

- Use YAML front matter (`title`, `layout`, `permalink`) and Liquid for pages.
  The homepage uses `homelay`; ordinary pages use `page`.
- Generate internal links with `relative_url` and canonical/social URLs with
  `absolute_url` so the site also works under a base path.
- Use `markdown="1"` when Markdown must render inside HTML containers and
  `markdown="0"` for markup that should remain HTML.
- Reuse CSS custom properties in `_sass/base/_variables.scss` and existing
  components. Configure the accent in `_config.yml`.
- Dark mode uses `data-bs-theme` on the document element and a saved `theme`
  preference. Bootstrap JavaScript is not loaded; interactions live in `site.js`.
- Reuse the inline SVG sprite through `_includes/icon.html`. Give icon-only
  controls accessible names and keep keyboard navigation usable.
- Images are static assets, without an automatic Astro image pipeline. Supply
  useful alt text, dimensions, and appropriately sized files.
- Keep existing font licenses, `LICENSE`, and template attribution in `README.md`.
  The owner has removed the visible footer credit; do not reintroduce it. The personal logo has
  separate licensing documented in `README.md`; do not treat it as MIT artwork.

## Academic Content and Publications

- Consult `CONTENT_SOURCES.md` before changing biographical or research claims.
  Use owner-provided information and verified sources; do not infer awards,
  citation counts, acceptance status, or unspecified education details.
- Current research interests are information retrieval, data mining, and
  artificial intelligence. The two current manuscripts are labeled as preprints.
  Update status only when supported by new evidence.
- Maintain publication records in `assets/ref.bib`. The homepage selects
  `selected = {true}` entries: desktop uses full citations and mobile uses
  `research-card`. The publications page retains full citations. `acronym`
  provides the short card label.
- News uses `short_headline` on the homepage when supplied; the archive keeps
  every entry with its full `headline`.
- `_layouts/bibtemplate.html` renders summaries, resource links, and expandable
  BibTeX/abstract blocks. `scholar.last_name` and `scholar.first_name` control
  owner-name highlighting; `bibtex_skip_fields` excludes template-only fields.
- `file` refers to a PDF in `papers/`; `arxiv` stores an identifier. Fields such as
  `code`, `slides`, `video`, `poster`, and `data` contain resource URLs.
- Keep missing optional links blank. Add CV or other credentials only when the
  corresponding material is available.

## Verification

After changes, run `npm run build` followed by `npm run check`.
The checker validates built internal links/assets, both current preprints,
demo-content removal, and source-file exclusions. It does not replace browser
checks, validate external destinations, or run Astro, ESLint, or Prettier.

For changes affecting rendered content, styles, or interactions, also inspect:

- Homepage, About, and Publications at desktop and mobile widths.
- Light/dark themes, mobile navigation, and visible keyboard focus.
- Relevant search/filter behavior, BibTeX expansion/copy, and affected links.

Documentation-only changes require review of the diff and referenced paths;
no browser check is needed when rendered output is unaffected. Report any checks
that could not be completed. Do not claim visual verification from a build alone.

## Deployment

`.github/workflows/deploy.yml` builds and deploys pushes to `main` through GitHub
Actions, with production `url` and `baseurl` supplied by GitHub Pages settings.
The configured production URL is `https://ln-one.github.io/`.
PR CI separately builds and runs HTMLProofer for internal links.
Both workflows rasterize favicon assets during their builds.

A push to `main` triggers publication; do not push solely to preview a local edit.
Keep internal documentation and tooling excluded in `_config.yml`, including
`AGENTS.md`, `MIGRATION.md`, `CONTENT_SOURCES.md`, `package.json`, and `scripts/`.

## Practice

Edit `_practice/` Markdown; Jekyll renders it under `/practice/`. Before edits, run
`python3 /Users/ln1/Projects/writing-sync-pilot/sync.py practice --check`; sync if different.
Sync once after edits. Preserve conflicts; never force. Work directly on `main`.
Publishing still requires a user request.
