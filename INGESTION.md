# Importing knowledge

Open **Import** in the sidebar. Choose files, inspect the extracted sources, select a destination brain, and save selected items. Duplicate detection uses trimmed text hashes within the selection and within the destination brain. The backend enforces deduplication again when saving.

Supported inputs:

- ChatGPT `conversations.json`: unzip the export first. Each conversation follows its active branch, retaining speaker labels and available dates. Attachments and system/tool messages are omitted with a warning.
- Markdown and TXT: preserves body text, filename, modification date, and simple Markdown frontmatter dates. Large documents become numbered parts.
- PDFs with selectable text: one source per page, with page references. Large pages become parts. Scanned PDFs need OCR, which is not connected. Original PDF bytes are not stored; keep the original file.
- Continuum prepared import JSON: download selected sources from the preview and reopen them later.

Limits: 20 MB per file, 30 files per selection, 1,500 staged sources, 1,200 pages per PDF. Individual text parts are at most 60,000 characters.

Staging is browser memory only. Leaving this view or refreshing clears unsaved items. Download a prepared import to retain them. Files are parsed in the browser; saving sends selected extracted text and metadata to the local service. A partially interrupted save can be retried without duplicating sources.

The saved-source status tracks the initial source scan. Subsequent connection analysis and reflection appear in Activity. Saving any items locks the batch to its destination; clear staging to start a batch for another brain.

## Local and hosted behavior

Run `python run.py` from this directory for the local UI and persistent SQLite service. Local saves enqueue source processing and preserve provenance in `data/brain.db`.

The Vercel interface supports file preview and prepared downloads, but cloud saving remains unavailable until the hosted backend, authentication, and storage are configured. It does not upload notes to Supabase automatically.

## Verification

`python -m unittest discover -s backend -v` covers scoped imports, deduplication, metadata, forks, restart persistence, and the real HTTP import-to-worker path. `node --test tests/*.test.mjs` covers conversation branches, Markdown, document splitting, duplicates, actual PDF extraction, and empty PDF handling, alongside the graph motion tests.
