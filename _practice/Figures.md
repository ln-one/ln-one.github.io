## Tools

Codex edits `.drawio` sources with drawio-skill and exports SVG/PDF through the draw.io CLI. The editable source allows manual fine-tuning in draw.io. Data plots use Python + Matplotlib. Sources stay in Git; exports are regenerated and inspected after changes.

## Colors

- Use [Paul Tol’s color schemes](https://sronpersonalpages.nl/~pault/): Vibrant for categorical, YlOrBr for sequential, BuRd for diverging data.
- Choose colors by meaning and intuitive association, then check their separation. Mappings stay consistent within each paper, with markers or line styles alongside color.

## Appearance

- Keep diagrams restrained and concise, using rounded rectangles sparingly. Mechanisms are shown through meaningful shapes, spatial relationships, and small visual examples, with short labels.

- Use draw.io’s automatic SVG themes (`--theme auto --transparent`), keeping canvases transparent and useful fills intact.
