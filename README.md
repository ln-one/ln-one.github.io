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
