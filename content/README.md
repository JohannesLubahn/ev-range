# content/

The site's text pages, bundled into the app at build time (the dev server reloads when a file changes).
Code: `src/content/` (reading), `src/pages/Notes.tsx`, `src/components/KnownIssues.tsx`, `src/pages/Legal.tsx`,
`src/components/Footer.tsx`.

| Where | File | Route |
| --- | --- | --- |
| Notes tab (after Assumptions): Personal notes | `notes/*.md`, one file per note | `#notes` |
| Notes tab, after the notes: Version Tracker | `versions.csv` | `#notes` |
| Notes tab, at the bottom: Known issues | `known_issues.csv` | `#notes` (`#known-issues` jumps there) |
| Legal notice, linked from the footer of every page | `legal.md` | `#legal` (`#impressum` still opens it) |

## known_issues.csv

One row per issue. Columns:

- `id`: short, unique (e.g. `petrol-low-speed`)
- `status`: `open`, `fixed` or `wontfix` (anything else is shown as open, with a warning)
- `area`: where it shows (a page name such as Stress tests, or a part of the model such as Petrol engine)
- `title`: one line
- `details`: a few sentences; inline Markdown works (bold, italic, `code`, links). Use quotes if it contains commas.
- `added`, `resolved`: dates as `YYYY-MM-DD`

Open issues are listed; fixed and won't-fix ones fold away under "Closed".

## versions.csv

One row per release, shown as a table in file order (add new versions at the bottom). Columns: `version` (e.g.
`R1`), `date` (as written, e.g. `22.11.2026`), `description` (inline Markdown works; quote it if it contains
commas), `author` (initials).

## notes/

One Markdown file per note, named `YYYY-MM-DD-short-name.md`. The first `# ` heading is the title; the date comes
from the file name; newest first. Files starting with `_` (like `_template.md`) are not shown.

## legal.md

Markdown; its `# Legal notice` heading is the page title. Written for visitors anywhere, so it names no country's law.

## Markdown

A small subset (`src/content/markdown.ts`): `#`/`##`/`###` headings, paragraphs, `-` and `1.` lists, `>` quotes,
`---` rules, **bold**, *italic*, `code` and `[links](https://...)` (http, https, mailto and `#page` links only).
HTML comments are hidden; other HTML shows as plain text.
