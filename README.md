# Chunran Zhang — academic website

English personal academic website based on [sbryngelson/academic-website-template](https://github.com/sbryngelson/academic-website-template), licensed under MIT. Built with Jekyll and Jekyll Scholar.

## Local development

Requires Ruby 3.4+ and Bundler. Ruby 4.0 is used in CI.

```sh
export PATH="/opt/homebrew/opt/ruby/bin:$PATH" # Homebrew Ruby on Apple Silicon
bundle install
npm run dev
```

Preview: http://127.0.0.1:4321/

```sh
npm run build
npm run check
```

The npm commands are convenient wrappers; no Node packages are required. Build runs Jekyll with strict front matter. Check validates built internal links and assets, publication presence, demo removal, and exclusions. The former Astro checks no longer apply after migration.

## Editing

- `_config.yml`: identity, profile links, navigation, colors.
- `_pages/home.md`: introduction and selected preprints.
- `_pages/about.md`: education and contact details.
- `assets/ref.bib`: publication metadata, summaries and links.
- `_data/news.yml`: news.
- `images/portrait.jpg`: profile photograph.
- `CONTENT_SOURCES.md`: source verification and missing information (excluded from publication).

## Deployment

The supplied GitHub Actions workflow builds and deploys pushes to `main`. GitHub repository Settings → Pages must use **GitHub Actions**. The production site is https://ln-one.github.io/.

Old workspace recovery location is recorded in `MIGRATION.md` (excluded from publication). The backup includes prior uncommitted changes.

## Logo

Personal logo by ln1 (Evan Chronis), used under the CC BY-NC-SA terms embedded in the supplied SVG. The original artwork is preserved in `images/logo.svg`; `favicon.svg` uses the same transparent artwork without an added background. The logo license is separate from the template’s MIT license.
