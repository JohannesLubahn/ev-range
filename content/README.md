# content/

The site's text pages. They are linked from the footer of every page and bundled into the app at build time
(the dev server reloads when a file changes). Code: `src/content/` (reading), `src/pages/KnownIssues.tsx`,
`Notes.tsx`, `Impressum.tsx`, `src/components/Footer.tsx`.

| Page | File | Route |
| --- | --- | --- |
| Known issues | `known_issues.csv` | `#known-issues` |
| Notes | `notes/*.md`, one file per note | `#notes` |
| Impressum | `impressum.md` | `#impressum` |

## known_issues.csv

One row per issue. Columns:

- `id`: short, unique (e.g. `petrol-low-speed`)
- `status`: `open`, `fixed` or `wontfix` (anything else is shown as open, with a warning)
- `area`: where it shows (a page name such as Stress tests, or a part of the model such as Petrol engine)
- `title`: one line
- `details`: a few sentences; inline Markdown works (bold, italic, `code`, links). Use quotes if it contains commas.
- `added`, `resolved`: dates as `YYYY-MM-DD`

Open issues are listed first; fixed and won't-fix ones fold away under "Closed".

## notes/

One Markdown file per note, named `YYYY-MM-DD-short-name.md`. The first `# ` heading is the title; the date comes
from the file name; newest first. Files starting with `_` (like `_template.md`) are not shown.

## impressum.md

Markdown; its `# Impressum` heading is the page title.

## Markdown

A small subset (`src/content/markdown.ts`): `#`/`##`/`###` headings, paragraphs, `-` and `1.` lists, `>` quotes,
`---` rules, **bold**, *italic*, `code` and `[links](https://...)` (http, https, mailto and `#page` links only).
HTML comments are hidden; other HTML shows as plain text.
