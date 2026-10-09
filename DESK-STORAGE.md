# Desk storage

Each desk connects to a separate user-selected folder. It contains `desk.json` and `assets/`. Attachment paths in JSON are relative to that folder. Assets are content-addressed to avoid overwriting a file referenced by the last successful desk save. Unlinked assets are retained; no automatic destructive cleanup runs.

Capture remains in memory immediately. A browser fallback copy is saved separately under `horixon_desks_local`; the previous `horixon_desks_v2` and prototype keys are never overwritten by this implementation. The fallback still uses browser localStorage and can reach quota, especially with attachments. The UI reports failure and warns before closing unsaved work. It is not a backup.

Connected folders receive debounced writes. Folder access lasts for the current session: after reopening, use **Open existing desk folder** to load the disk copy, or reconnect the current desk to explicitly write the browser copy. Folder writes are serialized in this tab; this is a single-writer design, not a multi-tab or external-editor synchronization protocol. Do not edit the same folder concurrently in other tabs or apps.

New desks receive immutable UUIDs, a separate editable slug and nullable projectId. Existing IDs are retained. Optional intent and desiredOutcome are under Edit desk. No version history or revision fields are added.

ZIP exports snapshot the in-memory desk and all included files without modifying it. Imports validate the manifest and paths, preserve content and custom lanes/statuses, and allocate new desk/thought IDs. Folder opening preserves identity and requires confirmation before replacing an existing browser copy. Limits: 20 MB per attachment, 100 MB package budget. Original local files are copied, not linked. Legacy broken relative image paths require reattaching the original asset; export fails rather than silently omitting it.

## Voice and video recordings

Recordings are too large for the localStorage fallback copy, so each one is stored as a blob in the browser's IndexedDB (`horixon_media`). The desk keeps only a small `idb:<id>` reference in the attachment's `data` field, plus its `mime` and `seconds`. A recording is saved before the card that references it; if that write fails, the user is told and nothing is saved.

- ZIP exports, folder saves and the JSON export resolve every reference back to real bytes first, so packages and folders always contain the actual files.
- ZIP imports and opening a folder move audio and video larger than about 200 KB back into IndexedDB so the desk stays saveable.
- A card whose recording is missing from this browser (for example after site data was cleared) says so; it never pretends the file exists. ZIP export or a connected folder is the real backup.
- Deleting a card or desk does not delete its recording. This matches the no-automatic-destructive-cleanup rule above, so unreferenced recordings can accumulate.
- Limits: voice notes stop at 3 minutes and videos at 2 minutes, which keeps each file under the 20 MB attachment limit. Photos are downscaled to 1600 px JPEGs and stay in the desk data.

## Preferences

Interface preferences are kept in localStorage and are never part of a desk package: the active desk, sidebar width, category list and icons, and the "Group cards by date" setting (`horixon_setting_group_by_date`). Saved data is read after the page loads, so the server render and first client render are identical. If the saved desks cannot be parsed, automatic browser saving stays paused and the original value is left untouched.

`deskContext` provides a local, read-only feed for future AI use. It includes purpose, outcome, thoughts, tags, workflow state and attachment names. There is no AI API call or automatic data transmission.

Tests: `npm test` (runs `scripts/test-desk-package.mjs`) and `npm run build`, or `npm run check` for everything.
