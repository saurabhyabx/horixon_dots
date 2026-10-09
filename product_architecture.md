# Horixon: Product Architecture & Android Build Spec

**Audience:** an Android engineer who will rebuild Horixon natively and match the web app's behaviour,
look and data format exactly.
**Source of truth:** this repository (web app). The appendices (§16–§21) give exact file paths, symbols and line numbers so this document can be read side by side with the code. Every rule below is taken from the code, with the file
named so you can read the original. Where the document recommends something for Android that the web app
does not do, it is marked **Android:**.
**Status of the web app described here:** production build, `npm run check` clean.

---

## 0. How to read this document

| If you need…                         | Read                     |
| ------------------------------------ | ------------------------ |
| What the product is and its rules    | §1, §2                   |
| Screens and navigation               | §3                       |
| Data shapes, defaults, seed data     | §4                       |
| Storage, package format, limits      | §5                       |
| Exact behaviour of every feature     | §6                       |
| Algorithms (dates, patterns, search) | §7                       |
| Colours, type, spacing, motion       | §8 (the design system)   |
| Every user-facing string             | §9                       |
| Accessibility rules                  | §10                      |
| The Android build plan               | §11                      |
| A QA checklist to prove parity       | §12                      |
| Which web file maps to what          | §13, §16, §18            |
| Gaps and open decisions              | §14                      |
| Full repository map and file purposes| §16                      |
| Commands, config, build, deploy      | §17                      |
| Function/line-level code index       | §18                      |
| Stylesheet index and class map       | §19                      |
| Data and control flow diagrams       | §20                      |

Conventions: `code` is a literal value from the source. "Web" means the current React app. Times are
milliseconds unless stated. Colours are given as hex (converted from the web's OKLCH).

---

## 1. Product definition

**Horixon** is a local-first notebook for speed notetaking. A user captures a thought, photo, voice note
or video in one tap, sorts it later, and uses a per-desk dashboard (the Pattern Radar) to see what they
keep coming back to. Tagline used in the UI: _"A notebook with dots"_.

### 1.1 Principles (these decide every ambiguous case)

1. **Capture is instant.** Saving never asks for a type, tag, lane or desk choice. Everything lands in the
   **Inbox**, unsorted. Sorting is optional and happens later, one tap at a time.
2. **Local-first and private.** No accounts, no server persistence, no analytics, no AI calls, no network
   requests by the app itself. Data lives on the device; the user can connect a folder or export a ZIP.
3. **Never lie about saving.** If a write fails, say so. Never show "saved" for a failed write. If saved
   data cannot be read, stop autosaving so the original is never overwritten.
4. **Each desk is an isolated notebook.** A desk owns its thoughts, its custom statuses and lanes, and its
   analytics. Nothing is shared between desks.
5. **One calm screen.** One workspace screen with interactions inside it: filters, views, capture and
   detail are not separate destinations. Chrome stays minimal; secondary controls appear on demand.
6. **Preserve user data.** Legacy data is migrated, never overwritten. Deleting a card never deletes its
   media automatically (no destructive auto-cleanup).

### 1.2 Non-goals (do not build)

No cloud sync, accounts, sharing, collaboration, server, version history, revision fields, AI inference,
or telemetry. Multi-writer sync of the same folder is explicitly unsupported (single-writer design).

### 1.3 Terminology

| Term                  | Meaning                                                                                  |
| --------------------- | ---------------------------------------------------------------------------------------- |
| **Desk**              | An isolated notebook (title, emoji, group, optional purpose/outcome, thoughts).          |
| **Thought / card**    | One note: text, optional photos, optional attachments (audio, video, files), tags.       |
| **Type (category)**   | A label such as Idea or Vision. New cards are **Unsorted**, displayed as **Inbox**.      |
| **Lane**              | A destination column: Inbox, Action, Learning, Knowledge, System (custom per desk).      |
| **Status**            | A lifecycle step: Captured → Prioritized → In Action → Resolved (custom per desk).       |
| **Inbox (the chip)**  | A smart filter: thoughts with no type chosen **or** still in the Inbox lane.             |
| **Stage**             | The live capture panel that opens under the capture bar (voice, photo, video, dictate).  |
| **Pattern Radar**     | The per-desk analytics dashboard.                                                        |
| **Day panel**         | A section holding one calendar day's cards, headed "Today", "Yesterday" or a date.       |

---

## 2. Web → Android overview

The web app is one route (`/`) rendered by one large component (`src/routes/index.tsx`). Android should
split it into screens and composables, but keep the data model, rules and visual language identical.

| Concern             | Web implementation                                  | Android recommendation                                         |
| ------------------- | --------------------------------------------------- | -------------------------------------------------------------- |
| UI                  | React 19, one CSS file                              | Kotlin + Jetpack Compose, custom Material 3 theme (§8, §11)    |
| Desk/thought data   | `localStorage` (one JSON blob)                      | Room (SQLite), same field names                                |
| Media               | IndexedDB blobs, `idb:<uuid>` refs; photos as data URLs | App-private files (`filesDir/media/…`), paths in Room      |
| Preferences         | `localStorage` keys                                 | Jetpack DataStore                                              |
| Disk folder         | File System Access API (`showDirectoryPicker`)      | Storage Access Framework tree URI (persisted permission)       |
| Package export      | ZIP (fflate), `desk.json` + `assets/`               | `java.util.zip`, **identical package format** (§5.3)           |
| PDF export          | HTML → hidden iframe → print dialog                 | Same HTML in a `WebView` → `PrintManager` (§6.10)              |
| Voice/video capture | `MediaRecorder` (WebM/Opus, VP9)                    | `MediaRecorder` / CameraX `VideoCapture` (MP4/AAC)             |
| Dictation           | Browser `SpeechRecognition`                         | Android `SpeechRecognizer` (offline model where available)     |
| Charts              | Hand-written SVG                                    | Compose `Canvas` (same geometry, §6.11)                        |
| Sound               | Web Audio oscillators                               | Synthesised short tones (§8.9)                                 |
| Home-screen widget  | none                                                | Jetpack Glance widget + app shortcuts (§11.7)                  |

**Interoperability requirement:** a ZIP exported on web must import on Android and vice versa. The package
format in §5.3 is the contract.

---

## 3. Information architecture

### 3.1 Screen map

```
Workspace (home)  ───────────────────────────────  the only primary screen
 ├─ Desk list (sidebar on tablet/desktop, drawer on phone)
 ├─ Top bar: desk title · Pattern Radar · Settings · More(⋯)
 ├─ Capture bar + preset pills (+ Stage panel when active)
 ├─ Toolbar: Search · Inbox chip · Filters · Dates · Select · View menu
 ├─ Active-filter chips (only when filters are on)
 ├─ Filters panel (collapsible)
 ├─ Day panels of cards (Grid / List) or Board by lane
 │    └─ Pager (numbered)
 ├─ Selection bar (only in select mode)
 └─ Overlays
      ├─ Card detail (slide-over drawer → Android bottom sheet / full screen)
      ├─ Type picker, Tag picker, Date range popover (small anchored popovers)
      ├─ Settings dialog
      ├─ Create desk / Edit desk dialogs
      ├─ Image lightbox
      └─ Toast (with optional Undo)
Pattern Radar     replaces the notes area (capture bar stays) while open
```

### 3.2 Layout regions (web, 1,400 px wide)

```
┌────────────┬────────────────────────────────────────────────────────┐
│ Sidebar    │ Top bar                                                │
│ 260 px     │ Capture bar                                            │
│ (180–400,  │ Preset pills                       ↵ save · ⇧↵ new line │
│ draggable) │ [search] [Inbox n]            [Filters][Dates][☑][▦ ▾] │
│            │ Day panel: Today ─────────────────────────── 3 notes   │
│ Desk list  │   [card] [card] [card]                                 │
│ grouped    │ Day panel: Yesterday …                                 │
│            │            ‹ 1 2 3 ›   Days 1–7 of 18                  │
└────────────┴────────────────────────────────────────────────────────┘
```

Content width: fluid, left/right padding `clamp(20px, 3vw, 56px)`, ceiling 2,200 px.
Card grid: `repeat(auto-fill, minmax(300px, 1fr))`, gap 12.

### 3.3 Responsive rules (web breakpoints → Android window size classes)

| Web breakpoint | Behaviour                                                                                  | Android analogue                    |
| -------------- | ------------------------------------------------------------------------------------------ | ----------------------------------- |
| ≤ 820 px       | Sidebar becomes a slide-over drawer (closed by default, scrim behind); topbar tightens: desk ID and date hidden, title ellipsised; toolbar wraps; dashboard grid 1 column | Compact width (phone)               |
| ≤ 700 px       | List rows stack vertically; selection bar wraps                                            | Compact                             |
| ≤ 600 px       | Card grid 1 column                                                                         | Compact                             |
| ≤ 900 px       | Card grid 2 columns (legacy rule, superseded by auto-fill)                                 | Medium                              |
| `hover: none`  | Hover-only card controls are always visible, **except** lane-route dots, which are hidden   | All touch devices                   |
| ≥ 821 px       | Persistent sidebar                                                                         | Expanded width (tablet/foldable)    |

---

## 4. Domain model

### 4.1 Entities (TypeScript, from `src/routes/index.tsx` and `src/lib/desk-package.ts`)

```ts
type Attachment = { name: string; data: string; mime?: string; seconds?: number };
// `data` is a data URL, OR "idb:<uuid>" = a reference to a stored recording (web only; Android uses a file path)

type Thought = {
  id: string;            // UUID v4 (seed data uses fixed ids)
  category: string;      // "Unsorted" | "Idea" | "Keyword" | "Vision" | "Learning" | "Question" | "Thought" | custom
  lane: string;          // key of a lane; new cards: "inbox"
  status: string;        // key of a status; new cards: "captured"
  text: string;          // may be empty for media-only cards; supports light markup (§7.8)
  tags: string[];        // lowercase, each starts with "#", unique within the thought
  createdAt: number;     // epoch ms
  images?: string[];     // data URLs, JPEG/PNG/WebP/GIF
  attachments?: Attachment[]; // audio, video, other files
};

type StatusItem = { key: string; label: string; icon: string };           // icon = emoji/text
type LaneItem   = { key: string; label: string; mark: string; hint: string };

type BrainstormDesk = {
  id: string;                    // UUID, immutable
  slug?: string;                 // editable readable name, unique per device
  projectId?: string | null;     // reserved, always null today
  intent?: string;               // "Purpose" (optional, ≤1000 chars)
  desiredOutcome?: string;       // optional, ≤1000 chars
  title: string; emoji: string; group: string;
  isPinned: boolean; createdAt: number; updatedAt: number;
  thoughts: Thought[];
  customStatuses?: StatusItem[]; // when absent or empty, defaults apply
  customLanes?: LaneItem[];
};
```

Validation (zod, `deskSchema`): ids non-empty strings; `createdAt`/`updatedAt` finite numbers;
`tags` string array; attachments `{name,data,mime?,seconds?}`; everything else as above.

### 4.2 Constants

| Constant               | Value                                                              |
| ---------------------- | ------------------------------------------------------------------ |
| Unsorted category key  | `"Unsorted"`, displayed as emoji `📥` + label `Inbox`              |
| Max categories         | 10 (user-defined list, excluding Unsorted)                         |
| New category emoji     | `✨`                                                               |
| Cards per page (flat)  | `PAGE_SIZE = 12` (only used when grouping is off)                  |
| Day panels per page    | `DAYS_PER_PAGE = 7`                                                |
| Toast duration         | 2,600 ms; 6,000 ms when an Undo button is shown                    |
| Card text clamp        | 4 lines, max height 96 px; "read more →" if text length > 180      |
| Card preview text cap  | 180 characters, then `…`                                           |
| Sidebar width          | default 260, min 180, max 400 (drag handle; saved)                 |
| Voice note limit       | 180 s, 32 kbps audio                                               |
| Video limit            | 120 s, 900 kbps video + 64 kbps audio                              |
| Photo                  | longest edge ≤ 1600 px, JPEG quality 0.85, single encode           |
| Attachment size cap    | 20 MB each; 100 MB per package                                     |
| Migrate-to-media-store | imported audio/video data URLs > 200 KB (web only)                 |

### 4.3 Defaults

**Types (order):** Idea 💡 · Keyword 🔑 · Vision 🎯 · Learning 📚 · Question ❓ · Thought 💭
(plus Unsorted 📥 "Inbox", always first in pickers and filters, never counted in the 10).

**Statuses (order):** `captured` ⚡ Captured · `prioritized` 🎯 Prioritized · `in_action` 🚀 In Action ·
`resolved` ✓ Resolved.

**Lanes (order):** `inbox` ○ "raw, unsorted" · `action` → "something to do" · `learning` ∗ "something to
study" · `knowledge` ◆ "something to keep" · `system` ■ "make it repeatable".

**Desk groups offered in dialogs:** Health & Products, General, Product, Research, Personal.

### 4.4 First-run seed data

On first launch (no saved data) the app shows three demo desks:

| Desk id               | Title                         | Emoji | Group             | Pinned | Notes |
| --------------------- | ----------------------------- | ----- | ----------------- | ------ | ----- |
| `niche-health-ebook`  | Niche Health eBook & Launch   | 🌿    | Health & Products | yes    | 2     |
| `horixon-mindstream`  | Horixon Core Architecture     | 🧠    | General           | yes    | 8     |
| `ai-cctv-arch`        | AI CCTV Architecture          | 📹    | Product           | no     | 1     |

Active desk on first run: `niche-health-ebook`. Seed timestamps are relative to "now" (minutes/hours/days
ago) so the day panels look alive. Seed thoughts (Horixon Core, minutes ago `[12, 48, 105, 290, 620, 880,
1480, 2820]`):

1. Vision · lane system · in_action · "Operating system that adapts its spatial frame density based on user eye fatigue and cognitive load. The UI should breathe with you." · #spatial #cognitive #ux
2. Keyword · knowledge · prioritized · "Local-first CRDT synchronization without central relay bottleneck" · #sync #crdt #sovereign
3. Idea · inbox · captured · "Autonomous subagent that watches user dump frequency and clusters related thoughts every Sunday evening into a weekly synthesis brief." · #agent #synthesis #ai
4. Learning · learning · resolved · "When users brain dump, categorizing beforehand adds 60% drop-off friction. Pre-selecting chips with 1-click is the highest threshold of tolerable friction." · #ux #cognitive #research
5. Question · inbox · prioritized · "How to preserve the serendipity of half-forgotten thoughts without cluttering the daily focus horizon?" · #focus #memory
6. Thought · learning · captured · "Multi-agent systems will feel clumsy until we give them shared spatial memory instead of raw chat logs." · #agent #spatial #memory
7. Idea · inbox · captured · "Agent swarm acting as an automatic devil's advocate on high-confidence bets." · #agent #decision #bets
8. Keyword · action · in_action · "Zero-latency offline vector embeddings via WebAssembly" · #wasm #offline #ai

Niche Health eBook: (Vision/action/in_action, 2 h ago) "Launch 45-page interactive guide on circadian
fasting and mitochondrial health protocols." #health #ebook #launch; (Idea/inbox/captured, 1 h ago) "Add
1-click printable meal prep templates as an exclusive reader bonus." #bonus #template.
AI CCTV: (Vision/action/in_action, 2 h ago) "Edge AI video stream processing with local subagent anomaly
detector" #ai #cctv #edge.

"Reset demo" (footer) restores the 8 Horixon seed thoughts into the **active** desk after a confirm.

---

## 5. Persistence

### 5.1 Web storage map (for reference and migration thinking)

| Store                                   | Key / name                                      | Content                                         |
| --------------------------------------- | ----------------------------------------------- | ----------------------------------------------- |
| localStorage                            | `horixon_desks_local`                           | JSON array of all desks (the working copy)      |
| localStorage (legacy, read-only)        | `horixon_desks_v2`                              | previous format, read if the above is absent    |
| localStorage (legacy, read-only)        | `horixon_braindump_prototype_v1`                | very first prototype: an array of thoughts      |
| localStorage                            | `horixon_active_desk_id`                        | last open desk                                  |
| localStorage                            | `horixon_sidebar_width`                         | integer 180–400                                 |
| localStorage                            | `horixon_braindump_categories_v1`               | JSON array of type names                        |
| localStorage                            | `horixon_braindump_cat_meta_v1`                 | `{ [type]: {emoji,label} }`                     |
| localStorage                            | `horixon_setting_group_by_date`                 | `"off"` only; absent means on                   |
| localStorage                            | `horixon_desk_dir_<deskId>`                     | display name of the connected folder            |
| IndexedDB `horixon_media` (store `blobs`) | key `idb:<uuid>`                              | voice/video blobs                               |

**Android:** replace with Room + DataStore + app files. You do not need the legacy keys.

### 5.2 Load, save and failure rules (apply on every platform)

1. **Load once at startup** and show an empty shell until loaded (web does this to keep server and client
   renders identical; on Android show nothing or a splash).
2. **Autosave on every change** to the working copy. Capture is held in memory immediately.
3. **Legacy migration:** prototype thoughts become the first desk's thoughts, appended to the demo desks.
   The legacy source is never deleted.
4. **Unreadable saved data** (corrupt JSON or schema failure): show the demo desks in memory, **pause
   autosave**, show status text `Saved data could not be read. Automatic browser saving is paused;
   original data is untouched.`, and never write over the original. (Android: show the equivalent copy and
   keep the database file untouched; offer export of the raw file.)
5. **Failed write:** status text `Browser save failed — export or connect a folder. Keep this tab open.`
   (Android: "Couldn't save. Free up space and try again."). Never report success.
6. **Folder writes** are debounced 500 ms, serialised (one at a time), and track the last content written;
   a warning is shown before the app closes with unsaved or failed work.
7. **Save status line** (always visible, small pill): one of
   - `Browser copy · no folder connected` (initial)
   - `Saved in browser · choose or reconnect this desk’s folder`
   - `Browser copy saved · folder save pending`
   - `Saving desk folder…`
   - `Saved to desk folder`
   - `Folder save failed: <reason>. Export or reconnect to retry.`
   - `Loaded from desk folder`
   - `Folder not saved`

### 5.3 The desk package format (the cross-platform contract)

A **desk package** is a folder or ZIP:

```
<desk>.zip  /  <chosen folder>/
├── desk.json
└── assets/
    ├── 1-1-image-1.jpg
    ├── 1-2-voice-note-2026-10-09-04-12.webm
    └── 2-1-notes.pdf
```

`desk.json` is pretty-printed (2 spaces). It is the desk object of §4.1 with these differences:

- `images` and `attachments[].data` are **removed** from each thought.
- A thought's media (photos first, then attachments) is listed under `attachments`:
  `{ "name": string, "path": string, "mime": string, "image": boolean }`.
- `path` is always `assets/<file>` with the regex `^assets\/[a-zA-Z0-9][a-zA-Z0-9._-]*$`.
- `mime` must match `^[\w.+-]+\/[\w.+-]+$`.

**ZIP export** file naming: asset path = `assets/{thoughtIndex+1}-{assetIndex+1}-{safeName(name)}`.
Photos are named `image-{n}` + extension from mime (`image/png`→`.png`, `image/jpeg`→`.jpg`,
`image/webp`→`.webp`, `image/gif`→`.gif`, otherwise `.bin`); other attachments keep their own name.
ZIP is written with compression level 0 (store).

**Folder save** names each asset `{sha256-hex}-{safeName(name)}` (content-addressed) so a failed save can
never overwrite an asset referenced by the previous `desk.json`; `desk.json` is written last. Unreferenced
assets are retained, never auto-deleted. Assets are only rewritten if the existing file's size differs.

`safeName(name)`: replace every char outside `[a-zA-Z0-9._-]` with `-`, strip leading dots, truncate to
100, fall back to `attachment` if empty.

**Import rules (ZIP and folder):**

- Reject: no `desk.json`; any path containing `..` or starting `/`; any asset path failing the regex;
  missing asset; any file > 20 MB; total > 100 MB; ZIP > 100 MB.
- ZIP import always creates a **new desk**: new UUID for the desk and for every thought, and slug becomes
  `{slug or safeName(title)}-import-{first 8 chars of a UUID}`. It can never overwrite a desk.
- Folder open **preserves identity** (same desk id and thought ids) and asks for confirmation before
  replacing an existing in-app copy.
- Image assets with mime png/jpeg/webp/gif and `image: true` return to the thought's `images`; everything
  else returns to `attachments`.
- **Known loss on the web:** `seconds` (recording length) and `mime` on non-image attachments are not
  written to `desk.json`. **Android:** you may write an extra `seconds` field in each manifest
  attachment. The web parser ignores unknown fields, so this is safe and improves round-tripping.

**Failure behaviour:** a data URL/asset that cannot be decoded aborts the export with the message
`An attachment is missing its local copy. Reattach it before exporting or saving to a folder.` Export
never silently drops media.

### 5.4 Read-only AI feed (`deskContext`)

A pure function that returns, for one desk: `id, projectId, title, intent, desiredOutcome, updatedAt` and
per thought `id, text, category, tags, lane, status, attachmentNames[], imageCount`. It contains no media
bytes and is **never sent anywhere**. Keep it as a pure function for a future feature.

---

## 6. Feature specification (behaviour, exact rules)

### 6.1 Desks and the sidebar

- **List:** a "Pinned Desks" section first (📌 icon), then one section per `group` (folder icon), sorted
  by insertion order. Each row: emoji, title (ellipsised), `#id`, thought count badge.
- **Search box** filters desks by `"title id group"` substring (case-insensitive). Placeholder
  `Find desk or #id...`.
- **Row actions** (hover; always visible on touch): pin/unpin, ⋮ menu: Edit Title & ID, Duplicate,
  Pin/Unpin, Delete.
- **Create desk dialog:** Title (placeholder `e.g. Niche Health eBook & Launch`, default "Untitled
  Brainstorming"), Readable name/slug (placeholder `e.g. niche-health-ebook`), Emoji (max 3 chars, default
  🌿), Group (select, default "Health & Products"). Slug = given slug or title lowercased with
  `[^a-z0-9]+`→`-`, trimmed of leading/trailing `-`. If a desk already has that slug (`slug || id`):
  toast `Page ID already exists. Try another ID.` New desk: UUID id, `projectId: null`, not pinned, no
  thoughts. Toast `Created "<title>" (#<id>)`. It becomes the active desk.
- **Edit desk dialog:** title, slug (lowercased, `[^a-z0-9-]+`→`-`, must be unique else toast `Choose a
  unique readable name.`), emoji, group, plus a collapsible **Purpose & outcome** section (two multi-line
  fields, max 1000 chars each; helper text "Give AI a little context about what this desk is for. Add this
  when it becomes clear."). Toast `Updated desk "<title>"`.
- **Duplicate:** new UUID; title `"<title> (Copy)"`; slug `"<slug or safeName(title)>-copy-<id8>"`; every
  thought gets a new UUID; media references are shared (not copied). Toast `Duplicated "<title>"`.
- **Delete:** blocked if it is the last desk (toast `Cannot delete the only remaining brainstorming
  desk.`); otherwise a confirm `Delete brainstorming desk "<title>"?`. Next active desk = first remaining.
  Toast `Deleted desk "<title>"`. Media is not deleted.
- **Pin toggle** toasts `Pinned "<title>"` / `Unpinned "<title>"`.
- **Sidebar footer:** `<n> workspaces active` and an `Add Desk` button.
- **Shortcut:** `Ctrl/Cmd + \` toggles the sidebar. On phone width the sidebar is a drawer; choosing a desk
  closes it.

### 6.2 Top bar

Left: sidebar toggle (only when the sidebar is closed), a vermilion dot, desk emoji, desk title (mono,
13 px, bold), `#id` chip (hidden on phone), edit pencil (opens Edit desk).
Right: **Pattern Radar** pill (toggles the dashboard, shows active state), **Settings** gear, **⋯ More**
menu, today's date (`Fri, Oct 9`, hidden on phone).

**More menu** (two toggles, each shows On/Off at the right): **Sound effects** (toast `Sound effects on/off`)
and **Focus sound** (toast `Focus sound on/off`), a 216 Hz ambient drone (§8.9).

### 6.3 Capture bar and presets

**Capture bar** (rounded 12, 1 px line border, paper-raised): `[Type chip] [multi-line text] [+ attach]
[send ➜]`.

- **Type chip:** default is the dashed **📥 INBOX** chip (transparent, dashed `ink-faint` border,
  `ink-soft` text). Tapping opens a menu: Inbox, then the user's types, a divider, and either a
  `+ new category` row (opens an inline name field; Enter adds) or `max 10 categories limit`. A chosen
  type shows as a solid coloured chip (§8.3). **After every save the chip resets to Inbox.**
  Adding a category: capitalise the first letter, reject duplicates (toast `Category already exists`) and
  more than 10 (toast `Maximum 10 categories allowed`), emoji `✨`, then select it (toast
  `Added category "<name>"`).
- **Text field:** serif 17 px, line-height 1.45, grows with content up to 240 px. Placeholder
  `Capture anything…` (when a type is selected: `Dump a <type lowercase>…`).
  - **Enter** saves (unless Shift is held or an IME is composing). **Shift+Enter** newline.
  - **Paste an image** from the clipboard: attaches it as a thumbnail (toast `Pasted <n> image(s) from
    clipboard!`). Android: support image paste via the keyboard's content-insertion API.
  - **Ctrl/Cmd + B / I / U** wrap the selection (or the word `text`) in `**…**`, `*…*`, `<u>…</u>`.
  - Hint `↵ save · ⇧↵ new line` is visible only while the bar has focus (hide on touch).
- **`+` attach:** a multi-file picker. Each file becomes a chip with an × to remove. Files > 20 MB are
  rejected with `Each attachment must be 20 MB or smaller.`
- **Send** (36×36 vermilion square, radius 9) is disabled when there is no text, image or file. Tooltip
  `Dump Thought (↵)`.

**Save rule (`commitCapture`):** requires text or an image or a file. Text is trimmed. Tags are parsed from
the text with `#[\w-]+`, lowercased and de-duplicated. New thought: UUID, the selected type (default
Unsorted), `lane: "inbox"`, `status: "captured"`, `createdAt: now`, images, attachments. It is inserted at
the **top** of the desk. Afterwards: clear text, images, files; reset type to Inbox; reset the field
height; play the **dump chime**; toast `Saved to "<desk title>"` **with an Undo button** (6 s); refocus the
field. **Undo** removes exactly that thought (toast `Capture undone`).

**Presets** (pills under the bar): **Voice**, **Photo**, **Video**, and an icon-only **Dictate** (waveform
icon). Pill: mono 11 px, radius full, 1 px line, paper-raised. Active pill is solid vermilion with white
text and a soft vermilion shadow. Tapping the active pill closes the stage.

**Instant-save rule for media:** if the capture is empty (no text, images, or files) a recorded
voice/video/photo is saved immediately as its own card with fallback text:

| Media | Fallback text            |
| ----- | ------------------------ |
| Photo | `Photo`                  |
| Voice | `Voice note · m:ss`      |
| Video | `Video clip · m:ss`      |

If the user has already typed or attached something, the media **joins that capture** and the toast says
`Added to this capture · press ↵ to save`.

### 6.4 The Stage (live capture panel)

Opens under the presets with a 320 ms enter animation (`stage-in`). Panel: paper-raised, radius 14, 1 px
line border, large shadow, padding `14 16 12`. Header: status dot, title, timer (when applicable), close ×.

| Mode        | Behaviour                                                                                                                   |
| ----------- | --------------------------------------------------------------------------------------------------------------------------- |
| **Voice**   | Starts recording immediately. Title `Recording voice note`. Live waveform. Timer `m:ss / 3:00`. Progress hairline to the limit. Footer: hint `Esc discards · saves to Inbox`, button **✓ Stop & save**. Auto-stops at 180 s. |
| **Video**   | Starts recording immediately. Title `Recording video`. 16:9 viewfinder (max height 320, radius 12, dark `#191511` bg) with a `● REC` badge top-left and a mini waveform along the bottom (gradient scrim). Timer `m:ss / 2:00`. Auto-stops at 120 s. Same footer. |
| **Photo**   | Live viewfinder with a 56 px vermilion **shutter**; tapping flashes white (320 ms fade) and captures a single downscaled JPEG. Optional **Flip** button when more than one camera exists. Camera facing default: rear (`environment`). |
| **Dictate** | Title `Listening · your words appear in the bar`. Waveform of mic level. Speech recognition appends transcript text to the field (continuous, interim results). Footer: hint `Speak naturally · Esc to stop`, button **✓ Done**. |

Rules: closing or `Esc` discards a recording in progress. Only one stage at a time. Opening a non-dictate
stage stops dictation. If permission is denied the panel shows the message from §9.3 with **Try again** and
**Close**. Title becomes `Couldn't start`.

**Waveform rendering (voice, dictate, video overlay):**

- Sample the mic loudness every **45 ms**: `rms = sqrt(mean(((byte-128)/128)²))` over a 512-point
  analyser, `level = min(1, rms × 3.4)`.
- Keep a rolling history; draw **right-aligned bars**: bar width 3, step 6 (so one bar per 6 px), bar
  height `max(3, level × h × 0.92)`, vertically centred, rounded 1.5, colour = vermilion (white on the
  video overlay). Alpha ramps `0.3 → 1.0` from oldest to newest.
- Fill the not-yet-recorded left part with faint baseline dots (3 × 2 px, alpha 0.14).
- Canvas height: 72 px (voice/dictate), 44 px overlay (video).
- **Android:** use `MediaRecorder.getMaxAmplitude()` (0..32767, normalise by 32767 and apply the same
  gain) sampled at 45 ms, drawn on a Compose `Canvas`.

**Recording formats:** web prefers `audio/webm;codecs=opus` then `audio/webm` then `audio/mp4`; video
prefers `video/webm;codecs=vp9,opus` → `vp8,opus` → `video/webm` → `video/mp4`. Stored `mime` drops codec
parameters. File names: `voice-note-YYYY-MM-DD-HH-MM.{webm|m4a}` and `video-clip-YYYY-MM-DD-HH-MM.{webm|mp4}`
(timestamp from the ISO string, `:`/`T` → `-`). **Android:** AAC in `.m4a` and H.264/AAC in `.mp4`, same
names and limits, mime `audio/mp4` and `video/mp4`.

**Save failure:** recordings are written to storage **before** the card is created. If that write fails:
toast `Recording not saved: <reason>` and no card is created.

### 6.5 Cards

A card is a rounded-8 rectangle, 1 px line border, with a 3 px rounded left rule (see §8.5 for colours).

```
┌────────────────────────────────────────┐
│ ▌ 💡 IDEA ⌄                    1h ago │   ← type label (tap = type picker) · relative time
│   Card text, serif 14/1.48 …           │   ← clamped to 4 lines; "read more →" if > 180 chars
│   [thumb][thumb][+2]  📷 3 attachments │   ← image strip (3 thumbs + "+n"), tap to zoom
│   ▶ audio / video player               │   ← for voice/video attachments
│   #tag #tag                            │   ← tap a tag = search for it
│ ─────────────────────────────────────  │
│ [⚡ CAPTURED]   ○ → ∗ ◆ ■  🗑   #      │   ← status pill · (hover) lane dots · delete · tag button
└────────────────────────────────────────┘
```

- **Tap the card** → open Detail (§6.9). In select mode it toggles selection instead.
- **Type label** → opens the **type picker** (§6.6). Shows a small chevron on hover/focus.
- **Relative time** (`relativeTime`): `mins = max(1, round((now − t)/60000))`; `<60` → `Nm ago`; `<1440` →
  `Nh ago` (floor); else `Nd ago` (floor of days).
- **Text:** rendered with the light markup of §7.8. Preview is the first 180 chars plus `…`.
- **Images:** a compact strip: up to 3 thumbnails (zoom icon on hover), a `+N` badge for more, and a label
  `N attachment(s) · zoom`. Tapping opens the **lightbox**.
- **Attachments:** audio → native audio controls; video → video player (max height 190, radius 8, dark bg);
  other files → a small chip with the file name. If a stored recording is missing:
  `<name> · recording not found in this browser` (never pretend it exists).
- **Status pill** (left of the footer): tapping **advances to the next status** (cyclic through the desk's
  statuses), plays the **route swoosh**, toast `Status: <label>`.
- **Hover/focus actions** (right of the footer, fade in 160 ms; always visible on touch except lane dots):
  - **Lane dots:** one 22 px circle per lane showing its mark; the current lane is filled. Tapping a lane
    routes the card there (tap the current lane to send it back to `inbox`); swoosh; toast `Routed to
    <lane>` or `Back to Inbox`.
  - **Delete 🗑:** confirm `Delete this thought?` → toast `Thought deleted`.
- **`#` tag button** (24 px, bottom right, always visible at 55 % opacity, 100 % on hover) opens the **tag
  picker**.
- **Card background by lane:** lane `action`/`learning`/`knowledge`/`system` tint the card (§8.5). The
  `inbox` lane and custom lanes use paper-raised.

### 6.6 Type picker and tag picker (instant, separate controls)

Small anchored popovers, 288 px wide, paper-raised, radius 12, large shadow, enter 180 ms. Both **apply on
one tap and close immediately**. Tapping outside or `Esc` closes without changes.

- **Type picker** (opened from the card's type label): a "TYPE" caption and chips for Inbox plus all types
  (emoji + label); the current one is filled ink. Tapping a different type applies it (swoosh) and closes.
  Tapping the current type just closes.
- **Tag picker** (opened from `#`): an input `+ new tag, press enter` focused first, then a "TAGS" caption
  and up to **12** chips: the card's own tags first, then the desk's most-used tags. Tapping a chip
  **toggles** that tag and closes. Enter in the input adds a new tag: trim, strip a leading `#`, lowercase,
  spaces → `-`, store as `#value` (ignored if empty or already present), then close.
- **Placement:** below the trigger; flip above if there is not enough room; clamp inside the window with an
  8 px margin; the tag picker right-aligns to the `#` button.
- **Android:** use a `ModalBottomSheet` or anchored `Popup`; keep one-tap-and-close.

### 6.7 Toolbar, filters and views

Toolbar (one row, wraps): `[search] [📥 Inbox n]` … `[Filters ⚙] [Dates 📅] [☑ select] [view ▾]`.

- **Search:** placeholder `search text, #tags, or keywords...`; matches
  `"<text> <tags joined by space> <category>"` lowercased, `includes` the trimmed lowercase query.
  Tapping a tag on a card sets the query to that tag.
- **Inbox chip:** dashed pill with a count of `isInbox` items. Toggles an Inbox-only filter.
  `isInbox(t) = t.lane === "inbox" || t.category === "Unsorted"`.
- **Filters** button (shows a vermilion count badge of active panel filters). Opens the **Filters panel**:
  - Four dropdowns in a responsive grid (min 150 px each): **Lane** (Any + each lane `mark label (count)`),
    **Type** (Any + Unsorted + each type `emoji label (count)`), **Status** (Any + each `icon label (count)`),
    **Date** (Any time, Today, Last 7 days, Last 30 days; a "Custom range" option appears only while a
    custom range is active).
  - A hint line: "For exact dates, use the 📅 date chip next to Filters."
  - **Contains** chips (multi-select, **AND** logic): 🖼 Image, 🔗 Link, 🎙 Voice, 🎬 Video, 📎 File, each
    with a count; plus **Untagged** (tags empty) with a count.
- **Dates chip** (next to Filters): shows `Dates`, or the range text (`Sun, Oct 4 → Thu, Oct 8`, or one
  day `Sat, Sep 26`) when set. Opens a popover with **From** and **To** date fields (live filtering,
  `min`/`max` constrain each other) and **Clear** / **Done**. Setting either field sets the date filter to
  `custom`; clearing both resets to Any.
- **Active filter chips** line (only when ≥ 1 panel filter is active): a removable chip per filter (Lane,
  Type, Status, Untagged, date label, `Has <kind>`) plus a `Clear all` link. Search and the Inbox chip are
  not shown here (they are always visible).
- **View menu:** Grid, List, Board by lane (radio items with a check). Icon shows the current view.
- **Select** (checkbox icon) toggles select mode (§6.10).

**Filter predicates** (all combined with AND), then sorted by `createdAt` descending:

```
category   : categoryFilter == All || t.category == categoryFilter
lane       : laneFilter == all || t.lane == laneFilter
status     : statusFilter == all || t.status == statusFilter
untagged   : !untaggedOnly || t.tags.length == 0
inbox      : !inboxOnly || isInbox(t)
date       : see §7.2
contains   : every selected kind matches (image, link, audio, video, file)
search     : see above
```

`contains` kinds: **image** = `images.length > 0`; **link** = text matches `/(https?:\/\/|www\.)\S+/i`;
**audio/video** = any attachment whose mime (or data-URL mime) starts with `audio/`/`video/`; **file** =
any attachment that is neither audio nor video.

Empty result (with filters active): `No thoughts match your current filters in "<desk title>".` plus a
`clear filters` button that resets everything (type, lane, status, untagged, inbox, date, contains, search).

### 6.8 Views

**Day grouping ("Group cards by date")** applies to **Grid** and **List**. It is **on by default** and can
be turned off in Settings (§6.12). Rules:

- Group the filtered thoughts by **local calendar day**, newest day first, newest card first inside a day.
- Panel header: serif 19 px day label (`Today`, `Yesterday`, else `Wed, Oct 7`; add the year if not the
  current year), a mono subtitle (the full date for Today/Yesterday, else `N days ago`), and a right-aligned
  `N notes` count. In select mode a **Select day** button appears.
- **Today is always the first panel when no filter, search, or Inbox chip is active**, even with zero notes
  today. It then shows a dashed placeholder: `Nothing captured today yet. Type above, or use Voice, Photo or
  Video.` With any filter active, only days that have matches appear.
- **Pagination by days:** 7 day-panels per page. Pager = `‹  1 2 3  ›` plus `Days 1–7 of 18`. Page numbers
  show first, last and current ±1 with `…` gaps. Changing page scrolls to the top of the list. Page resets
  to 1 when any filter, view, or desk changes.
- With grouping off, Grid/List show a flat, 12-per-page list with the same pager (`1–12 of 36`).

**Grid:** responsive columns (§3.2). **List:** one row per card: `[type + time (100 px)] [text, media, tags]
[status pill; hover actions float to its left]`; rows alternate a faint tint (odd paper-raised, even
`#EFEBE0`-ish) and stack vertically on narrow widths. **Board:** five columns, one per lane (min 180 px),
each with a heading `mark label` and a count, cards stacked, `—` when empty; Board is **not** grouped by day
and not paginated.

### 6.9 Card detail (slide-over drawer, 460 px wide max; Android: bottom sheet/full screen)

Opens with a 280 ms slide-in over a 45 % scrim (with a 3 px blur). Backdrop tap or `Esc` closes. Contents,
top to bottom:

1. **Header:** category emoji + a `<select>` to change type (Inbox + types), a `·`, the date/time
   (`Oct 9, 10:42 AM`), and a close ×.
2. **Attach files** picker and the attachment list (each with a player for audio/video, a download link, and
   a remove ×).
3. **Text editor** (multi-line): live edit, saves as you type. Placeholder
   `Write or edit thought text… (supports ```code```, **bold**, *italic*, <u>underline</u>, paste images)`.
   Shows shortcut hints Ctrl+B, Ctrl+I, Ctrl+U, ```.
4. **Pasted images & attachments** gallery: thumbnails with remove buttons; tap = lightbox.
5. **Action status:** one button per status (icon + label; the current one is active). A small **⚙ Edit**
   toggles an editor for this desk's statuses: change icon and label inline, delete (never below 1), and add
   a status (key = label lowercased, spaces → `_`, default icon 🏷️). Placeholder
   `New status name (e.g. L0, L1)...`. Stored in `customStatuses`.
6. **Tags:** chips with ×, and an input `+ add tag, press enter` (same normalisation as the tag picker).
7. **Destination lane:** a list of lanes (mark, label, hint, check on current); tapping routes. A **⚙ Edit**
   toggles a lane editor (change mark/label, delete if more than 1, add; key = label lowercased with spaces
   → `_`, default mark `•`, hint `custom lane`). Placeholder `New lane name (e.g. Backlog, Todo)...`.
   Stored in `customLanes`.
8. **Pattern echoes (related thoughts):** up to 3 other thoughts that share a tag **or** whose text
   contains a non-stopword of 5+ letters from this thought. Tapping one opens it. Empty state:
   `No related thoughts discovered yet.`
9. **Footer:** `delete` and the save-status text.

Deleting a status or lane does **not** migrate cards that use it; unknown keys display their raw key
(status shows `key` with `_` → space and icon ⚡; lane shows the key with mark `•`).

**Image lightbox:** full-screen dialog (max 1100×850, radius 14). Title `Evidence Inspection (i of n)`.
Zoom in/out in steps of 0.25 between 0.5× and 3.5×, reset, download (`evidence-<n>.png`), previous/next (when
more than one; arrow keys; wraps), close (`Esc`). Android: a pinch-to-zoom pager.

### 6.10 Select mode and PDF export

- Toggle with the ☑ toolbar icon. Cards show a checkbox top-right (18 px, radius 5); tapping a card toggles
  its selection (it does not open Detail). Selected cards get a 2 px vermilion outline and a glow.
- Selection is by **id**, so it **persists across filter and page changes**. It resets when the desk
  changes, when select mode is exited, and on `Esc`.
- **Selection bar** (fixed, bottom centre, ink background, pill): `N selected` (plus `· M hidden by
  filters` when some selected cards are not currently shown), `Select all N shown`, `Clear`,
  **Export PDF** (vermilion), and a close ×. Day panels offer `Select day`.
- **Export PDF:** builds a formatted document of the selected cards (**text and images only**; audio,
  video and other files are omitted and the footer says so) and opens the platform print dialog so the user
  can "Save as PDF". Toast `Print dialog opened · choose “Save as PDF”`; failure toast
  `Export failed: <reason>`.

**PDF document spec** (`src/lib/export-pdf.ts`; reuse this HTML on Android):

- Page: A4, margins `18mm 16mm 20mm`. Fonts: Fraunces (body 11.5 pt, lh 1.55), IBM Plex Mono for labels;
  colour `#2b2722`, accent `#b4421f`, card bg `#faf6ee`.
- Header: title (24 pt, 600) with the desk emoji; meta `N notes · exported <full date>`; optional lines
  **Purpose** and **Desired outcome** from the desk; a 2 px ink rule.
- Body: one section per day (newest first), heading = full date (`Friday, October 9, 2026`) with a right
  aligned `N notes`. Each card: left 3 px accent rule, mono caption (`TYPE` left, time right), text
  (light markup rendered), images (1 or 2 columns, max height 95 mm, natural size not upscaled), tags in
  accent colour. Cards never split across pages.
- Footer: `Text and images only. Voice notes, videos and other files are not included in this export.`
- Text is HTML-escaped first; then `` `code` ``, `<u>`, `**bold**`, `*italic*`, newlines and fenced blocks
  are converted (§7.8).

### 6.11 Pattern Radar (per-desk dashboard)

Opened from the top bar; **replaces the notes area** (capture bar and presets stay). Computed only from the
active desk's thoughts. Header: `← Notes` back button, title `Pattern Radar` (serif 24), subtitle
`A notebook with dots · <emoji> <desk title>`, and a range switch `14d | 30d | 90d` (default 14).

If the desk has no notes: `No notes in this desk yet. Capture a few thoughts and your patterns will appear
here.`

1. **Top signal** card (vermilion-soft, vermilion border), shown when a pattern exists: `You keep circling
   “<keyword>” (N notes). Next move: “<first 110 chars of the note>…”` and a **Set In Action** button
   (sets that note to `status: in_action`, `lane: action`; toast `Advanced "<keyword>" to In Action`).
   Algorithm: take the top pattern word (§7.5); among thoughts whose text or any tag contains it, pick the
   first not `resolved`, else the first match.
2. **KPI tiles** (5, min 150 px): **Notes** (total), **This week** (last 7 days incl. today; delta text
   `▲ +N vs last week` / `▼ -N vs last week` / `same as last week`), **Active days** (`n/30`), **Streak**
   (`N days`/`1 day`), **Inbox** (`isInbox` count, "not sorted yet").
3. **Notes per day** bar chart for the selected range (§ geometry below), with a **7-day moving average**
   dashed line; today's bar vermilion; tapping a bar with notes opens the notes filtered to that day.
4. **Activity dots**: 12 weeks × 7 days, Monday-first, current week last, future days omitted; empty days
   are tiny faint dots, active days are vermilion dots that grow and darken with the count. Tapping an
   active day filters to it.
5. **By type**: a horizontal bar per type present, sorted by count descending, each with emoji, label,
   proportional bar and count. Tapping filters to that type.
6. **Status flow**: a stacked bar across the desk's statuses plus a legend (`icon label count`).
7. **Word patterns**: a cloud of the top 10 recurring terms (§7.5), font size `11 + round(count/max × 7)` px,
   each with a superscript count; tapping a word searches for it. Empty copy: `Patterns appear once a word
   or tag shows up in more than one note.`
8. **Rising this week**: up to 6 terms used ≥ 2 times this week and more than the previous 7 days, shown
   `↗ word  N now · M before`.
9. **Timeline**: the latest **8 active days**, newest first; each shows the day label (and `N days ago`),
   up to 2 note snippets (90 chars, one line each, `+N more`), up to 4 type emoji and `N notes`. Tapping
   opens the notes filtered to that day.

**Chart geometry (bar chart, viewBox 720 × 170):** padding `left 26, right 8, top 10, bottom 22`;
`slot = plotWidth / days`; `barWidth = max(3, slot × 0.66)`; y-axis max = `max(3, tallest bar)` with grid
lines at 0 %, 50 %, 100 % labelled with rounded values; x labels (day of month) every 2 / 5 / 15 days for
14 / 30 / 90 day ranges, counting back from today; zero days draw a 2 px baseline stub.
**Activity dots geometry (viewBox 252 × 150):** column pitch 19, row pitch 20, left offset 26, top offset 14;
radius `2.6` if empty else `4 + min(count,5) × 0.9`; opacity `0.35 + min(count,4) × 0.16`; weekday labels M, W, F.

Every filter jump first **clears all other filters**, then applies the one clicked, then returns to the
notes (`resetFilters(); set…; close dashboard`).

### 6.12 Settings dialog

Title `Settings`. Two sections:

- **View**: row **Group cards by date** with helper text `Show Today, Yesterday and dated panels in the Grid
  and List views.` and an **On/Off switch** (pill with a sliding knob; label inside shows the state;
  on = vermilion). Default **On**. Stored as `horixon_setting_group_by_date = "off"` only when turned off.
- **Desk storage & portability**: a status card (folder icon, `<desk title> Folder`, the connected folder
  name `📁 <name>/` or `Browser fallback copy`, hint text), the live save status line, a stats grid
  (**Thoughts** count, **Evidence Assets** count = images + attachments, "Vault Engine: Browser copy +
  optional desk folder"), and four actions: **Choose this desk’s folder… / Reconnect / choose desk folder…**,
  **Export complete desk (.zip)**, **Import desk (.zip)**, **Open existing desk folder**. Footer **Done**.

**Connect folder (web):** picks a directory with read/write access; rejects a folder already used by
another desk (`Choose a separate folder for each desk.`); if `desk.json` exists with a different id →
`This folder belongs to another desk. Choose an empty folder.`; if it exists with the same id → confirm
`Replace the folder’s saved desk with this browser copy? Export either copy first if needed.` Success toast
`Desk folder saved. Assets remain local copies.` Access lasts for the session on web; **Android can persist
the URI permission** so the connection survives restarts (an improvement, keep the same rules otherwise).
**Open folder:** `Load the folder’s desk instead of its browser copy? Export unsaved browser work first.`
(confirm only if that desk already exists in-app).

### 6.13 Footer utilities

`desk: <title> (#<id>) · sovereign storage`, with **reset demo**, **json** (downloads all desks, media
resolved to real bytes, `<deskId>-brain-dump.json`) and **markdown** (this desk's thoughts, **not** filtered:
for each `## [<category>] (<status>) · <lane label>\n<text>\n\n<tags joined by space>\n`, joined by
`\n---\n\n`, file `<deskId>-brain-dump.md`).

### 6.14 Keyboard and gesture reference

| Input                                  | Result                                                      |
| -------------------------------------- | ----------------------------------------------------------- |
| `Cmd+K` or `Ctrl+Shift+D`              | Close detail, focus the capture field                       |
| `Ctrl/Cmd` + backslash                 | Toggle sidebar                                              |
| `Esc`                                  | Close detail/dialogs/menus/pickers/stage; exit select mode  |
| `Enter` in capture                     | Save (not with Shift, not during IME composition)           |
| `Ctrl/Cmd+B/I/U` in a text field       | Wrap selection with bold/italic/underline markup            |
| Lightbox `←`/`→`/`Esc`                 | Previous / next / close                                     |

**Android:** map to gestures: edge-swipe for the drawer, back button for `Esc`, IME "Send" action for
Enter, text-selection toolbar actions for formatting.

---

## 7. Algorithms (implement exactly)

### 7.1 Local-day maths (`src/lib/dates.ts`)

```
startOfDay(t)      = t at 00:00:00.000 local time
daysAgoStart(n)    = startOfDay(now) shifted back n calendar days using date arithmetic (not 86400000,
                     so DST changes cannot skew it)
dayKey(t)          = "YYYY-MM-DD" in local time
dayLabel(t)        = diff = round((startOfDay(now) − startOfDay(t)) / 86400000)
                     0 → "Today"; 1 → "Yesterday"; else "Wed, Oct 7" (weekday short, month short, day;
                     add year if different year)
daysAgoHint(t)     = diff ≥ 2 ? "<diff> days ago" : ""
fullDate(t)        = "Friday, October 9, 2026"
groupByDay(items)  = ordered groups keyed by dayKey, keeping input order (input is newest first)
```

### 7.2 Date filter

```
any     : always true
today   : t ≥ startOfDay(now)
7d      : t ≥ daysAgoStart(6)       // today + the 6 days before = 7 calendar days
30d     : t ≥ daysAgoStart(29)
custom  : from = dateFrom ? start of that local day : −∞
          to   = dateTo   ? 23:59:59.999 of that local day : +∞
          from ≤ t ≤ to
```

### 7.3 Counts used by the dashboard

- `weekOverWeek`: `thisWeek = t ≥ daysAgoStart(6)`; `lastWeek = daysAgoStart(13) ≤ t < daysAgoStart(6)`;
  `delta = thisWeek − lastWeek`.
- `currentStreak`: start at today if today has a note, else yesterday; count consecutive days with ≥ 1 note.
- `activeDays`: days with ≥ 1 note among the last 30.
- `dailyCounts(thoughts, n)`: one entry per day for the last `n` days (oldest → today).
- `movingAverage(values, 7)`: mean of the last up-to-7 values at each point.
- `heatmapWeeks(thoughts, 12)`: columns start on Monday: `lastMonday = daysAgoStart((weekday+6) % 7)`.

### 7.4 Term extraction

```
terms(thought):
  for each tag: clean = tag without "#", lowercased; if clean.length > 2 → (clean, weight 2)
  for each word in lowercase(text).match(/[a-z0-9-]{4,}/g): if not a stop word → (word, weight 1)
```

### 7.5 Word patterns and rising terms

- **Patterns:** sum term weights across the desk; keep terms with total ≥ 2; sort descending; take 10.
  (The web additionally remembers the category of the last thought that mentioned a term; it is unused in the
  UI.)
- **Rising:** counts for the last 7 days vs the previous 7 days (same extraction). Keep terms with
  `now ≥ 2` and `now > before`; sort by `(now − before)` then `now` descending; take 6.

### 7.6 Stop words (exact list)

`the and that with from into this your about based should user users they them than will have what when
without every instead these those over under around onto through been being their would could there where
which while since until because after before high raw system systems thought thoughts mind brain local first
feel give more less most much very just also how why who one two all for not are you but its our can has had
was were each some other only even then does did get way use via`

### 7.7 Related thoughts ("echoes")

For the open thought `d`, other thoughts `i` match if `i.tags ∩ d.tags ≠ ∅` **or** any word in
`lowercase(d.text).match(/[a-z]{5,}/g)` that is not a stop word appears (substring) in `lowercase(i.text)`.
Take the first 3 in desk order.

### 7.8 Light text markup (render in cards, detail, PDF)

Order of processing: split on fenced code ```` ``` ```` blocks first. Inside a fence: optional first line is a
language tag if it has no spaces and is < 12 chars (shown as a small tag); content is monospace, preserved.
Outside fences: split on `` `inline code` ``, then on `<u>…</u>`, `**bold**`, `*italic*` (in that order of
precedence), newline → line break. Nothing else is interpreted. Always escape user text before markup.

### 7.9 Hashtag parsing

`text.match(/#[\w-]+/g)` → lowercase → unique. Tags added through pickers: strip `#`, trim, lowercase,
whitespace → `-`, prefix `#`.

### 7.10 Slug rules

Create: `(slugInput or title).toLowerCase().replace(/[^a-z0-9]+/g,"-")` trimmed of leading/trailing `-`.
Edit: `(slug or id).toLowerCase().replace(/[^a-z0-9-]+/g,"-")`. Uniqueness compares `slug || id` across desks.

---

## 8. Design system: "Paper & Ink"

A warm paper surface, dark ink text, **one** accent (vermilion), small mono capitals for labels, serif for
the user's own words. Nothing is pure white or pure black. Surfaces are quiet; the accent marks the single
most important thing on screen.

### 8.1 Colour tokens

Web uses OKLCH; hex below is the converted sRGB value to use on Android.

**Core**

| Token              | OKLCH                    | Hex        | Use                                               |
| ------------------ | ------------------------ | ---------- | ------------------------------------------------- |
| `paper`            | `0.955 0.014 88`         | `#F4F0E6`  | App background                                    |
| `paper-raised`     | `0.975 0.01 92`          | `#F9F7EF`  | Cards, panels, dialogs, bars                      |
| `ink`              | `0.26 0.015 70`          | `#29231C`  | Primary text, selected states, toasts             |
| `ink-soft`         | `0.44 0.015 70`          | `#58514A`  | Secondary text and icons                          |
| `ink-faint`        | `0.62 0.012 75`          | `#8A857E`  | Tertiary text, placeholders, captions             |
| `line`             | `0.885 0.008 88`         | `#DBD9D3`  | 1 px borders and dividers                         |
| `muted`            | `0.945 0.008 90`         | `#EFEDE7`  | Hover/pressed fills, tracks                       |
| `vermilion`        | `0.55 0.17 38`           | `#BF4213`  | The accent: primary buttons, active, recording    |
| `vermilion-soft`   | `0.93 0.03 45`           | `#FAE2D8`  | Accent tint backgrounds, active-filter chips      |
| `on-vermilion`     | `0.99 0.005 80`          | `#FEFBF8`  | Text/icons on vermilion                           |
| `vermilion-dark`   | `0.48 0.18 38`           | `#AB2200`  | Pressed accent                                    |

**Lanes** (card tints and left rules)

| Lane        | Rule/text (`--lane-*`) | Card background (`--lane-*-bg`) |
| ----------- | ---------------------- | ------------------------------- |
| action      | `#AD411C`              | `#FCE8DF`                       |
| learning    | `#514D85`              | `#ECEBFA`                       |
| knowledge   | `#085762`              | `#DEEFF3`                       |
| system      | `#1B5A3E`              | `#DFF0E6`                       |
| inbox/custom| rule `ink-faint` @ 50 %| `paper-raised`                  |

**Status pills**

| Status      | Border     | Text       | Background |
| ----------- | ---------- | ---------- | ---------- |
| captured    | `line`     | `ink-soft` | `paper`    |
| prioritized | `#2784D5`  | `#004794`  | `#E5F0FC`  |
| in_action   | `vermilion`| `vermilion`| `#FAE2D8`  |
| resolved    | `#21763C`  | `#005820`  | `#E6F3E8`  |
| custom      | `line`     | `ink-soft` | `paper`    |

**Type chip colours** (selected type in the capture bar; text is white)

| Type     | Background | Border     |
| -------- | ---------- | ---------- |
| Idea     | `#D97706`  | `#B45309`  |
| Keyword  | `#0891B2`  | `#0E7490`  |
| Vision   | `#7C3AED`  | `#6D28D9`  |
| Learning | `#059669`  | `#047857`  |
| Question | `#E11D48`  | `#BE123C`  |
| Thought  | `#C2410C`  | `#9A3412`  |
| Inbox    | transparent (text `ink-soft`) | dashed 1 px `ink-faint`        |
| Custom   | `ink` (text `paper`; no preset colour)  | `ink`                         |

**Dashboard / data viz**

| Use                               | Value                                  |
| --------------------------------- | -------------------------------------- |
| Bar with notes                    | `#71675D` at 62 % opacity              |
| Bar for today / hover / avg-dots  | `vermilion`                            |
| Empty bar / empty dot / tracks    | `line` / `muted`                       |
| 7-day average line                | `ink`, 1.6 px, dash 4/3, 55 % opacity  |
| Positive delta / rising terms     | `#00683D` / `#006035`                  |
| Negative delta                    | `vermilion`                            |
| Status stack: captured/other      | `ink-faint`                            |
| Status stack: prioritized         | `#4075AA`                              |
| Status stack: in_action           | `vermilion`                            |
| Status stack: resolved            | `#00774B`                              |

**Overlays and effects**

| Token                       | Value                                  |
| --------------------------- | -------------------------------------- |
| Drawer scrim                | `#191511` @ 45 % (+3 px blur)          |
| Dialog scrim                | `#191511` @ 50 % (+4 px blur)          |
| Viewfinder background       | `#191511`                              |
| Day-panel background        | `#F6F2EA` @ 70 %                       |
| Elevation shadow (large)    | `0 18px 50px  #342C23 @ 12 %`          |
| Dialog shadow               | `0 20px 60px  #1C140C @ 25 %`          |
| Selected-card glow          | `0 8px 24px   #BF4213 @ 18 %` + 2 px vermilion outline |
| Accent button shadow        | `0 4px 14px   #BF4213 @ 28 %`          |

**Background texture (optional on Android):** the web lays a faint fractal-noise "paper grain" (5 % noise at
55 % opacity) and a soft vignette (`#B0A290` @ 14 % at the edges) over the paper. It is decorative; Android
may use a flat `paper` or render a tiled noise bitmap.

**Dark theme:** none. The web has a single light theme. Do not invent one for parity; add it later as a
separate task.

### 8.2 Typography

Three families (all open licence, bundle the font files; do not fetch at runtime):

| Role           | Family                     | Weights used            | Where                                         |
| -------------- | -------------------------- | ----------------------- | --------------------------------------------- |
| Content (serif)| **Fraunces** (variable, opsz 9–144) | 400, 500, 600, italic 400/500 | The user's text, headings, big numerals |
| Labels (mono)  | **IBM Plex Mono**          | 400, 500                | Captions, chips, buttons, timestamps, metadata |
| UI body (sans) | **Inter**                  | 400, 500, 600           | Base UI text                                  |

> The web loads Plex Mono at 400/500 only; the browser fakes heavier weights. **Use Medium (500) wherever
> the CSS says 600/700 on mono** to match.

**Type scale** (px → sp on Android)

| Style                | Family | Size | Line height | Weight/other                          | Used for                                   |
| -------------------- | ------ | ---- | ----------- | ------------------------------------- | ------------------------------------------ |
| Capture input        | serif  | 17   | 1.45        | 400                                   | Capture field                              |
| Card text            | serif  | 14   | 1.48        | 400, clamp 4 lines                    | Card body                                  |
| Day heading          | serif  | 19   | –           | 500, letter-spacing −0.01 em          | Day panel title                            |
| Dashboard title      | serif  | 24   | –           | 500, −0.01 em                         | Pattern Radar                              |
| KPI numeral          | serif  | 28   | 1.1         | 500                                   | Dashboard tiles                            |
| Body (sans)          | sans   | 14   | –           | 400                                   | Default UI text                            |
| Mono label           | mono   | 11   | –           | 400/500                               | Buttons, chips, hints, pager               |
| Mono small caps      | mono   | 9–10 | –           | uppercase, letter-spacing 0.06–0.1 em | Card type, time, captions, KPI labels      |
| Card type label      | mono   | 9    | –           | 500, uppercase, +0.08 em              | `IDEA`, `INBOX`                            |
| Toast                | mono   | 11   | –           | 400                                   | Toasts                                     |
| Timer                | mono   | 15   | –           | tabular numerals                      | Stage timer (`0:12`)                       |
| Code                 | mono   | 9.5–13 | –         | 400                                   | Inline code / blocks                       |

### 8.3 Spacing, radius, elevation, borders

- **Spacing scale (px):** 2, 4, 5, 6, 8, 10, 12, 14, 16, 18, 20, 24, 28. Common pairings: card padding
  `14 14 10 16`; panel padding `14 16 16`; stage `14 16 12`; dialog `20 24`; grid gap 12; chip gap 6–8.
- **Radius:** card 8 · small control 8–9 · bar/popover/menu 12 · stage/dialog/dashboard card 14–16 · day
  panel 16 · **pill/round 999** · avatars/dots 50 %.
- **Borders:** 1 px `line` everywhere; dashed `ink-faint` for "unsorted"/empty states; 2 px vermilion for
  selection and focus.
- **Elevation:** only three levels: flat (border only), raised (popovers, stage, drawer: large soft
  shadow), and modal (dialog shadow + scrim). No Material tonal elevation.
- **Touch targets (Android):** the web uses compact desktop sizes (22–36 px). On Android make every
  tappable at least **48 dp**, expanding hit areas without changing the visual size (e.g. 22 px lane dots
  keep their look but get a 48 dp tap area).

### 8.4 Iconography

The web uses **Lucide** line icons (stroke 2, sizes 10–20 px) and system emoji. Android: Material Symbols
Outlined (weight 400) or bundle the Lucide set; keep stroke weight consistent. Mapping used in the UI:

| Concept            | Lucide name        | Concept          | Lucide name          |
| ------------------ | ------------------ | ---------------- | -------------------- |
| Voice              | `mic`              | Photo            | `camera`             |
| Video              | `film`             | Dictate          | `audio-lines`        |
| Send               | `arrow-right`      | Attach           | `+` (plain glyph)    |
| Tag button         | `hash`             | Tag (filters)    | `tag`                |
| Filters            | `sliders-horizontal` | Dates          | `calendar`           |
| Select             | `check-square`     | Delete           | `trash-2`            |
| View grid/list/board | `grid-2x2` / `list` / `layout-dashboard` | More | `more-horizontal` |
| Settings           | `settings`         | Pattern Radar    | `brain`              |
| Sound on/off       | `volume-2` / `volume-x` | Focus sound | `music`             |
| Sidebar toggle     | `panel-left-open` / `panel-left-close` | Pin | `pin`           |
| Search             | `search`           | Close            | `x`                  |
| Check/selected     | `check`            | Chevron          | `chevron-down`       |
| Camera flip        | `switch-camera`    | Retry            | `refresh-cw`         |
| Back               | `arrow-left`       | Trend up/down    | `trending-up/down`   |
| Edit               | `edit-3`           | Duplicate        | `copy`               |
| Folder             | `folder`, `folder-plus` | Export      | `download`, `file-text`, `file-json` |

Emoji are rendered by the system emoji font (Noto Color Emoji on Android).

### 8.5 Component specifications

Measurements are the web values; scale to dp 1:1.

**Card** (§6.5): bg `paper-raised` (or lane tint), border 1 `line`, radius 8, padding `14 14 10 16`,
min-height 160 (Board: 0), **left rule** 3 wide, inset 12 top/bottom, radius 3, `ink-faint` @ 50 % (lane
colour at 100 % when the lane has one). Hover (pointer only): translateY(−1), shadow, border `ink-faint`.
Selected: 2 px vermilion outline (offset −1) + vermilion glow. Footer separated by a 1 px `line` top rule,
padding-top 8.

**Status pill**: mono 9 caps, padding `2 8`, radius full, 1 px border, colours per §8.1; icon + label.

**Lane dot**: 22 circle, glyph 11; "on" = 9 % black fill + inset 1 px `line`.

**Preset pill**: padding `6 13`, mono 11, gap 6, radius full; hover lifts 1 px and turns vermilion; active =
solid vermilion + 28 % vermilion shadow. The icon-only Dictate pill uses padding `6 10`.

**Toolbar button (`tool-btn`)**: padding `5 11`, mono 11, radius full, 1 px `line`; on = ink fill with
paper text; icon-only variant padding `5 8`. **Count badge**: vermilion pill, 9 px text, min width 16.
**Inbox chip**: dashed 1 px `ink-faint`, padding `5 12`; on = solid ink fill. Count badge inside: 9 px on a
7 % black pill (22 % white when on).

**Filter chip (`cat-filter-chip`)**: padding `4 10`, mono 11, radius full, 1 px `line`, paper-raised; on =
ink fill. **Active-filter chip**: 1 px vermilion border, `vermilion-soft` fill, vermilion text, padding
`3 9`, mono 10, with a trailing ×; pressed = vermilion fill.

**Pop menu**: min-width 190, padding 5, radius 12, 1 px `line`, large shadow; items padding `8 10`, mono 11,
radius 8; hover `muted`; checks/state text in vermilion at the right.

**Dialogs (`desk-modal`)**: width min(100%, 420), radius 14, padding `20 24`, `paper-raised`, dialog shadow;
enter = scale 0.95 → 1 + fade in 200 ms over a 50 % scrim.

**Day panel**: padding `14 16 16`, radius 16, 1 px `line`, bg `#F6F2EA` @ 70 %; header row (title · subtitle ·
count) with a 1 px bottom rule, margin-bottom 12; empty state dashed box, mono 11 `ink-faint`, centred.

**Pager**: round-pill numbers min 30×30, mono 12, current = ink fill; arrows 30×30; info line mono 10
`ink-faint`.

**Switch** (Settings): 74 × 30 pill, 22 px knob (3 px inset), off = `muted` bg with the word `Off`, on =
vermilion bg with `On`; knob slides 44 px over 180 ms.

**Toast**: fixed bottom centre 24 px, ink bg, paper text, radius full, padding `10 18`, mono 11, enter =
fade + 8 px rise 250 ms; Undo is an outlined mini-pill inside. Above the selection bar the toast sits 84 px
from the bottom.

**Stage**: see §6.4. Status dot 9 px (grey idle; vermilion + pulsing ring while recording).
**Shutter**: 56 px vermilion circle, 4 px paper-raised border, 2 px vermilion outline; pressed scales 0.92.
**Stage save button**: padding `8 16`, vermilion, mono 11 semibold, radius full.

**Dashboard card**: padding `14 16 16`, radius 16, 1 px `line`, `paper-raised`; heading mono 11 semibold caps
+0.06 em with a small grey sub-caption. KPI tile: padding `12 14`, radius 14.

**Drawer (detail)**: width min(100%, 460), bg `paper`, large shadow, slides in 24 px + fades 280 ms.

**Selection bar**: pill, ink bg, paper mono 11 text, vermilion **Export PDF** pill, padding `8 10 8 18`.

### 8.6 Motion

| Name             | Where                          | Spec                                                                  |
| ---------------- | ------------------------------ | --------------------------------------------------------------------- |
| `stage-in`       | Stage, menus, popovers, panels | 180–320 ms, `cubic-bezier(0.16, 1, 0.3, 1)`, from opacity 0 / translateY(−8) / scale 0.985 |
| `drawer-in`      | Detail drawer                  | 280 ms ease, from translateX(24) opacity 0.6                          |
| `modal-scale-in` | Dialogs                        | 200 ms ease, scale 0.95 → 1, fade                                     |
| `toast-in`       | Toast                          | 250 ms ease, fade + translateY(8)                                     |
| `stage-pulse`    | Recording dot / REC badge      | 1.4 s infinite, ring grows 0 → 9 px and fades from 55 % → 0           |
| `stage-flash`    | Photo shutter                  | White overlay 95 % → 0 in 320 ms                                      |
| Hover lift       | Buttons, pills                 | 160–200 ms, translateY(−1)                                            |
| Card actions     | Footer actions                 | 160 ms opacity                                                        |
| Switch knob      | Settings                       | 180 ms, same easing as `stage-in`                                     |

`prefers-reduced-motion`: reduce all animation and transition durations to ~0. **Android:** honour the
system "Remove animations" setting.

### 8.7 States

Every interactive element needs: default, pressed/hover (web: lift + colour), focus-visible (2 px vermilion
outline, offset 2), selected/on (ink or vermilion fill per component), disabled (45–50 % opacity, no
interaction). Empty, loading ("Starting camera…", "Starting microphone…") and error states are specified in
§6 and §9.

### 8.8 Layout rules worth copying

- Chrome is quiet: **one** primary accent per screen; everything else is ink on paper.
- Controls that are not needed at rest appear on hover/focus (card actions, type chevron, hint line).
- Filters are hidden until asked for; only **active** filters surface as removable chips.
- Counts live inside chips as a small pill; never as separate labels.
- Use dashed borders for "not yet sorted/empty" (Inbox chip, empty Today).

### 8.9 Sound design (optional but part of the feel)

All sounds are synthesised, short, quiet, and can be muted (Sound effects) at any time. Master gain values
are tiny on purpose.

| Event                     | Recipe                                                                                   |
| ------------------------- | ---------------------------------------------------------------------------------------- |
| **Dump chime** (save)     | 4 triangle tones 523.25, 659.25, 783.99, 1046.5 Hz, each starting 40 ms after the last, gain 0.08 decaying to 0.001 over 350 ms |
| **Route swoosh** (move/status/type) | sine sweep 300 → 800 Hz over 80 ms, gain 0.05 → 0.001                          |
| **Chime** (open a stage / unmute) | sine 880 Hz (high) or 330 Hz (low), 120 ms, gain 0.05 → 0.001                      |
| **Focus drone**           | sine at 216 Hz, fades in to gain 0.025 over 1 s, fades out over 0.5 s                    |

**Android:** generate PCM and play via `AudioTrack`/`SoundPool`; respect `AudioManager` ringer mode and
never play over an active recording.

---

## 9. Copy deck

### 9.1 Static labels and tooltips

- App/page title: `Horixon — Brain Dump & Pattern Radar`. Description: `A local-first notebook with dots.
  Capture thoughts, photos and voice in one tap, then find the patterns.`
- Sidebar: `Brainstorm Desks`, `Pinned Desks`, `<n> workspaces active`, `+ Add Desk`, `New`.
- Capture: placeholder `Capture anything…`; presets `Voice`, `Photo`, `Video`, `Dictate` (tooltips: `Record a
  voice note`, `Take a photo`, `Record a video`, `Speak and see your words typed`).
- Toolbar: `Filters`, `Dates`, `Inbox`, tooltips `Filter by lane, type, status, date and content`,
  `Pick an exact date range`, `Select cards to export`, `View options`,
  `Not sorted yet: no type, or still in the inbox lane`.
- Card: `Change type`, `Set type & tags`/`Add tag`, `Click to advance status`, `Send to <lane>`,
  `Delete thought`, `read more →`.
- Selection bar: `<n> selected`, `· <m> hidden by filters`, `Select all <n> shown`, `Clear`, `Export PDF`,
  `Preparing…`, `Select day`.
- Dashboard: `Pattern Radar`, `Notes`, `This week`, `Active days`, `Streak`, `Inbox`, `Notes per day`,
  `Activity dots`, `By type`, `Status flow`, `Word patterns`, `Rising this week`, `Timeline`, `Top signal`,
  `Set In Action`, `← Notes`.

### 9.2 Toasts and status (exact)

`Saved to "<desk>"` · `Capture undone` · `Added to this capture · press ↵ to save` · `Recording not saved:
<reason>` · `Status: <label>` · `Routed to <lane>` · `Back to Inbox` · `Thought deleted` ·
`Demo thoughts restored` · `Pasted <n> image(s) from clipboard!` · `Added category "<name>"` · `Category
already exists` · `Maximum 10 categories allowed` · `Created "<title>" (#<id>)` · `Updated desk "<title>"` ·
`Deleted desk "<title>"` · `Duplicated "<title>"` · `Pinned/Unpinned "<title>"` · `Page ID already exists. Try
another ID.` · `Choose a unique readable name.` · `Cannot delete the only remaining brainstorming desk.` ·
`Complete desk exported. The live desk is unchanged.` · `Imported as a new desk. Choose its folder to save to
disk.` · `Desk folder saved. Assets remain local copies.` · `Saving desk folder…` · `Saved to desk folder` ·
`Folder not saved` · `Loaded from desk folder` · `Export failed: <reason>` · `Import failed: <reason>` ·
`Open failed: <reason>` · `Print dialog opened · choose “Save as PDF”` · `Advanced "<keyword>" to In Action` ·
`Listening... Speak your mind` · `Voice recognition stopped` · `Speech recognition not supported in this
browser.` · `Sound effects on/off` · `Focus sound on/off`.

### 9.3 Capture errors

| Cause                              | Message                                                                                           |
| ---------------------------------- | ------------------------------------------------------------------------------------------------- |
| Permission denied/blocked          | `Permission was blocked. Allow the camera or microphone in your browser's address bar, then try again.` (Android: "…in Settings > Apps > Horixon > Permissions…") |
| No device                          | `No camera or microphone was found on this device.`                                               |
| Device busy                        | `The camera or microphone is being used by another app.`                                          |
| No recording API                   | `Recording isn't supported in this browser.` / `This browser can't access the camera or microphone.` |
| Photo failed                       | `Could not process the photo.`                                                                    |
| Attachment too large               | `Each attachment must be 20 MB or smaller.`                                                       |
| Media store unavailable            | `This browser can't store recordings.` / `Could not open the recordings store.` / `Recording could not be stored.` |

### 9.4 Package errors (exact)

`This package has no desk.json.` · `Missing or unsafe attachment: <name>` · `Unsafe attachment path.` ·
`Package is too large or contains unsafe paths.` · `Package must be under 100 MB.` · `Desk JSON is too
large.` · `Desk exceeds attachment limits.` · `Desk attachments exceed the 100 MB package limit.` ·
`An attachment exceeds the 20 MB limit.` · `Attachment is too large.` · `Could not read <file>` · plus the
folder messages in §6.12.

---

## 10. Accessibility requirements

- **Roles/labels:** toolbar buttons have `aria-label`s (Select cards, Take a photo, Add or change tags…);
  switches use `role="switch"` + `aria-checked`; menus use `menuitem`/`menuitemradio`/`menuitemcheckbox`;
  the card is `role="button"` with `aria-label="Open thought: <text>"`; day panels are labelled by their
  heading; pages use `aria-current="page"`; the stage is a labelled region; errors use `role="alert"`;
  toasts and the save status are `role="status"`.
- **Keyboard (web):** every control is reachable and operable; focus ring = 2 px vermilion with 2 px offset.
- **Android:** TalkBack labels for every icon button; announce the recording state and elapsed time (rate
  limited); announce toasts via `LiveRegion`; support font scaling to 200 % (cards grow, clamp stays 4
  lines, the layout reflows); minimum 48 dp targets; contrast: `ink` on `paper` is ~13:1, `ink-soft` ~6:1,
  `ink-faint` ~3:1 (use only for non-essential captions); don't rely on colour alone for status (icon +
  label are always shown).
- **Motion:** respect "Remove animations".
- **Permissions UX:** explain camera/mic use at first use, never at launch.

---

## 11. Android implementation blueprint

### 11.1 Recommended stack

Kotlin, Jetpack Compose (Material 3 as a thin layer over the custom theme), Navigation Compose
(single activity), Room, DataStore (Preferences), Kotlin Coroutines/Flow, CameraX (photo + video),
`MediaRecorder` (voice) and `SpeechRecognizer` (dictation), Coil (images), Media3 `ExoPlayer` or the platform
`MediaPlayer` for playback, WorkManager (not needed for sync; optional for housekeeping), Hilt or manual DI.
`minSdk 26`, `targetSdk` current. No analytics, no network libraries, no Firebase.

### 11.2 Module and package layout

```
app/
 ├─ data/
 │   ├─ db/          Room entities, DAOs, migrations
 │   ├─ media/       MediaStore (files under filesDir/media/{deskId}/), thumbnailer
 │   ├─ prefs/       DataStore wrapper (active desk, sidebar width, categories, meta, groupByDate)
 │   └─ packageio/   DeskPackage (ZIP + folder via SAF), DeskSchema validation, safeName, hydrate/migrate
 ├─ domain/
 │   ├─ model/       Desk, Thought, Attachment, StatusItem, LaneItem, Filters
 │   ├─ rules/       FilterEngine, DayGrouping, Pagination, Patterns, Echoes, HashtagParser, Slug
 │   └─ usecase/     Capture, CommitCapture, Undo, Route, CycleStatus, ExportPdf, ImportDesk …
 ├─ ui/
 │   ├─ theme/       Color.kt, Type.kt, Shape.kt, Motion.kt (design system of §8)
 │   ├─ components/  PresetPill, StatusPill, ThoughtCard, DayPanel, Pager, PopMenu, Switch, Toast, …
 │   ├─ workspace/   WorkspaceScreen, CaptureBar, StagePanel, Toolbar, FiltersPanel, SelectionBar
 │   ├─ detail/      ThoughtDetailSheet, StatusEditor, LaneEditor, Lightbox
 │   ├─ radar/       PatternRadarScreen + chart composables
 │   └─ settings/    SettingsSheet
 ├─ capture/         VoiceRecorder, VideoRecorder (CameraX), PhotoCapture, Dictation, AmplitudeMeter
 ├─ widget/          Glance widget, shortcuts, share-target activity, deep links
 └─ sound/           ToneSynth
```

Keep `domain/rules` free of Android types so it can be unit-tested against the web's behaviour (port the
cases of `scripts/test-desk-package.mjs` and §12).

### 11.3 Data layer

**Room schema** (mirror web field names so import/export is trivial):

```kotlin
@Entity(tableName = "desks")
data class DeskEntity(
  @PrimaryKey val id: String, val title: String, val slug: String?, val projectId: String?,
  val intent: String?, val desiredOutcome: String?, val emoji: String, val group: String,
  val isPinned: Boolean, val createdAt: Long, val updatedAt: Long,
  val customStatusesJson: String?, val customLanesJson: String?,
)
@Entity(tableName = "thoughts", foreignKeys = [ForeignKey(DeskEntity::class, ["id"], ["deskId"], onDelete = CASCADE)],
        indices = [Index("deskId", "createdAt")])
data class ThoughtEntity(
  @PrimaryKey val id: String, val deskId: String, val text: String, val category: String,
  val lane: String, val status: String, val tagsJson: String, val createdAt: Long,
)
@Entity(tableName = "attachments", foreignKeys = [ForeignKey(ThoughtEntity::class, ["id"], ["thoughtId"], onDelete = CASCADE)])
data class AttachmentEntity(
  @PrimaryKey(autoGenerate = true) val rowId: Long = 0, val thoughtId: String, val position: Int,
  val kind: String /* IMAGE | AUDIO | VIDEO | FILE */, val name: String, val mime: String,
  val seconds: Int?, val relativePath: String /* media/{deskId}/{uuid}.ext */, val sizeBytes: Long,
)
```

- `updatedAt` on the desk is bumped on every thought or desk change (the web does this).
- A thought with `isInbox` is a derived query, not a column.
- **Photos** (web keeps them as data URLs) become `IMAGE` attachments with files. On export they go to
  `assets/` and `image: true`; on import `IMAGE` mime types restore as images.
- **Deleting a thought or desk must not delete media files** (parity with the web's no-auto-cleanup rule);
  provide an optional "Clean up unused recordings" tool later (it is on the roadmap).
- **Autosave** is simply Room writes. Keep the web's guarantee: if a write throws, show the error and do
  not drop the in-memory capture.
- **Unreadable database:** if Room fails to open, do not delete or recreate silently; show the §5.2 copy
  and offer to export the raw file.

**Preferences (DataStore):** `activeDeskId`, `sidebarWidthDp` (tablet only), `categories` (ordered list),
`categoryMeta` (map), `groupByDate` (default true). Provide the same defaults as §4.3.

### 11.4 Capture on Android

- **Voice:** `MediaRecorder` with `AudioSource.MIC`, `OutputFormat.MPEG_4`, `AudioEncoder.AAC`,
  `setAudioEncodingBitRate(32_000)` (or 64 kbps for a clearer voice; keep file size well under 20 MB at
  180 s), 16 kHz–44.1 kHz. Poll `getMaxAmplitude()` every 45 ms for the waveform. Auto-stop at 180 s. Keep
  the screen on while recording. Foreground-service microphone type is required only if recording must
  continue when the app is backgrounded; v1 can stop on background and save what was captured.
- **Video:** CameraX `VideoCapture` with `Recorder`, quality `SD`/`HD` chosen so 120 s stays under 20 MB
  (target ≈ 900 kbps video + 64 kbps audio), H.264/AAC `.mp4`. Show the viewfinder in the Stage. Auto-stop at
  120 s.
- **Photo:** CameraX `ImageCapture`; decode, downscale so the longest edge ≤ 1600 px, JPEG quality 85,
  **single encode**; play the 320 ms white flash.
- **Dictation:** `SpeechRecognizer` (`EXTRA_PARTIAL_RESULTS`, prefer on-device where `isOnDeviceRecognitionAvailable`);
  append recognised text to the field. Be explicit in Settings if recognition may use a network service.
- **Permissions:** `CAMERA`, `RECORD_AUDIO` requested lazily at first use of the matching preset. No storage
  permission is needed (app-private files + SAF).
- **Save order:** write the media file to `filesDir` first; only then insert the thought + attachment in one
  Room transaction (the web's "recording saved before the card" rule). If the file write fails, show
  `Recording not saved: <reason>`.
- **Instant-save rule** and fallback texts exactly as §6.3.

### 11.5 Disk folder, ZIP and PDF

- **Folder:** `ACTION_OPEN_DOCUMENT_TREE`, `takePersistableUriPermission`, `DocumentFile`. Same
  `desk.json` + `assets/` layout, same content-addressed names, `desk.json` written last, 500 ms debounce,
  serialised writes, same status strings. Reject a folder already used by another desk; apply the
  different-desk-id and replace-confirmation rules of §6.12. Persisting the permission lets the connection
  survive restarts.
- **ZIP:** `java.util.zip` (stored, no compression), the exact paths and validation of §5.3. Import always
  creates a new desk with fresh UUIDs and the `-import-<8>` slug. Use the Storage Access Framework
  `CreateDocument`/`OpenDocument` for export/import.
- **PDF:** generate the same HTML as `buildExportHtml` (port it to Kotlin; or embed the HTML as a template),
  load it into an off-screen `WebView`, wait for images and fonts (4 s cap), then call
  `WebView.createPrintDocumentAdapter(...)` with `PrintManager` so the user picks "Save as PDF". Bundle the
  fonts as local files referenced via `@font-face` so the PDF matches without network. Text and images only.

### 11.6 Screens → Compose mapping

| Web element                | Compose                                                                          |
| -------------------------- | -------------------------------------------------------------------------------- |
| Workspace                  | `Scaffold` + `ModalNavigationDrawer` (compact) / permanent drawer (expanded)     |
| Top bar                    | Custom `Row` (not M3 `TopAppBar`), mono/serif text                                |
| Capture bar                | `Surface(shape=RoundedCornerShape(12.dp))` + `BasicTextField`                     |
| Preset pills               | Custom `PillButton`                                                              |
| Stage                      | `AnimatedVisibility(slideInVertically + fadeIn)` containing the mode content      |
| Waveform                   | `Canvas` bars per §6.4                                                           |
| Toolbar / chips            | `FlowRow` of `PillButton`s                                                       |
| Filters panel              | `AnimatedVisibility` card with `ExposedDropdownMenuBox`es + `FlowRow` chips      |
| Day panels + cards         | `LazyColumn` of panels; cards in a `LazyVerticalGrid`/`FlowRow` per panel         |
| Pager                      | Row of numbered pills (keep the numbered design for parity)                      |
| Type/tag pickers           | `Popup` or `ModalBottomSheet`, one-tap-and-close                                 |
| Detail                     | `ModalBottomSheet` (partially expanded → full)                                   |
| Lightbox                   | Full-screen dialog with `HorizontalPager` + pinch zoom                           |
| Dashboard                  | Scrollable `LazyColumn` of cards; charts on `Canvas`                              |
| Toast + Undo               | Custom `Snackbar`-style pill (`SnackbarHost` with custom visuals)                |
| Settings                   | `ModalBottomSheet` or full-screen dialog                                         |

**State:** one `WorkspaceViewModel` per desk-selection owning `UiState` (filters, view, page, selection,
stage, picker, drawer). Persisted state is in Room/DataStore; transient UI state (picker positions, stage
timers) stays in the ViewModel/composition. Derive the filtered list, day groups and pagination with pure
functions from `domain/rules`, matching §6.7–6.8 and §7.

### 11.7 Quick capture surfaces (the mobile goal)

The product's promise is "one tap → type/record → saved". On Android deliver it through:

1. **Home-screen widget (Jetpack Glance):** four buttons Text, Voice, Photo, Video. Each opens
   `CaptureActivity` via deep link `horixon://capture/{text|voice|photo|video}` and starts immediately
   (voice and video start recording on open; photo opens the viewfinder; text focuses the field). Saving
   uses the same `commitCapture` rule and defaults to the last active desk (or the first pinned desk).
2. **App shortcuts** (long-press the icon): Voice note, Photo, Video, New note (dynamic shortcuts).
3. **Share target:** `ACTION_SEND` / `ACTION_SEND_MULTIPLE` for `text/*` and `image/*`: creates an Inbox
   card (text → text; images → attachments) and shows the standard "Saved to <desk>" toast.
4. **Quick Settings tile** (optional): launches `horixon://capture/voice`.
5. `CaptureActivity` is a translucent activity so the user stays in context; it finishes after saving and
   shows the Undo affordance briefly.

### 11.8 Performance and robustness

- Never serialise the whole database on each change (the web does for localStorage; Room is incremental).
- Load media lazily; generate and cache thumbnails (≈ 256 px) for photos.
- Paginate by day panels exactly as §6.8 for parity; internally query by day ranges.
- Keep recordings out of the main thread; copy streams in chunks; check free space before recording.
- Handle process death mid-recording: write to a temp file and finalise on stop; on next launch, offer to
  recover an orphaned temp file as a card.

### 11.9 Fonts and assets

Bundle: Fraunces (variable), IBM Plex Mono (Regular, Medium), Inter (Regular, Medium, SemiBold) as local
fonts. Icons: Lucide or Material Symbols. App icon: a vermilion dot (`#BF4213`) centred on a `#F4F0E6`
rounded square (the web favicon). Splash: `paper` background with the dot.

### 11.10 Testing strategy

- **Unit tests (JVM):** port `FilterEngine`, `DayGrouping`, `Pagination`, `Patterns` (terms, rising, streak,
  heatmap), `Echoes`, `HashtagParser`, `Slug`, `safeName`, relative time and `deskContext`.
- **Package contract tests:** round-trip ZIP and folder exports; import safety (traversal, missing assets,
  oversize); duplicate file names; "no live mutation"; failure leaves previous `desk.json` intact. Port the
  assertions of `scripts/test-desk-package.mjs` one-to-one, and import a package produced by the web app.
- **UI tests (Compose):** instant capture saves to Inbox in Today; type picker and tag picker apply in one
  tap; stage lifecycle; selection persists across filters; Today panel present when empty; pager numbers.
- **Manual device tests:** permissions denied/granted, recording interrupted by a call, rotation, split
  screen, font scale 200 %, TalkBack, low storage.

---

## 12. Parity checklist (acceptance)

Mark each item against the web app (`npm run dev`) before shipping.

**Capture**
- [ ] Enter saves; the card appears at the top of Today as Inbox, `captured`, lane `inbox`.
- [ ] Hashtags in the text become tags (lowercase, unique).
- [ ] Undo toast appears for 6 s and removes exactly that card.
- [ ] Voice starts instantly, waveform moves, timer counts to 3:00, auto-stops, saves `Voice note · m:ss`.
- [ ] Video starts instantly with REC badge, auto-stops at 2:00, saves `Video clip · m:ss`.
- [ ] Photo flashes, saves a ≤ 1600 px JPEG, text `Photo`.
- [ ] Media with typed text joins that capture instead of saving separately.
- [ ] Recording is stored before the card; a failed write creates no card and shows the error.
- [ ] Type chip resets to Inbox after each save; adding a category enforces the limit of 10 and duplicates.

**Cards and pickers**
- [ ] Tapping the type label opens a types-only picker; one tap applies and closes.
- [ ] The `#` button opens a tags-only picker; tap toggles and closes; Enter adds a new tag and closes.
- [ ] Status pill cycles statuses with a toast; lane dots route and the current lane returns to Inbox.
- [ ] Text clamps to 4 lines; "read more →" appears above 180 characters.
- [ ] Audio/video attachments play in the card; a missing recording says so.

**Browsing**
- [ ] Day panels show Today (always, when unfiltered), Yesterday, then dated panels with `N days ago`.
- [ ] 7 day panels per page; the pager shows numbers with ellipses; filters reset the page.
- [ ] Group-by-date setting off → flat list, 12 per page; the choice persists.
- [ ] Inbox chip count and filter match `lane == inbox || category == Unsorted`.
- [ ] Filters combine with AND; active chips are removable; `Clear all` works; empty result copy is exact.
- [ ] Dates chip sits next to Filters; custom range filters by local days inclusive.
- [ ] Board has five lanes and no day grouping.

**Selection and export**
- [ ] Selection persists across filter and page changes; the bar shows the hidden count.
- [ ] Exported PDF contains only text and images, grouped by day newest first, with the footer notice.

**Pattern Radar**
- [ ] KPIs, bar chart (14/30/90), trend line, 12-week dots, type bars, status stack, word cloud, rising
      terms and timeline render from the active desk only; switching desks changes everything.
- [ ] Every chart or list item jumps to the filtered notes and clears other filters first.
- [ ] Empty desk shows the empty copy.

**Desks and storage**
- [ ] Create/edit/duplicate/delete/pin follow §6.1 (including slug uniqueness and last-desk protection).
- [ ] ZIP export → import creates a new desk with new ids; media survives; web ZIP imports on Android and
      Android ZIP imports on web.
- [ ] Folder connect/open follow the id-match and confirmation rules; saving is debounced and serialised.
- [ ] Unreadable data pauses saving and leaves the original untouched.
- [ ] Legacy prototype data (not applicable on Android) is ignored.

**Design**
- [ ] Colours, type, radii, spacing and motion match §8 (screenshot-compare against the web).
- [ ] Hover-only affordances are always reachable on touch; lane dots live in the detail sheet.
- [ ] 48 dp touch targets; font scale 200 % holds; TalkBack reads every control.

---

## 13. Source map (web file → responsibility → Android equivalent)

> This is the short version. §16 has the full file tree, §18 lists functions with line numbers, and §19 indexes the stylesheet.

| Web file                              | Responsibility                                                                 | Android equivalent                             |
| ------------------------------------- | ------------------------------------------------------------------------------ | ---------------------------------------------- |
| `src/routes/index.tsx`                | The whole workspace: state, desks, capture, filters, views, drawer, settings   | `ui/workspace`, `ui/detail`, `ui/settings` + ViewModel |
| `src/routes/__root.tsx`               | HTML shell, head metadata, error and 404 pages                                 | `MainActivity`, splash, theme                  |
| `src/components/CaptureStage.tsx`     | Live voice/photo/video/dictate panel, waveform                                 | `capture/*`, `ui/workspace/StagePanel`         |
| `src/components/MediaPlayer.tsx`, `src/hooks/use-media-src.ts` | Audio/video playback for stored refs and data URLs         | Media3/`MediaPlayer` + file URIs               |
| `src/components/PatternDashboard.tsx` | Dashboard UI and charts                                                        | `ui/radar`                                     |
| `src/lib/desk-package.ts`             | Schema, ZIP, folder read/write, import validation, `deskContext`               | `data/packageio`                               |
| `src/lib/media-store.ts`              | IndexedDB blob store, hydrate/migrate, media kind                              | `data/media`                                   |
| `src/lib/capture-media.ts`            | Limits, recorder MIME choice, photo capture, level meter, error copy           | `capture/*`                                    |
| `src/lib/patterns.ts`                 | Stop words, terms, rising, daily counts, streak, heatmap                       | `domain/rules/Patterns`                        |
| `src/lib/dates.ts`                    | Local-day helpers and grouping                                                 | `domain/rules/DayGrouping`                     |
| `src/lib/export-pdf.ts`               | Print-ready HTML and print flow                                                | `usecase/ExportPdf` + WebView print            |
| `src/lib/sound.ts`                    | Synthesised sounds                                                             | `sound/ToneSynth`                              |
| `src/styles.css`                      | The design system (§8)                                                         | `ui/theme` + component styles                  |
| `src/server.ts`, `start.ts`, `lib/error-*`, `lib/lovable-error-reporting.ts` | SSR wrapper, security headers, error pages | not needed on Android                          |
| `scripts/test-desk-package.mjs`       | Package contract tests                                                         | JVM tests (§11.10)                             |
| `DESK-STORAGE.md`                     | Storage rationale and limits                                                   | keep as the policy reference                   |

---

## 14. Known gaps, deviations and open decisions

**Web limitations Android should not copy**
- Folder access on the web lasts for one session; Android should persist the URI permission.
- The web keeps everything in one localStorage JSON blob and has a ~5 MB ceiling; Android uses Room.
- The web's `desk.json` drops `seconds` for recordings; Android should write it (safe extra field).
- Dictation on the web uses the browser vendor's speech service; offer on-device recognition on Android.
- The web has no dark theme and no true widget; Android should add the widget and quick-capture surfaces
  (§11.7) and may add a dark theme later as a separate design task.

**Behaviours kept on purpose even though they look odd**
- Deleting a card or desk never deletes its recordings (no destructive auto-cleanup).
- Inbox means "no type or still in the Inbox lane", so setting a type does not remove a card from the Inbox
  until it is routed to another lane. This was an explicit product decision.
- Clicking a card's type label opens the type picker; filtering by type lives only in the Filters panel.
- The Today panel appears only when no filter, search or Inbox chip is active.

**Open decisions for the Android team**
1. Which desk do widget/share captures target: the last active desk (recommended) or a dedicated Inbox desk?
2. Keep the numbered day pager (exact parity) or switch to infinite scroll with sticky day headers on phones?
3. v1 recording while the app is backgrounded (needs a foreground service) or stop-on-background?
4. Whether to ship the optional paper-grain background.

**Roadmap items not in this spec** (see `roadmap.md`): merging selected cards into a "mission" (connected
nodes under one goal) with a Concluded Merges list in Settings; a Tree view; installable PWA surfaces and a
native widget; self-hosted fonts; an optional cleanup tool for unreferenced recordings. The mind-map graph
view was removed deliberately and must not be rebuilt as-is.

---

## 15. Glossary of persisted and derived values

| Name               | Type    | Derived from                                            |
| ------------------ | ------- | ------------------------------------------------------- |
| `isInbox(t)`       | boolean | `t.lane === "inbox" \|\| t.category === "Unsorted"`      |
| `dayKey(t)`        | string  | local `YYYY-MM-DD` of `t.createdAt`                     |
| `hasKind(t, k)`    | boolean | image / link / audio / video / file (§6.7)              |
| `activeExtraFilters` | int   | count of lane, type, status, untagged, date, contains-kinds that are active |
| `dayPageCount`     | int     | `ceil(dayGroups.length / 7)` (≥ 1)                      |
| `groupedView`      | boolean | `groupByDate && (view is grid or list)`                 |
| `noActiveFilters`  | boolean | no panel filters, no Inbox chip, empty search           |
| `selectedHidden`   | int     | selected ids not in the current filtered list           |

---

# Appendices: repository reference

These appendices are written for an engineer who has the git repository open next to this document. Paths
are relative to the repository root. **Line numbers are a snapshot of the current commit; search by symbol
name if they have drifted.**

## 16. Repository map

```
horixon/                                   (package name "horixon", private)
├── AGENTS.md                              Project rules for contributors/agents (Lovable sync, storage, single screen)
├── README.md                              Quick start, scripts, layout, privacy, deploy
├── DESK-STORAGE.md                        Storage policy: folders, IndexedDB media, preferences, limits
├── roadmap.md                             Done / next
├── product_architecture.md                This document
├── package.json                           Scripts, dependencies (13 prod / 17 dev), engines >=20.19
├── package-lock.json                      npm lockfile (keep in sync)
├── bun.lock  +  bunfig.toml               bun lockfile and its settings (keep in sync)
├── tsconfig.json                          Strict TypeScript; path alias "@/*" -> "./src/*"
├── eslint.config.js                       ESLint flat config (+ prettier plugin, react-hooks, react-refresh)
├── .prettierrc  .prettierignore           Prettier: printWidth 100, double quotes, trailing commas, endOfLine auto
├── .gitattributes  .gitignore             LF normalisation; ignores .output, .nitro, .wrangler, .tanstack, .claude, .env*
├── components.json                        shadcn config (kept for Lovable tooling; no shadcn components remain)
├── vite.config.ts                         Uses @lovable.dev/vite-tanstack-config; server entry = src/server.ts
├── public/
│   └── favicon.svg                        Vermilion dot on paper (#C2410C on #F4EFE3)
├── scripts/
│   ├── test-desk-package.mjs              Package contract tests (ZIP/folder/import safety/AI feed)
│   └── preview.mjs                        Zero-dependency local production preview (serves .output/)
└── src/
    ├── routes/
    │   ├── __root.tsx                     HTML shell, <head> metadata, fonts, error + 404 pages
    │   ├── index.tsx                      THE WORKSPACE (route "/"): all state, handlers, JSX (~3.9k lines)
    │   └── README.md                      TanStack file-routing conventions (scaffold doc)
    ├── routeTree.gen.ts                   GENERATED by TanStack Router; never edit (Prettier-ignored)
    ├── router.tsx                         createRouter + QueryClient context
    ├── start.ts                           Start instance: error + CSRF request middleware
    ├── server.ts                          SSR wrapper: error normalisation + security headers
    ├── styles.css                         The entire design system and every component style (~4.7k lines)
    ├── components/
    │   ├── CaptureStage.tsx               Live voice / photo / video / dictate panel + waveform
    │   ├── MediaPlayer.tsx                MediaPlayer, MediaDownload (audio/video/file chips)
    │   └── PatternDashboard.tsx           Pattern Radar UI and SVG charts
    ├── hooks/
    │   └── use-media-src.ts               Resolve an attachment (idb ref or data URL) to a playable URL
    └── lib/
        ├── desk-package.ts                Schema, ZIP, folder read/write, import validation, deskContext
        ├── media-store.ts                 IndexedDB blob store, hydrate/migrate, mediaKind
        ├── capture-media.ts               Limits, recorder MIME choice, photo capture, level meter, error copy
        ├── patterns.ts                    Stop words, term counts, rising terms, daily counts, streak, heatmap
        ├── dates.ts                       Local-day maths and day grouping
        ├── export-pdf.ts                  Print-ready HTML for the PDF export + print flow
        ├── sound.ts                       Web Audio synthesised sounds
        ├── error-capture.ts               Server-side error capture helper (Lovable scaffold)
        ├── error-page.ts                  Static HTML for catastrophic server errors
        └── lovable-error-reporting.ts     No-op outside the Lovable editor (see §17.5)
```

**Not present any more (do not look for them):** `src/components/ConnectedGraphView.tsx` (the removed mind-map
graph), `src/components/<shadcn files>.tsx` (46 unused UI-kit wrappers), `src/lib/utils.ts`,
`src/hooks/use-mobile.tsx`. They may still appear in git history. The mind map was removed on purpose; see
§14.

**Generated, ignored folders:** `.output/` (production build), `.nitro/`, `.wrangler/`, `.tanstack/`,
`node_modules/`. `.claude/launch.json` is a local dev-tool file (ignored).

## 17. Tooling and configuration

### 17.1 Commands

| Command                | What it does                                                                                |
| ---------------------- | ------------------------------------------------------------------------------------------- |
| `npm install`          | Install (or `bun install`). Node ≥ 20.19 (≥ 22.18 to run the Node test script directly).    |
| `npm run dev`          | Vite dev server on `http://localhost:8080` (next free port if busy). Hot reload.            |
| `npm run build`        | Production build → `.output/` (Cloudflare Workers bundle + static assets).                  |
| `npm run preview`      | `node scripts/preview.mjs`: serves the built bundle on `http://localhost:4173`.             |
| `npm run lint`         | ESLint over the repo (must report 0 problems).                                              |
| `npm run typecheck`    | `tsc --noEmit --noUnusedLocals --noUnusedParameters`.                                        |
| `npm test`             | `node scripts/test-desk-package.mjs` (imports the `.ts` source directly; needs Node ≥ 22.18). |
| `npm run check`        | lint + typecheck + test + build. The gate to pass before every push.                        |
| `npm run format` / `format:check` | Prettier over `src` and `scripts`.                                              |

### 17.2 Runtime stack

TanStack Start 1.x (file-based routes, SSR) · React 19 · TypeScript 5.8 strict · Tailwind CSS 4 (only the
reset/`@theme` and `tw-animate-css`; all component styling is hand-written in `src/styles.css`) · Vite 8 ·
Nitro (preset `cloudflare-module`) · `zod` (schemas) · `fflate` (ZIP) · `lucide-react` (icons) ·
`@tanstack/react-query` (present only because the root route context requires a `QueryClient`; nothing
queries through it).

Production dependencies (13): `@tailwindcss/vite`, `@tanstack/react-query`, `@tanstack/react-router`,
`@tanstack/react-start`, `@tanstack/router-plugin`, `fflate`, `lucide-react`, `react`, `react-dom`,
`tailwindcss`, `tw-animate-css`, `vite-tsconfig-paths`, `zod`.

### 17.3 TypeScript strictness (matters when porting logic)

`tsconfig.json` enables `strict`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`,
`noPropertyAccessFromIndexSignature`, `noImplicitReturns`, `noImplicitOverride`. Consequences you can see in
the code: optional properties are typed `?: T | undefined`, array reads are guarded (`arr[i]?.x`), and index
signatures are read with brackets. When porting to Kotlin, treat every optional/indexed read as nullable.

### 17.4 Build output and deployment

`vite build` produces:

```
.output/
├── public/                 static assets (hashed JS/CSS in assets/, favicon.svg, _headers)
│   └── _headers            /assets/*  cache-control: public, max-age=31536000, immutable
└── server/
    ├── index.mjs           the Cloudflare Worker entry (default export { fetch })
    ├── wrangler.json       generated: name from package.json ("horixon"), compat date, ASSETS binding
    └── …                   chunks
```

- The Worker handles page requests; hashed assets are served by the platform's `ASSETS` binding.
- Deploy: publish from Lovable, or `npm run build && npx nitro deploy --prebuilt` after `wrangler login`.
- **No environment variables or secrets are used.** `.env*` is git-ignored defensively.
- `src/server.ts` adds `x-content-type-options: nosniff`, `referrer-policy: strict-origin-when-cross-origin`
  and `permissions-policy: camera=(self), microphone=(self), geolocation=(), payment=()` to HTML responses.
  There is deliberately no CSP and no `X-Frame-Options` (the Lovable editor previews the app in an iframe and
  fonts load from Google Fonts).
- Camera, microphone, IndexedDB persistence and folder access require a secure context (`https://` or
  `localhost`).

### 17.5 Lovable-specific files (ignore on Android)

`vite.config.ts` delegates plugins (TanStack Start, React, Tailwind, tsconfig paths, Nitro, `VITE_*` env
injection, the `@` alias) to `@lovable.dev/vite-tanstack-config`. `src/lib/lovable-error-reporting.ts` only
calls hooks that exist inside Lovable's editor preview; in production it does nothing. `AGENTS.md` states the
project's non-negotiables and is worth reading in full:

1. Avoid rewriting published git history (the repo syncs with Lovable).
2. Keep capture immediate; each desk owns a local folder (`desk.json` + `assets/`); browser storage is a
   fallback copy, not a backup; preserve legacy data; never claim a failed write succeeded; no server
   persistence or version history.
3. Keep the single-screen experience on `/`.

### 17.6 Inspecting the web app's behaviour live

Run `npm run dev`, open DevTools → **Application**: `Local Storage` shows every key in §5.1; `IndexedDB →
horixon_media → blobs` shows recordings. `localStorage.clear()` + reload returns to first-run seed data.
Use **Settings → Export complete desk (.zip)** to obtain a real package to test your importer against.

## 18. Code index (where each behaviour lives)

### 18.1 `src/routes/index.tsx` (the workspace)

**Module-level (above the component)**

| Symbol                                  | Line | Purpose                                                                   |
| --------------------------------------- | ---- | ------------------------------------------------------------------------- |
| `Route` (`createFileRoute("/")`)        | 76   | Route + page `<head>` (title, description, OG)                            |
| `Thought`, `Attachment`, `StatusItem`, `LaneItem`, `BrainstormDesk` types | 100–132 | The domain model (§4.1)               |
| `View`, `DateFilter`, `HasKind`         | 149–151 | UI enums                                                                |
| `LINK_PATTERN`, `hasKind()`             | 153–154 | "Contains" filter predicates (§6.7)                                       |
| `KEY`, `PAGE_SIZE`, `UNSORTED`          | 162–166 | Legacy key, 12 per flat page, `"Unsorted"`                                |
| `defaultCategoryMeta`, `defaultCategories`, `defaultStatuses`, `defaultLanes` | 168–194 | Defaults (§4.3)          |
| `samples`, `seed()`, `defaultDesks`     | 207–273 | Seed data (§4.4)                                                          |
| `relativeTime()`                        | 335  | "5m / 3h / 2d ago"                                                        |
| `Pager`                                 | 342  | Numbered pager with ellipses                                              |
| `parseRichStyles`, `parseInlineFormatting`, `renderFormattedText` | 425–471 | Light markup renderer (§7.8)       |
| `handleFormatShortcut()`                | 509  | Ctrl/Cmd + B / I / U wrapping                                             |
| `CardImageThumbnails`                   | 546  | Image strip on a card                                                     |
| `ImageZoomModal`                        | 612  | Lightbox (zoom 0.5–3.5, download, prev/next)                              |
| `VaultDirectoryModal`                   | 711  | The Settings dialog (View + storage sections)                             |
| `SavedState`, `loadSavedState()`        | 841–852 | Reads all saved data after mount (§5.2)                                   |
| `Index()`                               | 908  | The workspace component                                                   |

**State and handlers inside `Index()`** (by name; line numbers are where each begins)

| Concern                | Symbols (line)                                                                                                   |
| ---------------------- | ---------------------------------------------------------------------------------------------------------------- |
| Core data              | `desks` (913), `activeDeskId` (914), `updateActiveDesk` (995), `update` (1824)                                   |
| Folder + packages      | `handlePickDirectory` (1063), `handleExportDeskPackage` (1114), `handleOpenFolder` (1130), `handleImport` (1165), `attachFiles` (1179) |
| Filters                | `inDateRange` (1375), `isInbox` (1391), `resetFilters` (1411), `filtered` (1425), `hasFilters` (1031), `query` (1045) |
| Grouping + pages       | `toggleGroupByDate` (1508), `dayGroups` (1522), `visibleGroups` (1528)                                           |
| Patterns               | `patternFrequencies` (1443), `spotlightCandidate` (1472), `echoes` (1493)                                        |
| Desk management        | `handleAddCategory` (1536), `handleCreateDesk` (1564), `handleTogglePinDesk` (1600), `handleSaveEditDesk` (1619), `handleDeleteDesk` (1652), `handleDuplicateDesk` (1669) |
| Dictation              | `toggleSpeech` (1754)                                                                                            |
| Card actions           | `nextStatus` (1827), `cycleStatus` (1835), `route` (1844), `remove` (2034), `reset` (2018)                        |
| **Capture**            | `commitCapture` (1851), `save` (1880), `addCaptured` (1889), `undoCapture` (1981), `processPastedImages` (1212)   |
| **Stage**              | `openStage` (1904), `closeStage` (1912), `handleStageResult` (1918), `stageMode` (1043)                           |
| **Selection + PDF**    | `toggleSelect` (1942), `selectMany` (1949), `exitSelect` (1950), `exportSelectedPdf` (1955), `selectedIds` (1035) |
| **Pickers**            | `openQuickTag` (1988), `toggleTag` (2010), `quickTag` (1037)                                                      |
| Rendering              | `renderDeskItem` (2062), `card` (2121)                                                                           |

**JSX regions** (search for the class names)

| Region                          | Line  | Region                              | Line  |
| ------------------------------- | ----- | ----------------------------------- | ----- |
| Loading shell (`aria-busy`)     | 2272  | `.stream` (toolbar + lists)         | 2698  |
| `.workspace-sidebar`            | 2282  | `.stream-head` (search, chips, tools)| 2699 |
| `.topbar`                       | 2368  | `.active-filters`                   | 2870  |
| `.capture-box` (capture bar)    | 2461  | `.filter-panel`                     | 2926  |
| `.capture-dock` (presets+stage) | 2610  | `.board-grid`                       | 3042  |
| `<CaptureStage>`                | 2642  | `.day-groups`                       | 3061  |
| `<PatternDashboard>`            | 2653  | `<Pager>`                           | 3102  |
| `.desk-footer`                  | 3117  | `.select-bar`                       | 3162  |
| `.toast`                        | 3199  | `.quicktag-pop` (type/tag pickers)  | 3229  |
| Create-desk dialog              | 3299  | Edit-desk dialog                    | 3361  |
| `.detail-drawer`                | 3454  | `<ImageZoomModal>`                  | 3880  |
| `<VaultDirectoryModal>`         | 3902  |                                     |       |

### 18.2 Libraries and components

| File                                  | Key exports (line)                                                                                  |
| ------------------------------------- | --------------------------------------------------------------------------------------------------- |
| `src/lib/desk-package.ts`             | `deskSchema` (22), `safeName` (43), `MAX_FILE` (48), `readFile` (51), `packageFiles` (79), `exportZip` (111), `importFiles` (133), `readFolder` (161), `importZip` (181), `writeFolder` (199), `deskContext` (228) |
| `src/lib/media-store.ts`              | `MEDIA_PREFIX`/`isMediaRef` (8/12), `saveBlob` (49), `loadBlob` (55), `blobToDataUrl` (59), `hydrateDesk` (75), `migrateDeskMedia` (97), `mediaKind` (123) |
| `src/lib/capture-media.ts`            | `MAX_VOICE_SECONDS` (4), `MAX_VIDEO_SECONDS` (6), `formatClock` (8), `captureFrame` (15), `pickRecorderMime` (29), `clipName` (40), `friendlyMediaError` (45), `createLevelMeter` (58) |
| `src/lib/patterns.ts`                 | `stopWords` (4), `termsOf` (17), `termCounts` (29), `risingTerms` (39), `dailyCounts` (56), `movingAverage` (69), `currentStreak` (77), `weekOverWeek` (88), `heatmapWeeks` (101) |
| `src/lib/dates.ts`                    | `startOfDay` (3), `daysAgoStart` (10), `dayKey` (16), `dayLabel` (21), `fullDate` (35), `groupByDay` (46), `daysAgoHint` (63) |
| `src/lib/export-pdf.ts`               | `buildExportHtml` (53) (the PDF template, port this), `exportCardsPdf` (120)                        |
| `src/lib/sound.ts`                    | `toggleSound` (29), `playDumpChime` (40), `playRouteSwoosh` (71), `playChime` (100), `toggleAmbientFocus` (130) |
| `src/components/CaptureStage.tsx`     | `CaptureStage` (38); `StageMode`/`StageResult` types (16/17); waveform loop is inside the main effect |
| `src/components/PatternDashboard.tsx` | `PatternDashboard` (47), `DashHeader` (419); all chart geometry constants are in the render body    |
| `src/components/MediaPlayer.tsx`      | `MediaPlayer` (4), `MediaDownload` (28)                                                             |
| `src/hooks/use-media-src.ts`          | `useMediaSrc` (5)                                                                                   |
| `src/server.ts`                       | `withSecurityHeaders` (58), default `fetch` wrapper (71)                                            |
| `src/routes/__root.tsx`               | `Route` head/meta (75), `NotFoundComponent` (15), `ErrorComponent` (37), `RootShell` (120)         |
| `scripts/test-desk-package.mjs`       | The contract tests to port (§11.10)                                                                 |

### 18.3 Feature → files quick lookup

| Feature                         | Read these first                                                                                       |
| ------------------------------- | ------------------------------------------------------------------------------------------------------ |
| Instant capture + Undo          | `index.tsx`: `commitCapture`, `save`, `undoCapture`; JSX `.capture-box`                                 |
| Voice / photo / video / dictate | `CaptureStage.tsx`; `capture-media.ts`; `index.tsx`: `openStage`, `handleStageResult`, `addCaptured`    |
| Recording storage               | `media-store.ts`; `use-media-src.ts`; `MediaPlayer.tsx`                                                 |
| Type + tag pickers              | `index.tsx`: `openQuickTag`, `toggleTag`, JSX `.quicktag-pop`; CSS `separate pickers` section           |
| Filters, Inbox, Dates           | `index.tsx`: `filtered`, `isInbox`, `inDateRange`, `resetFilters`; JSX `.stream-head`, `.filter-panel`  |
| Day panels, pagination          | `index.tsx`: `dayGroups`, `visibleGroups`, `Pager`; `dates.ts`                                          |
| Select + PDF                    | `index.tsx`: select handlers, `exportSelectedPdf`; `export-pdf.ts`                                      |
| Pattern Radar                   | `PatternDashboard.tsx`; `patterns.ts`; `index.tsx`: `patternFrequencies`, `spotlightCandidate`          |
| Card detail drawer              | `index.tsx`: JSX `.detail-drawer`, `echoes`, status/lane editors                                        |
| Desks + sidebar                 | `index.tsx`: `handleCreateDesk` … `handleDuplicateDesk`, `renderDeskItem`; JSX `.workspace-sidebar`     |
| Settings + storage              | `index.tsx`: `VaultDirectoryModal`, folder handlers; `desk-package.ts`                                  |
| Load/save, migration            | `index.tsx`: `loadSavedState`, the autosave effects; `DESK-STORAGE.md`                                  |
| Sounds                          | `sound.ts`                                                                                              |
| Security headers, error pages   | `server.ts`, `error-page.ts`, `__root.tsx`                                                              |

## 19. Stylesheet index (`src/styles.css`, ~4.7k lines)

The file is one flat sheet (no CSS modules). Tokens are at the top (`:root`, lines 19–46; theme mapping
lines 5–17). Sections appear in this order; later sections intentionally override earlier ones, so a
component can have rules in several places (use search by class name).

| Lines (approx.) | Section                                                                 |
| --------------- | ----------------------------------------------------------------------- |
| 1–60            | Tailwind import, `@theme`, **colour tokens**, base reset, body          |
| 62–136          | Paper grain + vignette backgrounds                                      |
| 137–460         | Desk, topbar, brand, capture row, stream header, search, category bar (legacy) |
| 463–780         | **Cards** (lane tints, left rule, footer), list/timeline view, board    |
| 786–1090        | Pager (legacy), footer, **toast**, **drawer**, keyframes                |
| 1091–1160       | Responsive rules (≤ 900, ≤ 600), reduced-motion                         |
| 1162–1540       | Capture bar, category chip + popover, status stepper                    |
| 1540–1650       | Image thumbnails strip                                                  |
| 1646–2020       | **App shell and sidebar**, drag handle, main content                    |
| 2020–2340       | Modal dialogs, code/rich text, text clamp, image attachments            |
| 2336–2490       | Lightbox                                                                |
| 2488–2840       | Settings modal, drawer header, status/lane editors                      |
| 2834–2916       | Sound/focus controls (legacy)                                           |
| 2916–3035       | Quick capture (Inbox chip, quick-tag)                                   |
| 3035–3385       | **Capture dock: presets + Stage + waveform + viewfinder**               |
| 3385–3600       | **Filters, day panels, select mode and export bar**                     |
| 3598–3830       | **Decluttered chrome**: menus (`pop-menu`), Inbox chip, active filters, quiet cards, board overlay |
| 3823–4000       | **List-view rows**, phone shell (≤ 820), phone polish, touch rules       |
| 4000–4120       | Separate pickers, day panels + numbered pager                           |
| 4121–4590       | **Pattern Radar dashboard**                                             |
| 4586–4736       | Settings switch, date-range popover                                     |

**Breakpoints present:** `max-width: 900px`, `820px`, `700px`, `600px`; `hover: none`;
`prefers-reduced-motion: reduce`.
**Keyframes:** `toast-in`, `drawer-in`, `modal-scale-in`, `popover-slide-down`, `stage-in`, `stage-pulse`,
`stage-flash`, `pulse`, `lightbox-fade-in`.
**Z-order (low → high):** 1–2 page content · 5 save-status pill · 10 lightbox arrows · 20 detail-drawer scrim ·
30 sidebar and toast · 31 selection bar · 40 menu/picker backdrops and the sidebar drag handle · 41 pop menus
and the type/tag pickers · 50 capture type menu · 55 phone sidebar scrim · 60 phone sidebar drawer and the
sidebar desk-row menu · 70 dialog scrim · 100 image lightbox.

**Legacy selectors:** a few rules from removed features may remain (for example `.lane-tab*`, `.status-chip`,
`.category-filter-label`). They are unused; do not port them. When in doubt, search the class in
`src/routes/index.tsx` and the components: if it never appears, it is dead.

### 19.1 Class → component index (for matching visuals quickly)

| Component / area              | Main classes                                                                                       |
| ----------------------------- | -------------------------------------------------------------------------------------------------- |
| Shell                         | `app-shell`, `sidebar-open/closed`, `desk-main-content`, `sidebar-scrim`, `desk-save-status`        |
| Sidebar                       | `workspace-sidebar`, `sidebar-inner`, `sidebar-header`, `sidebar-search`, `sidebar-desk-item(.active)`, `desk-item-actions`, `desk-popover-menu`, `sidebar-drag-handle` |
| Top bar                       | `topbar`, `brand`, `active-desk-title`, `active-desk-id`, `topbar-right`, `radar-toggle`, `topbar-settings-btn`, `today` |
| Capture                       | `capture-box`, `capture-input-row`, `custom-category-dropdown`, `custom-category-chip(.kind-*)`, `category-popover-menu`, `capture-actions`, `attachment-picker`, `dump-btn`, `capture-images-bar`, `file-attachment` |
| Presets + Stage               | `capture-dock`, `capture-presets`, `preset-pill(.on)`, `preset-hint`, `stage(.stage-voice/-video/-photo/-dictate)`, `stage-head`, `stage-dot`, `stage-timer`, `stage-wave`, `stage-viewport`, `stage-rec-badge`, `stage-flash`, `stage-progress`, `stage-foot`, `stage-save`, `stage-shutter`, `stage-error` |
| Toolbar                       | `stream`, `stream-head`, `search-wrap`, `inbox-chip`, `stream-tools`, `tool-btn(.icon/.on)`, `tool-badge`, `menu-wrap`, `menu-backdrop`, `pop-menu`, `date-pop` |
| Filters                       | `active-filters`, `active-chip`, `active-clear`, `filter-panel`, `filter-grid`, `filter-field`, `filter-row`, `filter-label`, `filter-hint`, `cat-filter-chip`, `untagged-chip` |
| Cards                         | `thought-grid`, `thought-card(.lane-*, .status-*, .selecting, .selected)`, `thought-card-body`, `thought-top`, `thought-kind`, `kind-caret`, `thought-time`, `thought-content-wrap`, `thought-text`, `read-more-btn`, `card-images-compact-strip`, `card-attachments`, `card-video`, `thought-tags`, `thought-bottom`, `thought-bottom-row`, `status-stepper`, `card-actions`, `route-row`, `route-chip`, `card-hash-btn`, `card-delete`, `select-box` |
| List view                     | `timeline-view`, `thought-card-timeline`                                                           |
| Board                         | `board-grid`, `board-column`, `board-heading`, `board-cards`, `board-empty`                         |
| Day panels                    | `day-groups`, `day-group`, `day-head`, `day-sub`, `day-count`, `day-select`, `day-empty`            |
| Pager                         | `pager`, `pager-btn`, `pager-numbers`, `pager-num(.on)`, `pager-gap`, `pager-info`                  |
| Selection                     | `select-bar`, `select-count`, `select-link`, `select-export`, `select-done`                         |
| Pickers                       | `quicktag-backdrop`, `quicktag-pop`, `quicktag-label`, `quicktag-chips`, `quicktag-input(.top)`     |
| Detail drawer                 | `drawer-backdrop`, `detail-drawer`, `drawer-header`, `drawer-scroll`, `drawer-textarea`, `drawer-label`, `status-selector-row`, `custom-editor-box`, `lane-list`, `lane-option`, `echo-section`, `drawer-footer` |
| Dialogs                       | `modal-backdrop`, `desk-modal`, `modal-header`, `modal-body`, `modal-footer`, `confirm-btn`, `cancel-btn`, `desk-purpose` |
| Settings                      | `storage-settings-modal`, `settings-section-label`, `setting-row`, `switch-toggle(.on)`, `storage-status-card`, `storage-stats-grid`, `storage-action-btn` |
| Lightbox                      | `lightbox-backdrop`, `lightbox-dialog`, `lightbox-header`, `lightbox-img`, `lightbox-nav-btn`        |
| Toast                         | `toast`, `toast-action`                                                                             |
| Dashboard                     | `dash`, `dash-head`, `dash-title`, `dash-range`, `dash-signal`, `dash-kpis`, `dash-kpi`, `dash-grid`, `dash-card(.wide)`, `dash-chart`, `dash-bar(.has/.today)`, `dash-avg`, `dash-dot(.has)`, `dash-bars`, `dash-track`, `dash-stack`, `dash-legend`, `dash-cloud`, `dash-rising`, `dash-timeline`, `tl-dot` |
| Formatted text                | `formatted-text-root`, `formatted-strong`, `formatted-em`, `formatted-u`, `inline-code`, `code-block`, `code-lang-tag` |

## 20. Data and control flow (text diagrams)

**Startup**

```
SSR/first client render → <div class="app-shell" aria-busy> (empty shell, identical on both)
  └─ mount effect → loadSavedState() (localStorage) → setDesks/active/prefs
       ├─ unreadable desks → status "Saved data could not be read…", autosave stays OFF
       └─ ok → ready = true → autosave effect now writes on every change
```

**Capture**

```
text + Enter ─┐
photo/voice/video (Stage) ─ saveBlob → IndexedDB (voice/video) ┐
                                                                ├→ addCaptured / commitCapture
paste image / attach files ────────────────────────────────────┘     │
   empty capture? → save instantly with fallback text ("Photo"…)     ▼
   else → join the typed capture              setDesks([...thought on top]) → autosave → toast + Undo
```

**Browse pipeline (pure derivations, in this order)**

```
items (active desk) → filter (category, lane, status, untagged, inbox, date, contains, search)
  → sort by createdAt desc → [grouped view] groupByDay → force "Today" panel if no filters
  → slice 7 day-panels per page → render panels → render Pager
  [flat view]: slice 12 per page    [board]: group by lane, no paging
```

**Export paths**

```
ZIP:    hydrateDesk (idb refs → data URLs) → packageFiles (desk.json + assets/) → fflate zip → download
Folder: debounce 500 ms → serialise → hydrateDesk → writeFolder (assets content-addressed, desk.json last)
PDF:    selected cards → buildExportHtml (text + images only) → hidden iframe → window.print()
JSON:   hydrateDesk for every desk → one JSON file     Markdown: active desk text only
```

**Import paths**

```
ZIP:    importZip (validate, new UUIDs, "-import-xxxx" slug) → migrateDeskMedia → new desk
Folder: readFolder → importFiles(asNew=false) → migrateDeskMedia → (confirm if desk exists) → replace
```

**Dashboard jump**

```
click bar / dot / word / type / timeline day → resetFilters() → apply the one filter → close dashboard
```

## 21. Document maintenance

When the web app changes, update this file in the same pull request: §4 (model), §5 (storage), §6
(behaviour), §8 (design tokens), §9 (copy), and the line numbers in §18. A quick way to refresh line numbers:
`grep -nE "^(export )?(function|const|type) " src/routes/index.tsx`. The behavioural source of truth for
packages is `scripts/test-desk-package.mjs`; the visual source of truth is `src/styles.css`.
