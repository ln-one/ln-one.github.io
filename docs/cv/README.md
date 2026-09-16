# Automatically generated CV

The website and CV share identity and profile links in `_config.yml`, education
and research interests in `_data/profile.yml`, and papers in `assets/ref.bib`.
`cv_summary` optionally supplies concise CV wording; otherwise `summary` is used.
The approved RenderCV design lives in `docs/cv/design.yaml`.

Install the isolated PDF builder once:

```sh
uv tool install 'rendercv[full]==2.8'
```

Then run `npm run cv` to generate just the PDF, or `npm run build` to generate
both the CV and site. `npm run dev` generates the CV before starting Jekyll;
while it is running, rerun `npm run cv` after updating CV data. The deployment
and PR workflows install the pinned builder and regenerate the PDF before Jekyll.

Generated input, PDF and PNG previews are under `output/pdf/`. The PDF is copied
to `papers/Chunran_Zhang_CV.pdf` for Jekyll. Neither generated directory content
nor the published PDF is committed. Only the PDF is published, not its input or
previews. About provides the sole labeled View CV link, opening the PDF in the browser
without forcing a download. All internal links support a site base path.

Paper ordering follows descending year/month, preserving BibTeX source order
for ties (currently ONJO, DiBud, DESA, EAHR). BibTeX names are parsed using the
existing bibtex-ruby dependency, not split with regular expressions. Missing
code links are omitted. If a paper is no longer marked as a preprint, generation
stops so its new status can be assigned an appropriate CV section explicitly.

Identity, education, and paper provenance is documented in
`docs/CONTENT_SOURCES.md`. No precise major, grades, awards, or research experience
has been inferred. July 2027 remains expected graduation.

## Typography

The reading-focused layout uses EB Garamond 27 pt for the name and Source Sans 3
11 pt for body text, with 12.5 pt section headings. Margins are 2 cm. Dark body
text and muted blue links/headings retain contrast on white. Author lists occupy their own line and wrap naturally for multiple authors.
Paper and code links follow on a separate line; extra space separates papers
and major sections.

Design references (consulted 2026-09-16):
- https://www.ox.ac.uk/careers/careers-guidance/job-search-and-applications/writing-applications/cvs
- https://practicaltypography.com/line-spacing.html
- https://practicaltypography.com/line-length.html

These are guidelines, not a mandated academic template. Keep text selectable,
links functional, and inspect the full rendered PDF after future content changes.
