# Chunran Zhang

Personal academic website · [ln-one.github.io](https://ln-one.github.io/)

Built with Jekyll and Jekyll Scholar. Requires Ruby 3.4+ and Bundler.

```sh
bundle install
npm run dev      # http://127.0.0.1:4321/
npm run build
npm run check
```

Based on [academic-website-template](https://github.com/sbryngelson/academic-website-template) ([MIT](LICENSE)). Personal logo by ln1 (Evan Chronis), licensed separately under CC BY-NC-SA; see [SVG notice](images/logo.svg).

### CV generation

Builds generate the CV PDF from shared website data using RenderCV 2.8.
Install once with `uv tool install 'rendercv[full]==2.8'`. Run `npm run cv`
to refresh only the CV; `npm run build` and CI regenerate it automatically.
See [CV maintenance](docs/cv/README.md) for editable sources and preview paths.

### Machine-readable content

`_plugins/machine_readable.rb` generates `/profile.md` (complete public profile
and research works) and `/llms.txt` (source guide) during every Jekyll build.
Biography comes from rendered About content; identity, education and works use
the same config, profile data and BibTeX as the website. No separate facts need
maintenance. The footer and HTML alternate link expose the Markdown view.
JSON-LD describes the person on all pages and full research works on Publications.
Author order is preserved; only the owner's matching name is linked to their
identity. No author affiliations, exact submission dates or acceptance statuses
are inferred. These files aid reading; discovery and AI citation are not guaranteed.
`npm run check` validates generated JSON-LD and Markdown consistency.
