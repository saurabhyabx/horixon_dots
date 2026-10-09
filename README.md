# Horixon Dots (`horixon_dots`)

A local-first multimodal notebook, brainstorm studio, and pattern radar with sensory dots. Capture thoughts, photos, voice notes, or videos in one tap, sort later without friction, and let the Pattern Radar reveal what you keep returning to. Each desk is its own isolated notebook.

Built with **TanStack Start**, **React 19**, **TypeScript**, and **Tailwind CSS 4**.

---

## Highlights

- **One-Tap Multimodal Capture (`CaptureStage`):**
  - Instant text braindumps and speech-to-text dictation.
  - Live photo snapshots, voice recording notes, and video capture directly from the capture bar.
  - Media saved locally into IndexedDB with zero server persistence.
  - Items land immediately in the Inbox; tag and categorize later with single clicks.
- **Days, Not Piles:**
  - Cards automatically grouped by *Today*, *Yesterday*, and chronological date panels.
  - Optional numbered pagination per day.
- **Sensory Dopamine Levers:**
  - Low-latency Web Audio sound synthesis for interactions, card drops, and status updates.
  - Ambient soundscapes to foster deep focus.
- **Pattern Radar:**
  - Per-desk visual dashboard displaying activity dots, cards-per-day velocity, word clouds, status progression, and an interactive day-by-day timeline.
- **Selective Export:**
  - Filter across lanes, tags, dates, and media types (image, link, audio, video, attachments).
  - Multi-select cards to generate a formatted PDF export with embedded media.
- **True Local Ownership & File System Sync:**
  - Desks run entirely within the browser.
  - Directly sync with a physical directory on disk using the File System Access API, or export/import full desk packages as portable `.zip` archives.
  - See [DESK-STORAGE.md](DESK-STORAGE.md) for data schemas and package formats.

---

## Architecture & Documentation

- [**product_architecture.md**](product_architecture.md): Complete product design and system specification, data models, state management rules, algorithms, and native Android build plan.
- [**appendix.md**](appendix.md): Repository map, code index (symbol/line directory), styles reference, data/control flow diagrams, and maintenance guide.
- [**DESK-STORAGE.md**](DESK-STORAGE.md): Storage architecture, fallback mechanisms, IndexedDB media storage, and ZIP package specs.
- [**roadmap.md**](roadmap.md): Milestone progress, shipped features, and upcoming work.

---

## Getting Started

### Prerequisites

- **Node.js** v20.19 or higher (v22.18+ recommended for full storage test suite)
- **npm** or **bun**

### Installation

```bash
# Clone the repository
git clone https://github.com/saurabhyabx/horixon_dots.git
cd horixon_dots

# Install dependencies
npm install
# or: bun install
```

### Running Locally

```bash
# Start development server with HMR
npm run dev
# Defaults to http://localhost:8080 (or next free port)
```

---

## Development Scripts

| Command | Description |
| :--- | :--- |
| `npm run dev` | Starts the Vite development server with SSR support |
| `npm run build` | Builds client & server bundles optimized for Cloudflare Workers / Nitro |
| `npm run preview` | Runs the production build locally via custom preview script |
| `npm run lint` | Runs ESLint with Prettier and type-aware lint rules |
| `npm run typecheck` | Validates TypeScript types across the codebase (`tsc --noEmit`) |
| `npm test` | Runs automated desk storage package round-trip tests (ZIP, folder, imports) |
| `npm run check` | Runs lint, typecheck, tests, and build in sequence (pre-push gate) |
| `npm run format` | Formats all source and script files with Prettier |

---

## Project Structure

```
horixon_dots/
├── public/                 # Static assets (favicons, manifest)
├── scripts/
│   ├── preview.mjs         # Production preview server runner
│   └── test-desk-package.mjs # Storage round-trip & safety verification suite
├── src/
│   ├── components/
│   │   ├── CaptureStage.tsx    # Live voice, photo, video & dictation capture dock
│   │   ├── MediaPlayer.tsx     # Custom player for recorded audio & video
│   │   └── PatternDashboard.tsx# Pattern radar analytics & activity metrics
│   ├── hooks/
│   │   └── use-media-src.ts    # Safe blob resolution from IndexedDB
│   ├── lib/
│   │   ├── capture-media.ts    # MediaStream recording & camera helpers
│   │   ├── dates.ts            # Date formatting and grouping utilities
│   │   ├── desk-package.ts     # ZIP and disk package export/import engine
│   │   ├── export-pdf.ts       # Print/PDF generator
│   │   ├── media-store.ts      # IndexedDB media storage layer
│   │   ├── patterns.ts         # Analytics and frequency parsing algorithms
│   │   └── sound.ts            # Web Audio FX and ambient sound engine
│   ├── routes/
│   │   ├── __root.tsx          # Root shell, HTML document, and meta tags
│   │   └── index.tsx           # Primary interactive desktop workspace
│   ├── server.ts           # Nitro / SSR entrypoint and security headers
│   ├── start.ts            # TanStack Start app initialization
│   └── styles.css          # Tailwind CSS 4 theme and custom styles
├── appendix.md             # Repository map, code index & architecture appendix
├── DESK-STORAGE.md         # Desk storage specifications
├── product_architecture.md # Comprehensive system spec
└── package.json
```

---

## Privacy & Security

- **Zero Remote Persistence:** The application makes no telemetry or tracking requests. All notes, metadata, images, and audio/video recordings reside strictly on your local device.
- **Hardware Access:** Camera and microphone APIs are activated only on explicit user interaction and require a secure context (`https://` or `localhost`).
- **Data Portability:** Your notes and media are never locked in. Export desks anytime as standard folders or standard zip files.

---

## Deployment

Production builds are packaged via Nitro into a Cloudflare Workers compatible bundle:

```bash
npm run build
npx nitro deploy --prebuilt
```

Output locations:
- `.output/server/`: Worker code and wrangler configuration.
- `.output/public/`: Static client assets with immutable cache hashing.
