import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState, type ButtonHTMLAttributes, type ReactNode } from "react";
import {
  ArrowDownToLine,
  ArrowLeft,
  ArrowRight,
  ArrowUpRight,
  AudioLines,
  Brain,
  Calendar,
  Camera,
  Hash,
  MoreHorizontal,
  CheckSquare,
  Film,
  SlidersHorizontal,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Copy,
  Download,
  Edit3,
  FileJson,
  FileText,
  Folder,
  FolderPlus,
  Grid2X2,
  Image as ImageIcon,
  LayoutDashboard,
  List,
  Mic,
  Minus,
  MoreVertical,
  Music,
  PanelLeftClose,
  PanelLeftOpen,
  Pin,
  Plus,
  RotateCcw,
  Search,
  Settings,
  Tag,
  Trash2,
  Volume2,
  VolumeX,
  X,
} from "lucide-react";
import {
  isSoundEnabled,
  toggleSound,
  playDumpChime,
  playRouteSwoosh,
  playChime,
  toggleAmbientFocus,
} from "../lib/sound";
import {
  deskSchema,
  safeName,
  readFile,
  exportZip,
  importZip,
  writeFolder,
  readFolder,
  type DeskData,
} from "../lib/desk-package";
import { CaptureStage, type StageMode, type StageResult } from "../components/CaptureStage";
import { MediaDownload, MediaPlayer } from "../components/MediaPlayer";
import { hydrateDesk, mediaKind, migrateDeskMedia, saveBlob } from "../lib/media-store";
import { formatClock } from "../lib/capture-media";
import { dayKey, daysAgoHint, daysAgoStart, fullDate, groupByDay, startOfDay } from "../lib/dates";
import { stopWords } from "../lib/patterns";
import { PatternDashboard } from "../components/PatternDashboard";
import { exportCardsPdf } from "../lib/export-pdf";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Horixon — Brain Dump & Pattern Radar" },
      {
        name: "description",
        content:
          "Sovereign local desk. Dump raw thoughts, discover cognitive patterns, and route ideas into action.",
      },
      { property: "og:title", content: "Horixon — Brain Dump" },
      {
        property: "og:description",
        content:
          "Sovereign local desk. Dump raw thoughts, discover cognitive patterns, and route ideas into action.",
      },
    ],
  }),
  component: Index,
});

export type Category = string;
export type LifecycleStatus = string;
export type Lane = string;

export type Attachment = {
  name: string;
  data: string;
  mime?: string | undefined;
  seconds?: number | undefined;
};

export type Thought = {
  id: string;
  category: Category;
  lane: Lane;
  status: LifecycleStatus;
  text: string;
  tags: string[];
  createdAt: number;
  images?: string[] | undefined;
  attachments?: Attachment[] | undefined;
};

export type StatusItem = {
  key: string;
  label: string;
  icon: string;
};

export type LaneItem = {
  key: string;
  label: string;
  mark: string;
  hint: string;
};

export type BrainstormDesk = {
  id: string;
  slug?: string | undefined;
  projectId?: string | null | undefined;
  intent?: string | undefined;
  desiredOutcome?: string | undefined;
  title: string;
  emoji: string;
  group: string;
  isPinned: boolean;
  createdAt: number;
  updatedAt: number;
  thoughts: Thought[];
  customStatuses?: StatusItem[];
  customLanes?: LaneItem[];
};

type View = "grid" | "timeline" | "board";
type DateFilter = "any" | "today" | "7d" | "30d" | "custom";
type HasKind = "image" | "link" | "audio" | "video" | "file";

const LINK_PATTERN = /(https?:\/\/|www\.)\S+/i;
const hasKind = (item: Thought, kind: HasKind) => {
  if (kind === "image") return (item.images?.length ?? 0) > 0;
  if (kind === "link") return LINK_PATTERN.test(item.text);
  const files = item.attachments ?? [];
  if (kind === "file") return files.some((f) => mediaKind(f) === "other");
  return files.some((f) => mediaKind(f) === kind);
};

const KEY = "horixon_braindump_prototype_v1";
const PAGE_SIZE = 12;

// New captures are unsorted: no type has to be chosen before saving.
const UNSORTED = "Unsorted";

const defaultCategoryMeta: Record<string, { emoji: string; label: string }> = {
  [UNSORTED]: { emoji: "📥", label: "Inbox" },
  Idea: { emoji: "💡", label: "Idea" },
  Keyword: { emoji: "🔑", label: "Keyword" },
  Vision: { emoji: "🎯", label: "Vision" },
  Learning: { emoji: "📚", label: "Learning" },
  Question: { emoji: "❓", label: "Question" },
  Thought: { emoji: "💭", label: "Thought" },
};

const defaultCategories: string[] = [
  "Idea",
  "Keyword",
  "Vision",
  "Learning",
  "Question",
  "Thought",
];

const defaultStatuses: StatusItem[] = [
  { key: "captured", label: "Captured", icon: "⚡" },
  { key: "prioritized", label: "Prioritized", icon: "🎯" },
  { key: "in_action", label: "In Action", icon: "🚀" },
  { key: "resolved", label: "Resolved", icon: "✓" },
];

const defaultLanes: LaneItem[] = [
  { key: "inbox", label: "Inbox", mark: "○", hint: "raw, unsorted" },
  { key: "action", label: "Action", mark: "→", hint: "something to do" },
  { key: "learning", label: "Learning", mark: "∗", hint: "something to study" },
  {
    key: "knowledge",
    label: "Knowledge",
    mark: "◆",
    hint: "something to keep",
  },
  { key: "system", label: "System", mark: "■", hint: "make it repeatable" },
];

const samples: Omit<Thought, "id" | "createdAt">[] = [
  {
    category: "Vision",
    lane: "system",
    status: "in_action",
    text: "Operating system that adapts its spatial frame density based on user eye fatigue and cognitive load. The UI should breathe with you.",
    tags: ["#spatial", "#cognitive", "#ux"],
  },
  {
    category: "Keyword",
    lane: "knowledge",
    status: "prioritized",
    text: "Local-first CRDT synchronization without central relay bottleneck",
    tags: ["#sync", "#crdt", "#sovereign"],
  },
  {
    category: "Idea",
    lane: "inbox",
    status: "captured",
    text: "Autonomous subagent that watches user dump frequency and clusters related thoughts every Sunday evening into a weekly synthesis brief.",
    tags: ["#agent", "#synthesis", "#ai"],
  },
  {
    category: "Learning",
    lane: "learning",
    status: "resolved",
    text: "When users brain dump, categorizing beforehand adds 60% drop-off friction. Pre-selecting chips with 1-click is the highest threshold of tolerable friction.",
    tags: ["#ux", "#cognitive", "#research"],
  },
  {
    category: "Question",
    lane: "inbox",
    status: "prioritized",
    text: "How to preserve the serendipity of half-forgotten thoughts without cluttering the daily focus horizon?",
    tags: ["#focus", "#memory"],
  },
  {
    category: "Thought",
    lane: "learning",
    status: "captured",
    text: "Multi-agent systems will feel clumsy until we give them shared spatial memory instead of raw chat logs.",
    tags: ["#agent", "#spatial", "#memory"],
  },
  {
    category: "Idea",
    lane: "inbox",
    status: "captured",
    text: "Agent swarm acting as an automatic devil's advocate on high-confidence bets.",
    tags: ["#agent", "#decision", "#bets"],
  },
  {
    category: "Keyword",
    lane: "action",
    status: "in_action",
    text: "Zero-latency offline vector embeddings via WebAssembly",
    tags: ["#wasm", "#offline", "#ai"],
  },
];

const seed = (): Thought[] =>
  samples.map((sample, i) => ({
    ...sample,
    id: `seed-${i}`,
    createdAt: Date.now() - ([12, 48, 105, 290, 620, 880, 1480, 2820][i] ?? 0) * 60000,
  }));

const defaultDesks: BrainstormDesk[] = [
  {
    id: "niche-health-ebook",
    title: "Niche Health eBook & Launch",
    emoji: "🌿",
    group: "Health & Products",
    isPinned: true,
    createdAt: Date.now() - 86400000 * 2,
    updatedAt: Date.now(),
    thoughts: [
      {
        id: "health-1",
        category: "Vision",
        lane: "action",
        status: "in_action",
        text: "Launch 45-page interactive guide on circadian fasting and mitochondrial health protocols.",
        tags: ["#health", "#ebook", "#launch"],
        createdAt: Date.now() - 7200000,
      },
      {
        id: "health-2",
        category: "Idea",
        lane: "inbox",
        status: "captured",
        text: "Add 1-click printable meal prep templates as an exclusive reader bonus.",
        tags: ["#bonus", "#template"],
        createdAt: Date.now() - 3600000,
      },
    ],
  },
  {
    id: "horixon-mindstream",
    title: "Horixon Core Architecture",
    emoji: "🧠",
    group: "General",
    isPinned: true,
    createdAt: Date.now() - 86400000 * 3,
    updatedAt: Date.now(),
    thoughts: seed(),
  },
  {
    id: "ai-cctv-arch",
    title: "AI CCTV Architecture",
    emoji: "📹",
    group: "Product",
    isPinned: false,
    createdAt: Date.now() - 86400000,
    updatedAt: Date.now() - 3600000,
    thoughts: [
      {
        id: "cctv-1",
        category: "Vision",
        lane: "action",
        status: "in_action",
        text: "Edge AI video stream processing with local subagent anomaly detector",
        tags: ["#ai", "#cctv", "#edge"],
        createdAt: Date.now() - 7200000,
      },
    ],
  },
];

const relativeTime = (time: number) => {
  const mins = Math.max(1, Math.round((Date.now() - time) / 60000));
  if (mins < 60) return `${mins}m ago`;
  if (mins < 1440) return `${Math.floor(mins / 60)}h ago`;
  return `${Math.floor(mins / 1440)}d ago`;
};

function Pager({
  page,
  pages,
  onPage,
  info,
}: {
  page: number;
  pages: number;
  onPage: (page: number) => void;
  info?: string;
}) {
  const go = (next: number) => {
    onPage(next);
    document.querySelector(".stream")?.scrollIntoView({ behavior: "smooth", block: "start" });
  };
  const items: (number | "gap")[] = [];
  for (let i = 0; i < pages; i++) {
    if (i === 0 || i === pages - 1 || Math.abs(i - page) <= 1) items.push(i);
    else if (items[items.length - 1] !== "gap") items.push("gap");
  }
  return (
    <nav className="pager" aria-label="Pages">
      <Button
        className="pager-btn"
        disabled={page === 0}
        onClick={() => go(page - 1)}
        aria-label="Previous page"
      >
        <ArrowLeft size={13} />
      </Button>
      <div className="pager-numbers">
        {items.map((item, k) =>
          item === "gap" ? (
            <span key={`gap-${k}`} className="pager-gap">
              …
            </span>
          ) : (
            <Button
              key={item}
              className={`pager-num ${item === page ? "on" : ""}`}
              aria-current={item === page ? "page" : undefined}
              aria-label={`Page ${item + 1}`}
              onClick={() => go(item)}
            >
              {item + 1}
            </Button>
          ),
        )}
      </div>
      <Button
        className="pager-btn"
        disabled={page === pages - 1}
        onClick={() => go(page + 1)}
        aria-label="Next page"
      >
        <ArrowRight size={13} />
      </Button>
      {info && <span className="pager-info">{info}</span>}
    </nav>
  );
}

function Button({
  children,
  className = "",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { children: ReactNode }) {
  return (
    <button className={`btn ${className}`} {...props}>
      {children}
    </button>
  );
}

function download(content: string, filename: string, type: string) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function parseRichStyles(text: string, keyPrefix: number): ReactNode {
  const elements: ReactNode[] = [];
  const regex = /(<u>[\s\S]*?<\/u>|\*\*[\s\S]*?\*\*|\*[\s\S]*?\*)/g;
  const tokens = text.split(regex);

  tokens.forEach((token, index) => {
    if (token.startsWith("<u>") && token.endsWith("</u>")) {
      elements.push(
        <u key={`${keyPrefix}-${index}`} className="formatted-u">
          {token.slice(3, -4)}
        </u>,
      );
    } else if (token.startsWith("**") && token.endsWith("**") && token.length >= 4) {
      elements.push(
        <strong key={`${keyPrefix}-${index}`} className="formatted-strong">
          {token.slice(2, -2)}
        </strong>,
      );
    } else if (token.startsWith("*") && token.endsWith("*") && token.length >= 2) {
      elements.push(
        <em key={`${keyPrefix}-${index}`} className="formatted-em">
          {token.slice(1, -1)}
        </em>,
      );
    } else {
      elements.push(token);
    }
  });

  return <span key={keyPrefix}>{elements}</span>;
}

function parseInlineFormatting(text: string): ReactNode {
  const segments = text.split(/(`[^`]+`)/g);
  return segments.map((seg, i) => {
    if (seg.startsWith("`") && seg.endsWith("`") && seg.length > 2) {
      return (
        <code key={i} className="inline-code">
          {seg.slice(1, -1)}
        </code>
      );
    }
    return parseRichStyles(seg, i);
  });
}

function renderFormattedText(fullText: string, maxChars = 0): ReactNode {
  let displayText = fullText;
  if (maxChars > 0 && fullText.length > maxChars) {
    displayText = fullText.slice(0, maxChars) + "…";
  }

  const parts = displayText.split(/(```[\s\S]*?```)/g);

  return (
    <span className="formatted-text-root">
      {parts.map((part, idx) => {
        if (part.startsWith("```") && part.endsWith("```")) {
          const content = part.slice(3, -3);
          const firstLineEnd = content.indexOf("\n");
          let lang = "";
          let code = content;
          if (firstLineEnd !== -1) {
            const possibleLang = content.slice(0, firstLineEnd).trim();
            if (possibleLang && !possibleLang.includes(" ") && possibleLang.length < 12) {
              lang = possibleLang;
              code = content.slice(firstLineEnd + 1);
            }
          }
          return (
            <div key={idx} className="code-block-wrapper">
              {lang && <span className="code-lang-tag">{lang}</span>}
              <pre className="code-block">
                <code>{code.trim()}</code>
              </pre>
            </div>
          );
        }
        return <span key={idx}>{parseInlineFormatting(part)}</span>;
      })}
    </span>
  );
}

function handleFormatShortcut(
  e: React.KeyboardEvent<HTMLTextAreaElement>,
  currentValue: string,
  setValue: (val: string) => void,
) {
  if ((e.ctrlKey || e.metaKey) && ["b", "i", "u"].includes(e.key.toLowerCase())) {
    e.preventDefault();
    const target = e.currentTarget;
    const start = target.selectionStart;
    const end = target.selectionEnd;
    const selected = currentValue.substring(start, end) || "text";
    const key = e.key.toLowerCase();

    let prefix = "";
    let suffix = "";
    if (key === "b") {
      prefix = "**";
      suffix = "**";
    } else if (key === "i") {
      prefix = "*";
      suffix = "*";
    } else if (key === "u") {
      prefix = "<u>";
      suffix = "</u>";
    }

    const replacement = `${prefix}${selected}${suffix}`;
    const newValue = currentValue.substring(0, start) + replacement + currentValue.substring(end);
    setValue(newValue);

    setTimeout(() => {
      target.focus();
      target.setSelectionRange(start + prefix.length, end + prefix.length);
    }, 0);
  }
}

function CardImageThumbnails({
  images,
  onZoom,
}: {
  images: string[];
  onZoom: (images: string[], initialIndex: number) => void;
}) {
  if (!images || images.length === 0) return null;

  return (
    <div
      className="card-images-compact-strip"
      onClick={(e) => e.stopPropagation()}
      title={
        images.length === 1
          ? "Click thumbnail to zoom evidence image"
          : `Click thumbnail to inspect ${images.length} evidence images in zoom slider`
      }
    >
      <div className="mini-thumb-group">
        {images.slice(0, 3).map((img, idx) => (
          <div
            key={idx}
            className="card-image-mini-thumb"
            onClick={(e) => {
              e.stopPropagation();
              onZoom(images, idx);
            }}
          >
            <img src={img} alt={`Attachment ${idx + 1}`} className="mini-thumb-img" />
            <div className="mini-thumb-hover-overlay">
              <Search size={9} />
            </div>
          </div>
        ))}
        {images.length > 3 && (
          <button
            className="mini-thumb-more-badge"
            onClick={(e) => {
              e.stopPropagation();
              onZoom(images, 3);
            }}
            title={`+${images.length - 3} more images`}
          >
            +{images.length - 3}
          </button>
        )}
      </div>

      <button
        className="mini-thumb-badge-label"
        onClick={(e) => {
          e.stopPropagation();
          onZoom(images, 0);
        }}
      >
        <ImageIcon size={11} />
        <span>
          {images.length} {images.length === 1 ? "attachment" : "attachments"}
        </span>
        <span className="click-to-zoom-hint">· zoom</span>
      </button>
    </div>
  );
}

function ImageZoomModal({
  images,
  initialIndex,
  onClose,
}: {
  images: string[];
  initialIndex: number;
  onClose: () => void;
}) {
  const [index, setIndex] = useState(initialIndex);
  const [zoomScale, setZoomScale] = useState(1);

  const current = images[index] || images[0];

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowLeft") setIndex((prev) => (prev > 0 ? prev - 1 : images.length - 1));
      if (e.key === "ArrowRight") setIndex((prev) => (prev < images.length - 1 ? prev + 1 : 0));
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [images.length, onClose]);

  if (!current) return null;

  return (
    <div className="lightbox-backdrop" onClick={onClose}>
      <div className="lightbox-dialog" onClick={(e) => e.stopPropagation()}>
        <div className="lightbox-header">
          <span className="lightbox-title">
            Evidence Inspection {images.length > 1 ? `(${index + 1} of ${images.length})` : ""}
          </span>
          <div className="lightbox-actions">
            <button
              onClick={() => setZoomScale((s) => Math.min(s + 0.25, 3.5))}
              title="Zoom In"
              className="lightbox-btn"
            >
              <Plus size={13} />
            </button>
            <button
              onClick={() => setZoomScale((s) => Math.max(s - 0.25, 0.5))}
              title="Zoom Out"
              className="lightbox-btn"
            >
              <Minus size={13} />
            </button>
            <button onClick={() => setZoomScale(1)} title="Reset Zoom" className="lightbox-btn">
              <RotateCcw size={13} />
            </button>
            <button
              onClick={() => download(current, `evidence-${index + 1}.png`, "image/png")}
              title="Download Image"
              className="lightbox-btn"
            >
              <Download size={13} />
            </button>
            <button onClick={onClose} title="Close Lightbox" className="lightbox-close-btn">
              <X size={15} />
            </button>
          </div>
        </div>

        <div className="lightbox-body">
          {images.length > 1 && (
            <button
              className="lightbox-nav-btn prev"
              onClick={() => setIndex((prev) => (prev > 0 ? prev - 1 : images.length - 1))}
              title="Previous Image (←)"
            >
              <ChevronLeft size={20} />
            </button>
          )}

          <div className="lightbox-img-viewport">
            <img
              src={current}
              alt="Evidence Zoom"
              className="lightbox-img"
              style={{ transform: `scale(${zoomScale})` }}
            />
          </div>

          {images.length > 1 && (
            <button
              className="lightbox-nav-btn next"
              onClick={() => setIndex((prev) => (prev < images.length - 1 ? prev + 1 : 0))}
              title="Next Image (→)"
            >
              <ChevronRight size={20} />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function VaultDirectoryModal({
  desk,
  customDirName,
  onPickDir,
  onExport,
  onImport,
  onOpen,
  saveStatus,
  groupByDate,
  onToggleGroupByDate,
  onClose,
}: {
  desk: BrainstormDesk;
  customDirName: string | null;
  onPickDir: () => void;
  onExport: () => void;
  onImport: () => void;
  onOpen: () => void;
  saveStatus: string;
  groupByDate: boolean;
  onToggleGroupByDate: () => void;
  onClose: () => void;
}) {
  const imageCount = desk.thoughts.reduce(
    (acc, t) => acc + (t.images?.length || 0) + (t.attachments?.length || 0),
    0,
  );

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="desk-modal storage-settings-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3>
            <Settings size={14} /> Settings
          </h3>
          <button className="close-btn" onClick={onClose} title="Close settings">
            <X size={14} />
          </button>
        </div>

        <div className="modal-body">
          <div className="settings-section-label">View</div>
          <div className="setting-row">
            <div className="setting-text">
              <strong id="group-by-date-label">Group cards by date</strong>
              <p>Show Today, Yesterday and dated panels in the Grid and List views.</p>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={groupByDate}
              aria-labelledby="group-by-date-label"
              className={`switch-toggle ${groupByDate ? "on" : ""}`}
              onClick={onToggleGroupByDate}
            >
              <span className="switch-state">{groupByDate ? "On" : "Off"}</span>
              <span className="switch-knob" aria-hidden />
            </button>
          </div>

          <div className="settings-section-label">Desk storage &amp; portability</div>
          <div className="storage-status-card">
            <div className="storage-icon-wrap">
              <Folder size={18} />
            </div>
            <div className="storage-info">
              <div className="storage-label">{desk.title} Folder</div>
              <div className="storage-path">
                {customDirName ? (
                  <span className="path-text active">📁 {customDirName}/</span>
                ) : (
                  <span className="path-text fallback">Browser fallback copy</span>
                )}
              </div>
              <p className="storage-hint">
                {customDirName
                  ? "Each desk owns desk.json and an assets folder. Reconnect after reopening the app."
                  : "Choose a dedicated folder for this desk. Browser storage is a fallback, not a backup."}
              </p>
            </div>
          </div>

          <p role="status">{saveStatus}</p>
          <div className="storage-stats-grid">
            <div className="stat-box">
              <span className="stat-val">{desk.thoughts.length}</span>
              <span className="stat-lbl">Thoughts</span>
            </div>
            <div className="stat-box">
              <span className="stat-val">{imageCount}</span>
              <span className="stat-lbl">Evidence Assets</span>
            </div>
            <div className="stat-box">
              <span className="stat-val">{"Browser copy + optional desk folder"}</span>
              <span className="stat-lbl">Vault Engine</span>
            </div>
          </div>

          <div className="modal-actions-list">
            <button className="storage-action-btn primary" onClick={onPickDir}>
              <FolderPlus size={14} />
              <span>
                {customDirName
                  ? "Reconnect / choose desk folder..."
                  : "Choose this desk’s folder..."}
              </span>
            </button>
            <button className="storage-action-btn secondary" onClick={onExport}>
              <Download size={14} />
              <span>Export complete desk (.zip)</span>
            </button>
            <button className="storage-action-btn secondary" onClick={onImport}>
              Import desk (.zip)
            </button>
            <button className="storage-action-btn secondary" onClick={onOpen}>
              Open existing desk folder
            </button>
          </div>
        </div>

        <div className="modal-footer">
          <button className="confirm-btn" onClick={onClose}>
            Done
          </button>
        </div>
      </div>
    </div>
  );
}

type SavedState = {
  desks?: BrainstormDesk[];
  desksUnreadable: boolean;
  activeDeskId?: string;
  sidebarWidth?: number;
  categories?: string[];
  categoryMeta?: Record<string, { emoji: string; label: string }>;
  groupByDate?: boolean;
};

/** Reads everything this app keeps in browser storage. Never writes, and never throws. */
function loadSavedState(): SavedState {
  const saved: SavedState = { desksUnreadable: false };
  try {
    const stored =
      localStorage.getItem("horixon_desks_local") ?? localStorage.getItem("horixon_desks_v2");
    if (stored) {
      const parsed = JSON.parse(stored);
      if (!Array.isArray(parsed) || parsed.length === 0) throw new Error("Invalid saved desks");
      saved.desks = parsed.map((d) => ({
        ...deskSchema.parse(d),
        slug: d.slug || d.id,
        projectId: d.projectId ?? null,
      })) as BrainstormDesk[];
    } else {
      // Prototype data from the very first version is carried over, never overwritten.
      const oldStored = localStorage.getItem(KEY);
      if (oldStored) {
        const parsedOld = JSON.parse(oldStored);
        if (Array.isArray(parsedOld) && parsedOld.length > 0) {
          saved.desks = [
            {
              id: "niche-health-ebook",
              title: "Niche Health eBook & Launch",
              emoji: "\u{1F33F}",
              group: "Health & Products",
              isPinned: true,
              createdAt: Date.now(),
              updatedAt: Date.now(),
              thoughts: parsedOld,
            },
            ...defaultDesks.slice(1),
          ];
        }
      }
    }
  } catch {
    saved.desksUnreadable = true;
  }
  try {
    const activeId = localStorage.getItem("horixon_active_desk_id");
    if (activeId) saved.activeDeskId = activeId;
    const width = parseInt(localStorage.getItem("horixon_sidebar_width") ?? "", 10);
    if (!isNaN(width) && width >= 180 && width <= 400) saved.sidebarWidth = width;
    const categories = JSON.parse(
      localStorage.getItem("horixon_braindump_categories_v1") ?? "null",
    );
    if (Array.isArray(categories) && categories.length > 0) saved.categories = categories;
    const meta = JSON.parse(localStorage.getItem("horixon_braindump_cat_meta_v1") ?? "null");
    if (meta && typeof meta === "object") saved.categoryMeta = { ...defaultCategoryMeta, ...meta };
    if (localStorage.getItem("horixon_setting_group_by_date") === "off") saved.groupByDate = false;
  } catch {
    /* preferences fall back to their defaults */
  }
  return saved;
}

function Index() {
  const loadError = useRef(false);
  // Saved data lives in this browser, so it is read after mount. Until then the server render and the
  // first client render are the same empty shell, which keeps hydration identical.
  const [hydrated, setHydrated] = useState(false);
  const [desks, setDesks] = useState<BrainstormDesk[]>(defaultDesks);
  const [activeDeskId, setActiveDeskId] = useState<string>("niche-health-ebook");

  const [sidebarOpen, setSidebarOpen] = useState(true);
  const isPhone = () =>
    typeof window !== "undefined" && window.matchMedia("(max-width: 820px)").matches;
  useEffect(() => {
    const query = window.matchMedia("(max-width: 820px)");
    if (query.matches) setSidebarOpen(false);
    const onChange = (event: MediaQueryListEvent) => event.matches && setSidebarOpen(false);
    query.addEventListener("change", onChange);
    return () => query.removeEventListener("change", onChange);
  }, []);
  const [sidebarWidth, setSidebarWidth] = useState<number>(260);
  const [isResizingSidebar, setIsResizingSidebar] = useState(false);
  const [deskSearch, setDeskSearch] = useState("");

  // Modals & Action Menus
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [newDeskTitle, setNewDeskTitle] = useState("");
  const [newDeskIdInput, setNewDeskIdInput] = useState("");
  const [newDeskEmoji, setNewDeskEmoji] = useState("🌿");
  const [newDeskGroup, setNewDeskGroup] = useState("Health & Products");

  const [editingDesk, setEditingDesk] = useState<BrainstormDesk | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [editId, setEditId] = useState("");
  const [editIntent, setEditIntent] = useState("");
  const [editOutcome, setEditOutcome] = useState("");
  const folderHandles = useRef(new Map<string, FileSystemDirectoryHandle>());
  const folderQueue = useRef(Promise.resolve());
  const lastFolderContent = useRef(new Map<string, string>());
  const [saveStatus, setSaveStatus] = useState("Browser copy · no folder connected");
  const importInput = useRef<HTMLInputElement>(null);
  const [capturedFiles, setCapturedFiles] = useState<Attachment[]>([]);
  const [editEmoji, setEditEmoji] = useState("");
  const [editGroup, setEditGroup] = useState("");

  const [openDeskMenuId, setOpenDeskMenuId] = useState<string | null>(null);

  const activeDesk = (desks.find((d) => d.id === activeDeskId) || desks[0] || defaultDesks[0])!;
  const items = activeDesk.thoughts;

  const statuses =
    activeDesk.customStatuses && activeDesk.customStatuses.length > 0
      ? activeDesk.customStatuses
      : defaultStatuses;

  const lanes =
    activeDesk.customLanes && activeDesk.customLanes.length > 0
      ? activeDesk.customLanes
      : defaultLanes;

  const destinations = lanes;

  const laneInfo = (laneKey: string) =>
    lanes.find((l) => l.key === laneKey) ?? {
      key: laneKey,
      label: laneKey,
      mark: "•",
      hint: "",
    };

  const getStatusInfo = (statusKey: string) =>
    statuses.find((s) => s.key === statusKey) ?? {
      key: statusKey,
      label: statusKey.replace("_", " "),
      icon: "⚡",
    };

  const setItems = (action: Thought[] | ((prev: Thought[]) => Thought[])) => {
    setDesks((prevDesks) =>
      prevDesks.map((d) => {
        if (d.id === activeDesk.id) {
          const updated = typeof action === "function" ? action(d.thoughts) : action;
          return { ...d, thoughts: updated, updatedAt: Date.now() };
        }
        return d;
      }),
    );
  };

  const updateActiveDesk = (changes: Partial<BrainstormDesk>) => {
    setDesks((prevDesks) =>
      prevDesks.map((d) => {
        if (d.id === activeDesk.id) {
          return { ...d, ...changes, updatedAt: Date.now() };
        }
        return d;
      }),
    );
  };

  const [ready, setReady] = useState(false);
  const [detailId, setDetailId] = useState<string | null>(null);
  const [isEditingStatuses, setIsEditingStatuses] = useState(false);
  const [isEditingLanes, setIsEditingLanes] = useState(false);
  const [newStatusLabel, setNewStatusLabel] = useState("");
  const [newStatusIcon, setNewStatusIcon] = useState("🏷️");
  const [newLaneLabel, setNewLaneLabel] = useState("");
  const [newLaneMark, setNewLaneMark] = useState("•");
  const [activeZoomImages, setActiveZoomImages] = useState<{
    images: string[];
    initialIndex: number;
  } | null>(null);
  const [text, setText] = useState("");
  const [capturedImages, setCapturedImages] = useState<string[]>([]);
  const [category, setCategory] = useState<Category>(UNSORTED);
  const [untaggedOnly, setUntaggedOnly] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [inboxOnly, setInboxOnly] = useState(false);
  const [viewMenuOpen, setViewMenuOpen] = useState(false);
  const [dateMenuOpen, setDateMenuOpen] = useState(false);
  const [datePos, setDatePos] = useState({ x: 8, y: 8 });
  const [topMenuOpen, setTopMenuOpen] = useState(false);
  const [dateFilter, setDateFilter] = useState<DateFilter>("any");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [hasFilters, setHasFilters] = useState<Set<HasKind>>(new Set());
  // Setting: group cards under Today / Yesterday / dated panels. On unless explicitly turned off in Settings.
  const [groupByDate, setGroupByDate] = useState(true);
  const [selectMode, setSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [isExporting, setIsExporting] = useState(false);
  const [quickTag, setQuickTag] = useState<{
    id: string;
    kind: "type" | "tag";
    x: number;
    y: number;
  } | null>(null);
  const [stageMode, setStageMode] = useState<StageMode | null>(null);
  const [undoId, setUndoId] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<Category | "All">("All");
  const [laneFilter, setLaneFilter] = useState<Lane | "all">("all");
  const [statusFilter, setStatusFilter] = useState<LifecycleStatus | "all">("all");
  const [isStorageModalOpen, setIsStorageModalOpen] = useState(false);
  const [customDirName, setCustomDirName] = useState<string | null>(null);

  useEffect(() => {
    try {
      if (typeof window !== "undefined") {
        const saved = localStorage.getItem(`horixon_desk_dir_${activeDesk.id}`);
        setCustomDirName(saved || null);
      }
    } catch (err) {
      void err;
    }
  }, [activeDesk.id]);

  const handlePickDirectory = async () => {
    try {
      if (!("showDirectoryPicker" in window))
        throw new Error(
          "Folder access is unavailable. Use ZIP export or a browser supporting folder access.",
        );
      const handle = await (
        window as unknown as {
          showDirectoryPicker: (options: { mode: string }) => Promise<FileSystemDirectoryHandle>;
        }
      ).showDirectoryPicker({ mode: "readwrite" });
      for (const [id, other] of folderHandles.current)
        if (id !== activeDesk.id && (await handle.isSameEntry(other)))
          throw new Error("Choose a separate folder for each desk.");
      let existing: FileSystemFileHandle | undefined;
      try {
        existing = await handle.getFileHandle("desk.json");
      } catch (error) {
        if ((error as DOMException).name !== "NotFoundError") throw error;
      }
      if (existing) {
        const saved = JSON.parse(await (await existing.getFile()).text());
        if (saved.id !== activeDesk.id)
          throw new Error("This folder belongs to another desk. Choose an empty folder.");
        if (
          !window.confirm(
            "Replace the folder’s saved desk with this browser copy? Export either copy first if needed.",
          )
        )
          return;
      }
      setSaveStatus("Saving desk folder…");
      await folderQueue.current.catch(() => {});
      await writeFolder(handle, await hydrateDesk(activeDesk as DeskData));
      folderHandles.current.set(activeDesk.id, handle);
      lastFolderContent.current.set(activeDesk.id, JSON.stringify(activeDesk));
      setCustomDirName(handle.name);
      try {
        localStorage.setItem(`horixon_desk_dir_${activeDesk.id}`, handle.name);
      } catch {
        /* remembering the folder name is optional */
      }
      setSaveStatus("Saved to desk folder");
      setToast("Desk folder saved. Assets remain local copies.");
    } catch (error) {
      if ((error as Error).name !== "AbortError") {
        setSaveStatus("Folder not saved");
        setToast((error as Error).message);
      }
    }
  };
  const handleExportDeskPackage = async () => {
    try {
      const bytes = await exportZip(await hydrateDesk(activeDesk as DeskData));
      const url = URL.createObjectURL(
        new Blob([new Uint8Array(bytes)], { type: "application/zip" }),
      );
      const link = document.createElement("a");
      link.href = url;
      link.download = `${safeName(activeDesk.slug || activeDesk.title)}.zip`;
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      setToast("Complete desk exported. The live desk is unchanged.");
    } catch (error) {
      setToast(`Export failed: ${(error as Error).message}`);
    }
  };
  const handleOpenFolder = async () => {
    try {
      if (!("showDirectoryPicker" in window))
        throw new Error("Folder access is unavailable in this browser.");
      const handle = await (
        window as unknown as {
          showDirectoryPicker: (options: { mode: string }) => Promise<FileSystemDirectoryHandle>;
        }
      ).showDirectoryPicker({ mode: "readwrite" });
      await folderQueue.current.catch(() => {});
      const desk = (await migrateDeskMedia(await readFolder(handle))) as BrainstormDesk;
      if (
        desks.some((d) => d.id === desk.id) &&
        !window.confirm(
          "Load the folder’s desk instead of its browser copy? Export unsaved browser work first.",
        )
      )
        return;
      folderHandles.current.set(desk.id, handle);
      lastFolderContent.current.set(desk.id, JSON.stringify(desk));
      setDesks((ds) => [...ds.filter((d) => d.id !== desk.id), desk]);
      setActiveDeskId(desk.id);
      setCustomDirName(handle.name);
      try {
        localStorage.setItem(`horixon_desk_dir_${desk.id}`, handle.name);
      } catch {
        /* remembering the folder name is optional */
      }
      setSaveStatus("Loaded from desk folder");
      setIsStorageModalOpen(false);
    } catch (error) {
      if ((error as Error).name !== "AbortError")
        setToast(`Open failed: ${(error as Error).message}`);
    }
  };
  const handleImport = async (file: File) => {
    try {
      if (file.size > 100 * 1024 * 1024) throw new Error("Package must be under 100 MB.");
      const desk = (await migrateDeskMedia(
        importZip(new Uint8Array(await file.arrayBuffer())),
      )) as BrainstormDesk;
      setDesks((prev) => [...prev, desk]);
      setActiveDeskId(desk.id);
      setIsStorageModalOpen(false);
      setToast("Imported as a new desk. Choose its folder to save to disk.");
    } catch (error) {
      setToast(`Import failed: ${(error as Error).message}`);
    }
  };
  const attachFiles = async (files: FileList | null, targetId?: string) => {
    if (!files) return;
    const deskId = activeDesk.id;
    try {
      const attachments = await Promise.all(
        Array.from(files).map(async (file) => ({ name: file.name, data: await readFile(file) })),
      );
      if (targetId)
        setDesks((ds) =>
          ds.map((d) =>
            d.id === deskId
              ? {
                  ...d,
                  updatedAt: Date.now(),
                  thoughts: d.thoughts.map((t) =>
                    t.id === targetId
                      ? { ...t, attachments: [...(t.attachments || []), ...attachments] }
                      : t,
                  ),
                }
              : d,
          ),
        );
      else setCapturedFiles((prev) => [...prev, ...attachments]);
    } catch (error) {
      setToast((error as Error).message);
    }
  };
  const [view, setView] = useState<View>("grid");
  const [toast, setToast] = useState("");
  const [soundActive, setSoundActive] = useState(() => isSoundEnabled());
  const [ambientActive, setAmbientActive] = useState(false);

  const processPastedImages = (
    e: React.ClipboardEvent<HTMLTextAreaElement>,
    onSuccess: (dataUrls: string[]) => void,
  ) => {
    const clipboardItems = e.clipboardData?.items;
    if (!clipboardItems) return;
    const files: File[] = [];
    for (let i = 0; i < clipboardItems.length; i++) {
      const item = clipboardItems[i];
      if (item && item.type.startsWith("image/")) {
        const file = item.getAsFile();
        if (file) files.push(file);
      }
    }
    if (files.length > 0) {
      e.preventDefault();
      const readers = files.map(
        (file) =>
          new Promise<string>((resolve) => {
            const reader = new FileReader();
            reader.onload = (evt) => {
              if (evt.target?.result) resolve(evt.target.result as string);
            };
            reader.readAsDataURL(file);
          }),
      );
      Promise.all(readers).then((urls) => {
        onSuccess(urls);
        setToast(`Pasted ${urls.length} image${urls.length > 1 ? "s" : ""} from clipboard!`);
      });
    }
  };
  const [page, setPage] = useState(0);
  const [isListening, setIsListening] = useState(false);
  const [showPatternShelf, setShowPatternShelf] = useState(false);
  const [isCategoryOpen, setIsCategoryOpen] = useState(false);
  const [isAddingCategory, setIsAddingCategory] = useState(false);
  const [newCatInput, setNewCatInput] = useState("");

  const [categoriesList, setCategoriesList] = useState<string[]>(defaultCategories);
  const [categoryMetaMap, setCategoryMetaMap] =
    useState<Record<string, { emoji: string; label: string }>>(defaultCategoryMeta);

  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const recognitionRef = useRef<{ stop: () => void } | null>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const saved = loadSavedState();
    if (saved.desks) setDesks(saved.desks);
    if (saved.activeDeskId) setActiveDeskId(saved.activeDeskId);
    if (saved.sidebarWidth) setSidebarWidth(saved.sidebarWidth);
    if (saved.categories) setCategoriesList(saved.categories);
    if (saved.categoryMeta) setCategoryMetaMap(saved.categoryMeta);
    if (saved.groupByDate === false) setGroupByDate(false);
    if (window.matchMedia("(max-width: 820px)").matches) setSidebarOpen(false);
    loadError.current = saved.desksUnreadable;
    if (saved.desksUnreadable) {
      // Leave autosave off so the unreadable original is never overwritten with defaults.
      setSaveStatus(
        "Saved data could not be read. Automatic browser saving is paused; original data is untouched.",
      );
    } else {
      setReady(true);
    }
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (ready) {
      try {
        localStorage.setItem("horixon_desks_local", JSON.stringify(desks));
        localStorage.setItem("horixon_active_desk_id", activeDeskId);
        localStorage.setItem("horixon_sidebar_width", sidebarWidth.toString());
        localStorage.setItem("horixon_braindump_categories_v1", JSON.stringify(categoriesList));
        localStorage.setItem("horixon_braindump_cat_meta_v1", JSON.stringify(categoryMetaMap));
        setSaveStatus(
          folderHandles.current.has(activeDeskId)
            ? lastFolderContent.current.get(activeDeskId) === JSON.stringify(activeDesk)
              ? "Saved to desk folder"
              : "Browser copy saved · folder save pending"
            : "Saved in browser · choose or reconnect this desk’s folder",
        );
      } catch {
        setSaveStatus("Browser save failed — export or connect a folder. Keep this tab open.");
      }
    }
  }, [desks, activeDeskId, sidebarWidth, categoriesList, categoryMetaMap, activeDesk, ready]);

  useEffect(() => {
    if (!ready) return;
    const timer = window.setTimeout(() => {
      for (const desk of desks) {
        const handle = folderHandles.current.get(desk.id),
          content = JSON.stringify(desk);
        if (!handle || lastFolderContent.current.get(desk.id) === content) continue;
        setSaveStatus("Saving desk folder…");
        folderQueue.current = folderQueue.current
          .catch(() => {})
          .then(async () => {
            try {
              await writeFolder(handle, await hydrateDesk(desk as DeskData));
              lastFolderContent.current.set(desk.id, content);
              setSaveStatus("Saved to desk folder");
            } catch (error) {
              setSaveStatus(
                `Folder save failed: ${(error as Error).message}. Export or reconnect to retry.`,
              );
            }
          });
      }
    }, 500);
    return () => clearTimeout(timer);
  }, [desks, ready]);
  useEffect(() => {
    const warn = (event: BeforeUnloadEvent) => {
      if (
        desks.some(
          (d) =>
            folderHandles.current.has(d.id) &&
            lastFolderContent.current.get(d.id) !== JSON.stringify(d),
        ) ||
        saveStatus.includes("failed")
      ) {
        event.preventDefault();
        event.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [desks, saveStatus]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsCategoryOpen(false);
        setIsAddingCategory(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Sidebar drag handle resizing listener
  useEffect(() => {
    if (!isResizingSidebar) return;
    const handleMouseMove = (e: MouseEvent) => {
      const newW = Math.max(180, Math.min(420, e.clientX));
      setSidebarWidth(newW);
    };
    const handleMouseUp = () => {
      setIsResizingSidebar(false);
    };
    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);
    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    };
  }, [isResizingSidebar]);

  const detail = items.find((item) => item.id === detailId);

  const inDateRange = (time: number) => {
    if (dateFilter === "any") return true;
    if (dateFilter === "today") return time >= startOfDay(Date.now());
    if (dateFilter === "7d") return time >= daysAgoStart(6);
    if (dateFilter === "30d") return time >= daysAgoStart(29);
    const from = dateFrom ? new Date(`${dateFrom}T00:00:00`).getTime() : -Infinity;
    const to = dateTo ? new Date(`${dateTo}T23:59:59.999`).getTime() : Infinity;
    return time >= from && time <= to;
  };
  const shortDate = (value: string) =>
    new Date(`${value}T00:00:00`).toLocaleDateString(undefined, {
      weekday: "short",
      month: "short",
      day: "numeric",
    });
  // "Inbox" means not sorted yet: no type chosen, or still sitting in the inbox lane.
  const isInbox = (item: Thought) => item.lane === "inbox" || item.category === UNSORTED;
  const inboxCount = items.filter(isInbox).length;
  // Filters that live inside the Filters panel (search and the Inbox chip are always visible).
  const activeExtraFilters =
    (laneFilter !== "all" ? 1 : 0) +
    (categoryFilter !== "All" ? 1 : 0) +
    (statusFilter !== "all" ? 1 : 0) +
    (untaggedOnly ? 1 : 0) +
    (dateFilter !== "any" ? 1 : 0) +
    hasFilters.size;
  const dateLabel =
    dateFilter === "today"
      ? "Today"
      : dateFilter === "7d"
        ? "Last 7 days"
        : dateFilter === "30d"
          ? "Last 30 days"
          : dateFrom && dateFrom === dateTo
            ? shortDate(dateFrom)
            : `${dateFrom ? shortDate(dateFrom) : "…"} → ${dateTo ? shortDate(dateTo) : "…"}`;
  const resetFilters = () => {
    setCategoryFilter("All");
    setLaneFilter("all");
    setStatusFilter("all");
    setUntaggedOnly(false);
    setInboxOnly(false);
    setDateFilter("any");
    setDateFrom("");
    setDateTo("");
    setHasFilters(new Set());
    setQuery("");
  };

  // Filtered dataset
  const filtered = items
    .filter(
      (item) =>
        (categoryFilter === "All" || item.category === categoryFilter) &&
        (laneFilter === "all" || item.lane === laneFilter) &&
        (statusFilter === "all" || item.status === statusFilter) &&
        (!untaggedOnly || item.tags.length === 0) &&
        (!inboxOnly || isInbox(item)) &&
        inDateRange(item.createdAt) &&
        [...hasFilters].every((kind) => hasKind(item, kind)) &&
        (!query.trim() ||
          `${item.text} ${item.tags.join(" ")} ${item.category}`
            .toLowerCase()
            .includes(query.trim().toLowerCase())),
    )
    .sort((a, b) => b.createdAt - a.createdAt);

  // Compute Keyword Pattern Frequency
  const patternFrequencies = (() => {
    const counts: Record<string, { count: number; category: Category }> = {};
    items.forEach((item) => {
      item.tags.forEach((tag) => {
        const clean = tag.replace(/^#/, "").toLowerCase();
        if (clean.length > 2) {
          counts[clean] = {
            count: (counts[clean]?.count || 0) + 2,
            category: item.category,
          };
        }
      });
      const words = item.text.toLowerCase().match(/[a-z0-9-]{4,}/g) || [];
      words.forEach((w) => {
        if (!stopWords.has(w)) {
          counts[w] = {
            count: (counts[w]?.count || 0) + 1,
            category: item.category,
          };
        }
      });
    });
    return Object.entries(counts)
      .sort((a, b) => b[1].count - a[1].count)
      .filter(([_, data]) => data.count >= 2)
      .slice(0, 10);
  })();

  // Top Action Spotlight Recommendation
  const spotlightCandidate = (() => {
    const firstPattern = patternFrequencies[0];
    if (!firstPattern) return null;
    const topKeyword = firstPattern[0];
    const matchingThoughts = items.filter(
      (i) =>
        i.tags.some((t) => t.toLowerCase().includes(topKeyword)) ||
        i.text.toLowerCase().includes(topKeyword),
    );
    const uncompleted =
      matchingThoughts.find((i) => i.status !== "resolved") || matchingThoughts[0];
    return uncompleted
      ? {
          keyword: topKeyword,
          thought: uncompleted,
          total: matchingThoughts.length,
        }
      : null;
  })();

  // Related echoes inside detail drawer
  const echoes = detail
    ? items
        .filter(
          (item) =>
            item.id !== detail.id &&
            (item.tags.some((tag) => detail.tags.includes(tag)) ||
              detail.text
                .toLowerCase()
                .match(/[a-z]{5,}/g)
                ?.some((word) => !stopWords.has(word) && item.text.toLowerCase().includes(word))),
        )
        .slice(0, 3)
    : [];

  const groupedView = groupByDate && (view === "grid" || view === "timeline");
  const toggleGroupByDate = () =>
    setGroupByDate((on) => {
      try {
        localStorage.setItem("horixon_setting_group_by_date", on ? "off" : "on");
      } catch {
        /* preference only */
      }
      return !on;
    });
  const DAYS_PER_PAGE = 7;
  const noActiveFilters = activeExtraFilters === 0 && !inboxOnly && !query.trim();
  const todayKey = dayKey(Date.now());
  const baseGroups = groupByDay(filtered);
  // Today is always the first panel when nothing is filtered, even before the first note of the day.
  const dayGroups =
    noActiveFilters && baseGroups[0]?.key !== todayKey
      ? [{ key: todayKey, label: "Today", time: Date.now(), items: [] as Thought[] }, ...baseGroups]
      : baseGroups;
  const dayPageCount = Math.max(1, Math.ceil(dayGroups.length / DAYS_PER_PAGE));
  const dayPage = Math.min(page, dayPageCount - 1);
  const visibleGroups = dayGroups.slice(
    dayPage * DAYS_PER_PAGE,
    dayPage * DAYS_PER_PAGE + DAYS_PER_PAGE,
  );
  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const current = Math.min(page, pageCount - 1);
  const paged = filtered.slice(current * PAGE_SIZE, current * PAGE_SIZE + PAGE_SIZE);

  const handleAddCategory = () => {
    const trimmed = newCatInput.trim();
    if (!trimmed) return;
    if (categoriesList.length >= 10) {
      setToast("Maximum 10 categories allowed");
      return;
    }
    const formatted = trimmed.charAt(0).toUpperCase() + trimmed.slice(1);
    if (categoriesList.some((c) => c.toLowerCase() === formatted.toLowerCase())) {
      setToast("Category already exists");
      return;
    }
    const updatedList = [...categoriesList, formatted];
    const updatedMeta = {
      ...categoryMetaMap,
      [formatted]: { emoji: "✨", label: formatted },
    };

    setCategoriesList(updatedList);
    setCategoryMetaMap(updatedMeta);
    setCategory(formatted);
    setNewCatInput("");
    setIsAddingCategory(false);
    setIsCategoryOpen(false);
    setToast(`Added category "${formatted}"`);
  };

  // Desk action handlers
  const handleCreateDesk = () => {
    const title = newDeskTitle.trim() || "Untitled Brainstorming";
    const slug = (newDeskIdInput.trim() || title.toLowerCase().replace(/[^a-z0-9]+/g, "-")).replace(
      /^-+|-+$/g,
      "",
    );
    const deskId = crypto.randomUUID();
    const emoji = newDeskEmoji.trim() || "🌿";
    const group = newDeskGroup.trim() || "Health & Products";

    if (desks.some((d) => (d.slug || d.id) === slug)) {
      setToast("Page ID already exists. Try another ID.");
      return;
    }

    const newDesk: BrainstormDesk = {
      id: deskId,
      slug: slug || deskId,
      projectId: null,
      title,
      emoji,
      group,
      isPinned: false,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      thoughts: [],
    };

    setDesks((prev) => [...prev, newDesk]);
    setActiveDeskId(deskId);
    setIsCreateModalOpen(false);
    setNewDeskTitle("");
    setNewDeskIdInput("");
    setToast(`Created "${title}" (#${deskId})`);
  };

  const handleTogglePinDesk = (deskId: string, event?: React.MouseEvent) => {
    if (event) event.stopPropagation();
    setDesks((prev) => prev.map((d) => (d.id === deskId ? { ...d, isPinned: !d.isPinned } : d)));
    const desk = desks.find((d) => d.id === deskId);
    setToast(desk?.isPinned ? `Unpinned "${desk.title}"` : `Pinned "${desk?.title}"`);
  };

  const handleStartEditingDesk = (desk: BrainstormDesk, event?: React.MouseEvent) => {
    if (event) event.stopPropagation();
    setEditingDesk(desk);
    setEditTitle(desk.title);
    setEditId(desk.slug || desk.id);
    setEditIntent(desk.intent || "");
    setEditOutcome(desk.desiredOutcome || "");
    setEditEmoji(desk.emoji);
    setEditGroup(desk.group);
    setOpenDeskMenuId(null);
  };

  const handleSaveEditDesk = () => {
    if (!editingDesk) return;
    const title = editTitle.trim() || editingDesk.title;
    const slug = (editId.trim() || editingDesk.id).toLowerCase().replace(/[^a-z0-9-]+/g, "-");
    if (!slug || desks.some((d) => d.id !== editingDesk.id && (d.slug || d.id) === slug)) {
      setToast("Choose a unique readable name.");
      return;
    }
    const emoji = editEmoji.trim() || editingDesk.emoji;
    const group = editGroup.trim() || editingDesk.group;

    setDesks((prev) =>
      prev.map((d) =>
        d.id === editingDesk.id
          ? {
              ...d,
              slug,
              intent: editIntent.trim(),
              desiredOutcome: editOutcome.trim(),
              projectId: d.projectId ?? null,
              title,
              emoji,
              group,
              updatedAt: Date.now(),
            }
          : d,
      ),
    );

    setEditingDesk(null);
    setToast(`Updated desk "${title}"`);
  };

  const handleDeleteDesk = (deskId: string, event?: React.MouseEvent) => {
    if (event) event.stopPropagation();
    if (desks.length <= 1) {
      setToast("Cannot delete the only remaining brainstorming desk.");
      return;
    }
    const desk = desks.find((d) => d.id === deskId);
    if (window.confirm(`Delete brainstorming desk "${desk?.title}"?`)) {
      setDesks((prev) => prev.filter((d) => d.id !== deskId));
      if (activeDeskId === deskId) {
        const remaining = desks.filter((d) => d.id !== deskId);
        setActiveDeskId(remaining[0]?.id || "niche-health-ebook");
      }
      setToast(`Deleted desk "${desk?.title}"`);
    }
  };

  const handleDuplicateDesk = (desk: BrainstormDesk, event?: React.MouseEvent) => {
    if (event) event.stopPropagation();
    const newId = crypto.randomUUID();
    const copy: BrainstormDesk = {
      ...desk,
      id: newId,
      title: `${desk.title} (Copy)`,
      slug: `${desk.slug || safeName(desk.title)}-copy-${newId.slice(0, 8)}`,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      thoughts: desk.thoughts.map((t) => ({ ...t, id: crypto.randomUUID() })),
    };
    setDesks((prev) => [...prev, copy]);
    setActiveDeskId(newId);
    setOpenDeskMenuId(null);
    setToast(`Duplicated "${desk.title}"`);
  };

  // Global Keyboard Shortcuts
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (
        (event.metaKey && event.key.toLowerCase() === "k") ||
        (event.ctrlKey && event.shiftKey && event.key.toLowerCase() === "d")
      ) {
        event.preventDefault();
        setDetailId(null);
        textareaRef.current?.focus();
      }
      if ((event.metaKey || event.ctrlKey) && event.key === "\\") {
        event.preventDefault();
        setSidebarOpen((prev) => !prev);
      }
      if (event.key === "Escape") {
        setDetailId(null);
        setIsCreateModalOpen(false);
        setEditingDesk(null);
        setOpenDeskMenuId(null);
        setQuickTag(null);
        setViewMenuOpen(false);
        setTopMenuOpen(false);
        setDateMenuOpen(false);
        setSelectMode(false);
        setSelectedIds(new Set());
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(
      () => {
        setToast("");
        setUndoId(null);
      },
      undoId ? 6000 : 2600,
    );
    return () => clearTimeout(timer);
  }, [toast, undoId]);

  useEffect(() => {
    setPage(0);
  }, [
    query,
    categoryFilter,
    laneFilter,
    statusFilter,
    untaggedOnly,
    inboxOnly,
    dateFilter,
    dateFrom,
    dateTo,
    hasFilters,
    view,
    activeDeskId,
  ]);

  useEffect(() => {
    setSelectedIds(new Set());
    setSelectMode(false);
  }, [activeDeskId]);

  // Speech Recognition Handler
  const toggleSpeech = () => {
    if (isListening) {
      recognitionRef.current?.stop();
      setIsListening(false);
      return;
    }

    const win = window as unknown as {
      SpeechRecognition?: new () => {
        continuous: boolean;
        interimResults: boolean;
        start: () => void;
        stop: () => void;
        onresult: (event: {
          resultIndex: number;
          results: Array<Array<{ transcript: string }>>;
        }) => void;
        onerror: () => void;
        onend: () => void;
      };
      webkitSpeechRecognition?: new () => {
        continuous: boolean;
        interimResults: boolean;
        start: () => void;
        stop: () => void;
        onresult: (event: {
          resultIndex: number;
          results: Array<Array<{ transcript: string }>>;
        }) => void;
        onerror: () => void;
        onend: () => void;
      };
    };

    const SpeechRecognition = win.SpeechRecognition || win.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      setToast("Speech recognition not supported in this browser.");
      return;
    }

    const recognition = new SpeechRecognition();
    recognition.continuous = true;
    recognition.interimResults = true;

    recognition.onresult = (event: {
      resultIndex: number;
      results: Array<Array<{ transcript: string }>>;
    }) => {
      let transcript = "";
      for (let i = event.resultIndex; i < event.results.length; i++) {
        transcript += event.results[i]?.[0]?.transcript ?? "";
      }
      setText((prev) => (prev ? `${prev} ${transcript}` : transcript));
    };

    recognition.onerror = () => {
      setIsListening(false);
      setToast("Voice recognition stopped");
    };

    recognition.onend = () => {
      setIsListening(false);
    };

    recognitionRef.current = recognition;
    recognition.start();
    setIsListening(true);
    setToast("Listening... Speak your mind");
  };

  const update = (id: string, change: Partial<Thought>) =>
    setItems((current) => current.map((item) => (item.id === id ? { ...item, ...change } : item)));

  const nextStatus = (current: string): string => {
    const seq = statuses.map((s) => s.key);
    if (seq.length === 0) return current;
    const index = seq.indexOf(current);
    const nextIndex = (index + 1) % seq.length;
    return seq[nextIndex] ?? seq[0]!;
  };

  const cycleStatus = (item: Thought, event?: React.MouseEvent) => {
    if (event) event.stopPropagation();
    const updated = nextStatus(item.status);
    const stObj = getStatusInfo(updated);
    update(item.id, { status: updated as LifecycleStatus });
    playRouteSwoosh();
    setToast(`Status: ${stObj.label}`);
  };

  const route = (item: Thought, lane: Lane) => {
    update(item.id, { lane });
    const lInfo = laneInfo(lane);
    playRouteSwoosh();
    setToast(lane === "inbox" ? "Back to Inbox" : `Routed to ${lInfo.label}`);
  };

  const commitCapture = (capture: { text: string; images: string[]; files: Attachment[] }) => {
    const body = capture.text.trim();
    const inline = body.match(/#[\w-]+/g)?.map((tag) => tag.toLowerCase()) ?? [];
    const id = crypto.randomUUID();
    setItems((current) => [
      {
        id,
        category,
        lane: "inbox",
        status: "captured",
        text: body,
        tags: [...new Set(inline)],
        createdAt: Date.now(),
        images: capture.images.length > 0 ? capture.images : undefined,
        attachments: capture.files,
      },
      ...current,
    ]);
    setText("");
    setCapturedImages([]);
    setCapturedFiles([]);
    setCategory(UNSORTED);
    if (textareaRef.current) textareaRef.current.style.height = "auto";
    playDumpChime();
    setToast(`Saved to "${activeDesk.title}"`);
    setUndoId(id);
    textareaRef.current?.focus();
  };

  const save = () => {
    if (!text.trim() && capturedImages.length === 0 && capturedFiles.length === 0) {
      textareaRef.current?.focus();
      return;
    }
    commitCapture({ text, images: capturedImages, files: capturedFiles });
  };

  // A photo or voice note on an empty capture saves instantly; otherwise it joins what you're typing.
  const addCaptured = (
    media: { images?: string[]; files?: Attachment[] },
    fallbackText: string,
  ) => {
    const images = media.images ?? [];
    const files = media.files ?? [];
    if (!text.trim() && capturedImages.length === 0 && capturedFiles.length === 0) {
      commitCapture({ text: fallbackText, images, files });
      return;
    }
    setCapturedImages((prev) => [...prev, ...images]);
    setCapturedFiles((prev) => [...prev, ...files]);
    setToast("Added to this capture · press ↵ to save");
  };

  const openStage = (mode: StageMode) => {
    if (stageMode === mode) return closeStage();
    if (isListening && mode !== "dictate") toggleSpeech();
    setStageMode(mode);
    playChime("high");
    if (mode === "dictate" && !isListening) toggleSpeech();
  };

  const closeStage = () => {
    if (stageMode === "dictate" && isListening) toggleSpeech();
    setStageMode(null);
  };

  // Recordings go to IndexedDB first; a failed write is reported and nothing is saved.
  const handleStageResult = async (result: StageResult) => {
    setStageMode(null);
    try {
      if (result.kind === "photo") return addCaptured({ images: [result.dataUrl] }, "Photo");
      const data = await saveBlob(result.blob);
      const file: Attachment = {
        name: result.name,
        data,
        mime: result.mime,
        seconds: result.seconds,
      };
      addCaptured(
        { files: [file] },
        `${result.kind === "video" ? "Video clip" : "Voice note"} · ${formatClock(result.seconds)}`,
      );
    } catch (error) {
      setToast(`Recording not saved: ${(error as Error).message}`);
    }
  };

  useEffect(() => {
    if (stageMode === "dictate" && !isListening) setStageMode(null);
  }, [stageMode, isListening]);

  const toggleSelect = (id: string) =>
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  const selectMany = (ids: string[]) => setSelectedIds((prev) => new Set([...prev, ...ids]));
  const exitSelect = () => {
    setSelectMode(false);
    setSelectedIds(new Set());
  };

  const exportSelectedPdf = async () => {
    const chosen = items.filter((i) => selectedIds.has(i.id));
    if (chosen.length === 0 || isExporting) return;
    setIsExporting(true);
    try {
      await exportCardsPdf({
        title: activeDesk.title,
        emoji: activeDesk.emoji,
        intent: activeDesk.intent,
        desiredOutcome: activeDesk.desiredOutcome,
        cards: chosen.map((t) => ({
          text: t.text,
          label: categoryMetaMap[t.category]?.label || t.category,
          tags: t.tags,
          createdAt: t.createdAt,
          images: t.images ?? [],
        })),
      });
      setToast("Print dialog opened · choose “Save as PDF”");
    } catch (error) {
      setToast(`Export failed: ${(error as Error).message}`);
    } finally {
      setIsExporting(false);
    }
  };

  const undoCapture = () => {
    if (!undoId) return;
    setItems((current) => current.filter((item) => item.id !== undoId));
    setUndoId(null);
    setToast("Capture undone");
  };

  const openQuickTag = (
    item: Thought,
    kind: "type" | "tag",
    event: React.SyntheticEvent<HTMLElement>,
  ) => {
    event.stopPropagation();
    if (quickTag?.id === item.id && quickTag.kind === kind) return setQuickTag(null);
    const rect = event.currentTarget.getBoundingClientRect();
    const width = 288;
    const height = kind === "type" ? 150 : 230;
    const x = kind === "tag" ? rect.right - width : rect.left;
    setQuickTag({
      id: item.id,
      kind,
      x: Math.max(8, Math.min(x, window.innerWidth - width - 8)),
      y:
        rect.bottom + 6 + height > window.innerHeight
          ? Math.max(8, rect.top - height - 6)
          : rect.bottom + 6,
    });
  };

  const toggleTag = (id: string, tag: string) => {
    const item = items.find((i) => i.id === id);
    if (!item) return;
    update(id, {
      tags: item.tags.includes(tag) ? item.tags.filter((t) => t !== tag) : [...item.tags, tag],
    });
  };

  const reset = () => {
    if (
      window.confirm(
        `Restore demo thoughts in "${activeDesk.title}"? Your current thoughts will be reset.`,
      )
    ) {
      setItems(seed());
      setQuery("");
      setCategoryFilter("All");
      setLaneFilter("all");
      setStatusFilter("all");
      setDetailId(null);
      setToast("Demo thoughts restored");
    }
  };

  const remove = (id: string) => {
    if (window.confirm("Delete this thought?")) {
      setItems((current) => current.filter((item) => item.id !== id));
      setDetailId(null);
      setToast("Thought deleted");
    }
  };

  // Filter Desks for Sidebar
  const filteredDesks = desks.filter(
    (d) =>
      !deskSearch.trim() ||
      `${d.title} ${d.id} ${d.group}`.toLowerCase().includes(deskSearch.trim().toLowerCase()),
  );

  const pinnedDesks = filteredDesks.filter((d) => d.isPinned);
  const unpinnedDesks = filteredDesks.filter((d) => !d.isPinned);

  const groupedDesks = unpinnedDesks.reduce(
    (acc, desk) => {
      const grp = desk.group || "General";
      if (!acc[grp]) acc[grp] = [];
      acc[grp].push(desk);
      return acc;
    },
    {} as Record<string, BrainstormDesk[]>,
  );

  const renderDeskItem = (d: BrainstormDesk) => (
    <div
      key={d.id}
      className={`sidebar-desk-item ${d.id === activeDesk.id ? "active" : ""}`}
      onClick={() => {
        setActiveDeskId(d.id);
        if (isPhone()) setSidebarOpen(false);
      }}
      role="button"
      tabIndex={0}
    >
      <span className="desk-emoji">{d.emoji}</span>
      <div className="desk-label-wrap">
        <span className="desk-item-title">{d.title}</span>
        <span className="desk-item-id">#{d.id}</span>
      </div>
      <span className="desk-item-count">{d.thoughts.length}</span>

      <div className="desk-item-actions">
        <button
          className={`pin-btn ${d.isPinned ? "pinned" : ""}`}
          onClick={(e) => handleTogglePinDesk(d.id, e)}
          title={d.isPinned ? "Unpin Desk" : "Pin Desk"}
        >
          <Pin size={11} />
        </button>
        <button
          className="menu-btn"
          onClick={(e) => {
            e.stopPropagation();
            setOpenDeskMenuId(openDeskMenuId === d.id ? null : d.id);
          }}
          title="Desk Options"
        >
          <MoreVertical size={12} />
        </button>

        {openDeskMenuId === d.id && (
          <div className="desk-popover-menu" onClick={(e) => e.stopPropagation()}>
            <button onClick={(e) => handleStartEditingDesk(d, e)}>
              <Edit3 size={11} /> Edit Title & ID
            </button>
            <button onClick={(e) => handleDuplicateDesk(d, e)}>
              <Copy size={11} /> Duplicate
            </button>
            <button onClick={(e) => handleTogglePinDesk(d.id, e)}>
              <Pin size={11} /> {d.isPinned ? "Unpin Desk" : "Pin Desk"}
            </button>
            <div className="menu-divider" />
            <button className="delete-opt" onClick={(e) => handleDeleteDesk(d.id, e)}>
              <Trash2 size={11} /> Delete
            </button>
          </div>
        )}
      </div>
    </div>
  );

  // Render Thought Card
  const card = (item: Thought) => {
    const stInfo = getStatusInfo(item.status);

    return (
      <article
        key={item.id}
        className={`thought-card lane-${item.lane} status-${item.status} ${view === "timeline" ? "thought-card-timeline" : ""} ${selectMode ? "selecting" : ""} ${selectedIds.has(item.id) ? "selected" : ""}`}
        onClick={() => (selectMode ? toggleSelect(item.id) : setDetailId(item.id))}
        aria-pressed={selectMode ? selectedIds.has(item.id) : undefined}
        tabIndex={0}
        role="button"
        aria-label={`Open thought: ${item.text}`}
        onKeyDown={(event) => {
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            if (selectMode) toggleSelect(item.id);
            else setDetailId(item.id);
          }
        }}
      >
        {selectMode && (
          <span className={`select-box ${selectedIds.has(item.id) ? "on" : ""}`} aria-hidden>
            {selectedIds.has(item.id) && <Check size={12} />}
          </span>
        )}
        <div className="thought-card-body">
          <div className="thought-top">
            <span
              className={`thought-kind category-${item.category.toLowerCase()}`}
              role="button"
              tabIndex={0}
              onClick={(e) => (selectMode ? undefined : openQuickTag(item, "type", e))}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  e.stopPropagation();
                  if (!selectMode) openQuickTag(item, "type", e);
                }
              }}
              style={{ cursor: "pointer" }}
              title="Change type"
              aria-label={`Type: ${categoryMetaMap[item.category]?.label || item.category}. Change type`}
            >
              {categoryMetaMap[item.category]?.emoji || "\u{1F4AD}"}{" "}
              {categoryMetaMap[item.category]?.label || item.category}
              <ChevronDown size={10} className="kind-caret" aria-hidden />
            </span>
            <span className="thought-time">{relativeTime(item.createdAt)}</span>
          </div>

          <div className="thought-content-wrap">
            <div className="thought-text">{renderFormattedText(item.text, 180)}</div>

            {item.text.length > 180 && (
              <button
                className="read-more-btn"
                onClick={(e) => {
                  e.stopPropagation();
                  setDetailId(item.id);
                }}
                title="Read full thought in detail drawer"
              >
                read more →
              </button>
            )}

            {item.images && item.images.length > 0 && (
              <CardImageThumbnails
                images={item.images}
                onZoom={(imgs, idx) => setActiveZoomImages({ images: imgs, initialIndex: idx })}
              />
            )}

            {item.attachments && item.attachments.length > 0 && (
              <div className="card-attachments" onClick={(e) => e.stopPropagation()}>
                {item.attachments.map((file, i) => (
                  <MediaPlayer key={i} file={file} />
                ))}
              </div>
            )}

            {item.tags.length > 0 && (
              <div className="thought-tags">
                {item.tags.map((tag) => (
                  <span
                    key={tag}
                    onClick={(e) => {
                      e.stopPropagation();
                      setQuery(tag);
                    }}
                  >
                    {tag}
                  </span>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="thought-bottom">
          <div className="thought-bottom-row">
            <Button
              className={`status-stepper status-${item.status}`}
              title="Click to advance status"
              onClick={(e) => cycleStatus(item, e)}
            >
              <span>{stInfo.icon}</span> <span>{stInfo.label}</span>
            </Button>

            <div className="card-actions">
              <div className="route-row" aria-label="Send to">
                {destinations.map((l) => (
                  <Button
                    key={l.key}
                    className={`route-chip ${item.lane === l.key ? "on" : ""}`}
                    title={`Send to ${l.label}`}
                    onClick={(event) => {
                      event.stopPropagation();
                      route(item, item.lane === l.key ? "inbox" : l.key);
                    }}
                  >
                    {l.mark}
                  </Button>
                ))}
              </div>
              <Button
                className="card-delete"
                title="Delete thought"
                onClick={(event) => {
                  event.stopPropagation();
                  remove(item.id);
                }}
              >
                <Trash2 size={13} />
              </Button>
            </div>
            <Button
              className={`card-hash-btn ${item.tags.length === 0 ? "empty" : ""}`}
              title={item.tags.length ? `Tags: ${item.tags.join(" ")}` : "Add tag"}
              aria-label="Add or change tags"
              onClick={(event) => openQuickTag(item, "tag", event)}
            >
              <Hash size={13} />
            </Button>
          </div>
        </div>
      </article>
    );
  };

  if (!hydrated)
    return <div className="app-shell" aria-busy="true" aria-label="Loading your desks" />;

  return (
    <div className={`app-shell ${sidebarOpen ? "sidebar-open" : "sidebar-closed"}`}>
      {sidebarOpen && (
        <div className="sidebar-scrim" onClick={() => setSidebarOpen(false)} aria-hidden />
      )}

      {/* Draggable & Hidable Workspace Sidebar */}
      <aside
        className="workspace-sidebar"
        style={{ width: sidebarOpen ? `${sidebarWidth}px` : "0px" }}
        aria-label="Brainstorming Workspace Sidebar"
      >
        <div className="sidebar-inner" style={{ width: `${sidebarWidth}px` }}>
          {/* Workspace Header */}
          <div className="sidebar-header">
            <div className="workspace-brand">
              <span className="brand-dot" />
              <span className="workspace-title">Brainstorm Desks</span>
            </div>
            <Button
              className="sidebar-collapse-btn"
              title="Hide Sidebar (Ctrl+\)"
              onClick={() => setSidebarOpen(false)}
            >
              <PanelLeftClose size={14} />
            </Button>
          </div>

          {/* Action Row & Search */}
          <div className="sidebar-actions">
            <div className="sidebar-search">
              <Search size={11} />
              <input
                value={deskSearch}
                onChange={(e) => setDeskSearch(e.target.value)}
                placeholder="Find desk or #id..."
              />
              {deskSearch && (
                <button className="clear-search-btn" onClick={() => setDeskSearch("")}>
                  <X size={10} />
                </button>
              )}
            </div>
            <Button
              className="new-desk-btn"
              onClick={() => setIsCreateModalOpen(true)}
              title="Create new Brainstorming desk"
            >
              <Plus size={12} /> New
            </Button>
          </div>

          {/* Desks Navigation List */}
          <div className="sidebar-scroll">
            {/* Pinned Section */}
            {pinnedDesks.length > 0 && (
              <div className="sidebar-group">
                <div className="group-title">
                  <Pin size={10} /> Pinned Desks
                </div>
                {pinnedDesks.map(renderDeskItem)}
              </div>
            )}

            {/* Grouped Desks */}
            {Object.entries(groupedDesks).map(([groupName, groupItems]) => (
              <div className="sidebar-group" key={groupName}>
                <div className="group-title">
                  <Folder size={11} /> {groupName}
                </div>
                {groupItems.map(renderDeskItem)}
              </div>
            ))}
          </div>

          {/* Sidebar Footer */}
          <div className="sidebar-footer">
            <span className="desk-count-badge">{desks.length} workspaces active</span>
            <button className="add-subtle-btn" onClick={() => setIsCreateModalOpen(true)}>
              <Plus size={10} /> Add Desk
            </button>
          </div>
        </div>

        {/* Sidebar Drag Resizer */}
        <div
          className="sidebar-drag-handle"
          onMouseDown={() => setIsResizingSidebar(true)}
          title="Drag to resize sidebar width"
        />
      </aside>

      {/* Main Workspace Desk Content */}
      <main className="desk-main-content">
        <header className="topbar">
          <div className="brand">
            {!sidebarOpen && (
              <Button
                className="topbar-sidebar-toggle"
                onClick={() => setSidebarOpen(true)}
                title="Show Sidebar (Ctrl+\)"
              >
                <PanelLeftOpen size={14} />
              </Button>
            )}
            <span className="brand-mark" />
            <span className="active-desk-emoji">{activeDesk.emoji}</span>
            <span className="active-desk-title">{activeDesk.title}</span>
            <span className="active-desk-id">#{activeDesk.id}</span>
            <Button
              className="edit-desk-trigger"
              onClick={(e) => handleStartEditingDesk(activeDesk, e)}
              title="Edit Page ID or Title"
            >
              <Edit3 size={12} />
            </Button>
          </div>

          <div className="topbar-right">
            <Button
              className={`radar-toggle ${showPatternShelf ? "active" : ""}`}
              title="Toggle Cognitive Pattern Radar"
              onClick={() => setShowPatternShelf(!showPatternShelf)}
            >
              <Brain size={13} /> Pattern Radar
            </Button>
            <Button
              className="topbar-settings-btn"
              title="Desk Storage & Directory Settings"
              onClick={() => setIsStorageModalOpen(true)}
            >
              <Settings size={13} />
            </Button>
            <div className="menu-wrap">
              <Button
                className="topbar-settings-btn"
                title="More"
                aria-label="More options"
                aria-haspopup="menu"
                aria-expanded={topMenuOpen}
                onClick={() => setTopMenuOpen((v) => !v)}
              >
                <MoreHorizontal size={14} />
              </Button>
              {topMenuOpen && (
                <>
                  <div className="menu-backdrop" onMouseDown={() => setTopMenuOpen(false)} />
                  <div className="pop-menu right" role="menu">
                    <button
                      role="menuitemcheckbox"
                      aria-checked={soundActive}
                      onClick={() => {
                        const enabled = toggleSound();
                        setSoundActive(enabled);
                        setToast(enabled ? "Sound effects on" : "Sound effects off");
                      }}
                    >
                      {soundActive ? <Volume2 size={13} /> : <VolumeX size={13} />} Sound effects
                      <span className="menu-state">{soundActive ? "On" : "Off"}</span>
                    </button>
                    <button
                      role="menuitemcheckbox"
                      aria-checked={ambientActive}
                      onClick={() => {
                        const playing = toggleAmbientFocus();
                        setAmbientActive(playing);
                        setToast(playing ? "Focus sound on" : "Focus sound off");
                      }}
                    >
                      <Music size={13} /> Focus sound
                      <span className="menu-state">{ambientActive ? "On" : "Off"}</span>
                    </button>
                  </div>
                </>
              )}
            </div>
            <span className="today">
              {new Date().toLocaleDateString(undefined, {
                weekday: "short",
                month: "short",
                day: "numeric",
              })}
            </span>
          </div>
        </header>

        {/* Single Unified Thought Capture Bar */}
        <section className="capture-box" aria-label="Dump a thought">
          <div className="capture-input-row">
            <div className="custom-category-dropdown" ref={dropdownRef}>
              <Button
                className={`custom-category-chip kind-${category.toLowerCase()}`}
                onClick={() => setIsCategoryOpen((prev) => !prev)}
                aria-expanded={isCategoryOpen}
                aria-label="Select thought category"
              >
                <span>{categoryMetaMap[category]?.emoji || "✨"}</span>
                <span>{(categoryMetaMap[category]?.label || category).toUpperCase()}</span>
                <ChevronDown size={11} className={`chevron-icon ${isCategoryOpen ? "open" : ""}`} />
              </Button>

              {isCategoryOpen && (
                <div className="category-popover-menu" role="menu">
                  {[UNSORTED, ...categoriesList].map((c) => (
                    <button
                      key={c}
                      className={`category-menu-item kind-${c.toLowerCase()} ${category === c ? "selected" : ""}`}
                      onClick={() => {
                        setCategory(c);
                        setIsCategoryOpen(false);
                      }}
                      role="menuitem"
                    >
                      <span className="cat-icon">{categoryMetaMap[c]?.emoji || "✨"}</span>
                      <span className="cat-label">{categoryMetaMap[c]?.label || c}</span>
                      {category === c && <Check size={12} className="cat-check" />}
                    </button>
                  ))}

                  <div className="popover-divider" />

                  {categoriesList.length < 10 ? (
                    isAddingCategory ? (
                      <div className="add-cat-mini-form">
                        <input
                          value={newCatInput}
                          onChange={(e) => setNewCatInput(e.target.value)}
                          placeholder="Category name..."
                          autoFocus
                          onKeyDown={(e) => {
                            if (e.key === "Enter") handleAddCategory();
                            if (e.key === "Escape") setIsAddingCategory(false);
                          }}
                        />
                        <button
                          className="add-cat-submit"
                          onClick={handleAddCategory}
                          title="Save category"
                        >
                          <Plus size={12} />
                        </button>
                      </div>
                    ) : (
                      <button
                        className="subtle-add-cat-btn"
                        onClick={() => setIsAddingCategory(true)}
                        title="Add custom category (max 10)"
                      >
                        <Plus size={11} /> new category
                      </button>
                    )
                  ) : (
                    <span className="max-cat-hint">max 10 categories limit</span>
                  )}
                </div>
              )}
            </div>
            <textarea
              ref={textareaRef}
              value={text}
              rows={1}
              onChange={(e) => {
                setText(e.target.value);
                e.target.style.height = "auto";
                e.target.style.height = `${e.target.scrollHeight}px`;
              }}
              onPaste={(e) =>
                processPastedImages(e, (urls) => setCapturedImages((prev) => [...prev, ...urls]))
              }
              onKeyDown={(e) => {
                handleFormatShortcut(e, text, setText);
                if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                  e.preventDefault();
                  save();
                }
              }}
              placeholder={
                category === UNSORTED ? "Capture anything…" : `Dump a ${category.toLowerCase()}…`
              }
              aria-label="Your thought"
            />

            <div className="capture-actions">
              <label className="attachment-picker" title="Attach files">
                ＋
                <input
                  aria-label="Attach files to new thought"
                  type="file"
                  multiple
                  onChange={(e) => {
                    void attachFiles(e.target.files);
                    e.target.value = "";
                  }}
                />
              </label>
              <Button
                className="dump-btn"
                onClick={save}
                disabled={!text.trim() && capturedImages.length === 0 && capturedFiles.length === 0}
                title="Dump Thought (↵)"
              >
                <ArrowRight size={16} />
              </Button>
            </div>
          </div>

          {capturedFiles.map((file, i) => (
            <div key={i} className="file-attachment">
              {file.name}
              <button
                onClick={() => setCapturedFiles((files) => files.filter((_, index) => index !== i))}
                aria-label={`Remove ${file.name}`}
              >
                ×
              </button>
            </div>
          ))}
          {capturedImages.length > 0 && (
            <div className="capture-images-bar">
              {capturedImages.map((img, i) => (
                <div key={i} className="capture-img-thumb-wrap">
                  <img src={img} alt="Pasted attachment" className="capture-img-thumb" />
                  <button
                    className="remove-img-btn"
                    onClick={() => setCapturedImages((prev) => prev.filter((_, idx) => idx !== i))}
                    title="Remove image"
                  >
                    <X size={10} />
                  </button>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* Quick capture presets and live stage */}
        <div className="capture-dock">
          <div className="capture-presets" role="toolbar" aria-label="Quick capture">
            {(
              [
                ["voice", Mic, "Voice"],
                ["photo", Camera, "Photo"],
                ["video", Film, "Video"],
                ["dictate", AudioLines, "Dictate"],
              ] as const
            ).map(([mode, Icon, label]) => (
              <button
                key={mode}
                className={`preset-pill ${stageMode === mode ? "on" : ""}`}
                onClick={() => openStage(mode)}
                aria-pressed={stageMode === mode}
                aria-label={label}
                title={
                  mode === "voice"
                    ? "Record a voice note"
                    : mode === "photo"
                      ? "Take a photo"
                      : mode === "video"
                        ? "Record a video"
                        : "Speak and see your words typed"
                }
              >
                <Icon size={13} /> {mode === "dictate" ? null : label}
              </button>
            ))}
            <span className="preset-hint">↵ save · ⇧↵ new line</span>
          </div>
          {stageMode && (
            <CaptureStage
              key={stageMode}
              mode={stageMode}
              onClose={closeStage}
              onResult={(result) => void handleStageResult(result)}
            />
          )}
        </div>

        {/* Pattern Radar: this desk's own dashboard */}
        {showPatternShelf && (
          <PatternDashboard
            deskTitle={activeDesk.title}
            deskEmoji={activeDesk.emoji}
            thoughts={items}
            categoryMeta={categoryMetaMap}
            statuses={statuses}
            patterns={patternFrequencies}
            spotlight={
              spotlightCandidate
                ? {
                    keyword: spotlightCandidate.keyword,
                    text: spotlightCandidate.thought.text,
                    total: spotlightCandidate.total,
                  }
                : null
            }
            inboxCount={inboxCount}
            onAdvanceSpotlight={() => {
              if (!spotlightCandidate) return;
              update(spotlightCandidate.thought.id, { status: "in_action", lane: "action" });
              setToast(`Advanced "${spotlightCandidate.keyword}" to In Action`);
            }}
            onFilterWord={(word) => {
              resetFilters();
              setQuery(word);
              setShowPatternShelf(false);
            }}
            onFilterDay={(key) => {
              resetFilters();
              setDateFilter("custom");
              setDateFrom(key);
              setDateTo(key);
              setShowPatternShelf(false);
            }}
            onFilterCategory={(category) => {
              resetFilters();
              setCategoryFilter(category);
              setShowPatternShelf(false);
            }}
            onClose={() => setShowPatternShelf(false)}
          />
        )}

        {/* Stream Filtering & Views */}
        {!showPatternShelf && (
          <section className="stream" aria-label="Thought stream">
            <div className="stream-head">
              <div className="search-wrap">
                <Search size={13} />
                <input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="search text, #tags, or keywords..."
                  aria-label="Search thoughts"
                />
                {query && (
                  <Button className="clear-search" onClick={() => setQuery("")}>
                    <X size={12} />
                  </Button>
                )}
              </div>

              <Button
                className={`inbox-chip ${inboxOnly ? "on" : ""}`}
                onClick={() => setInboxOnly((v) => !v)}
                aria-pressed={inboxOnly}
                title="Not sorted yet: no type, or still in the inbox lane"
              >
                <span aria-hidden>{"\u{1F4E5}"}</span> Inbox{" "}
                <span className="cat-count-badge">{inboxCount}</span>
              </Button>

              <div className="stream-tools">
                <Button
                  className={`tool-btn ${filtersOpen || activeExtraFilters > 0 ? "on" : ""}`}
                  onClick={() => setFiltersOpen((v) => !v)}
                  aria-expanded={filtersOpen}
                  title="Filter by lane, type, status, date and content"
                >
                  <SlidersHorizontal size={13} /> Filters
                  {activeExtraFilters > 0 && (
                    <span className="tool-badge">{activeExtraFilters}</span>
                  )}
                </Button>
                <div className="menu-wrap">
                  <Button
                    className={`tool-btn ${dateFilter === "custom" ? "on" : ""}`}
                    onClick={(event) => {
                      const rect = event.currentTarget.getBoundingClientRect();
                      const width = 262;
                      setDatePos({
                        x: Math.max(8, Math.min(rect.left, window.innerWidth - width - 8)),
                        y: rect.bottom + 6,
                      });
                      setDateMenuOpen((v) => !v);
                    }}
                    aria-haspopup="dialog"
                    aria-expanded={dateMenuOpen}
                    title="Pick an exact date range"
                  >
                    <Calendar size={13} /> {dateFilter === "custom" ? dateLabel : "Dates"}
                  </Button>
                  {dateMenuOpen && (
                    <>
                      <div className="menu-backdrop" onMouseDown={() => setDateMenuOpen(false)} />
                      <div
                        className="pop-menu date-pop"
                        role="dialog"
                        aria-label="Custom date range"
                        style={{ position: "fixed", left: datePos.x, top: datePos.y }}
                      >
                        <label>
                          <span>From</span>
                          <input
                            type="date"
                            value={dateFrom}
                            max={dateTo || undefined}
                            onChange={(e) => {
                              setDateFrom(e.target.value);
                              setDateFilter(e.target.value || dateTo ? "custom" : "any");
                            }}
                          />
                        </label>
                        <label>
                          <span>To</span>
                          <input
                            type="date"
                            value={dateTo}
                            min={dateFrom || undefined}
                            onChange={(e) => {
                              setDateTo(e.target.value);
                              setDateFilter(e.target.value || dateFrom ? "custom" : "any");
                            }}
                          />
                        </label>
                        <div className="date-pop-actions">
                          <button
                            type="button"
                            onClick={() => {
                              setDateFilter("any");
                              setDateFrom("");
                              setDateTo("");
                              setDateMenuOpen(false);
                            }}
                          >
                            Clear
                          </button>
                          <button
                            type="button"
                            className="primary"
                            onClick={() => setDateMenuOpen(false)}
                          >
                            Done
                          </button>
                        </div>
                      </div>
                    </>
                  )}
                </div>
                <Button
                  className={`tool-btn icon ${selectMode ? "on" : ""}`}
                  onClick={() => (selectMode ? exitSelect() : setSelectMode(true))}
                  aria-pressed={selectMode}
                  aria-label="Select cards"
                  title="Select cards to export"
                >
                  <CheckSquare size={14} />
                </Button>
                <div className="menu-wrap">
                  <Button
                    className="tool-btn"
                    onClick={() => setViewMenuOpen((v) => !v)}
                    aria-haspopup="menu"
                    aria-expanded={viewMenuOpen}
                    title="View options"
                  >
                    {view === "grid" ? (
                      <Grid2X2 size={14} />
                    ) : view === "timeline" ? (
                      <List size={14} />
                    ) : (
                      <LayoutDashboard size={14} />
                    )}
                    <ChevronDown size={11} />
                  </Button>
                  {viewMenuOpen && (
                    <>
                      <div className="menu-backdrop" onMouseDown={() => setViewMenuOpen(false)} />
                      <div className="pop-menu right" role="menu" aria-label="View options">
                        {(
                          [
                            ["grid", "Grid", Grid2X2],
                            ["timeline", "List", List],
                            ["board", "Board by lane", LayoutDashboard],
                          ] as const
                        ).map(([key, label, Icon]) => (
                          <button
                            key={key}
                            role="menuitemradio"
                            aria-checked={view === key}
                            onClick={() => {
                              setView(key);
                              setViewMenuOpen(false);
                            }}
                          >
                            <Icon size={13} /> {label}
                            {view === key && <Check size={12} className="menu-check" />}
                          </button>
                        ))}
                      </div>
                    </>
                  )}
                </div>
              </div>
            </div>

            {activeExtraFilters > 0 && (
              <div className="active-filters" aria-label="Active filters">
                {laneFilter !== "all" && (
                  <button className="active-chip" onClick={() => setLaneFilter("all")}>
                    Lane: {laneInfo(laneFilter).label} <X size={10} />
                  </button>
                )}
                {categoryFilter !== "All" && (
                  <button className="active-chip" onClick={() => setCategoryFilter("All")}>
                    {categoryMetaMap[categoryFilter]?.emoji}{" "}
                    {categoryMetaMap[categoryFilter]?.label || categoryFilter} <X size={10} />
                  </button>
                )}
                {statusFilter !== "all" && (
                  <button className="active-chip" onClick={() => setStatusFilter("all")}>
                    {getStatusInfo(statusFilter).label} <X size={10} />
                  </button>
                )}
                {untaggedOnly && (
                  <button className="active-chip" onClick={() => setUntaggedOnly(false)}>
                    Untagged <X size={10} />
                  </button>
                )}
                {dateFilter !== "any" && (
                  <button
                    className="active-chip"
                    onClick={() => {
                      setDateFilter("any");
                      setDateFrom("");
                      setDateTo("");
                    }}
                  >
                    {dateLabel} <X size={10} />
                  </button>
                )}
                {[...hasFilters].map((kind) => (
                  <button
                    key={kind}
                    className="active-chip"
                    onClick={() =>
                      setHasFilters((prev) => {
                        const next = new Set(prev);
                        next.delete(kind);
                        return next;
                      })
                    }
                  >
                    Has {kind === "audio" ? "voice" : kind} <X size={10} />
                  </button>
                ))}
                <button className="active-clear" onClick={resetFilters}>
                  Clear all
                </button>
              </div>
            )}

            {filtersOpen && (
              <div className="filter-panel" role="group" aria-label="Filters">
                <div className="filter-grid">
                  <label className="filter-field">
                    <span>Lane</span>
                    <select value={laneFilter} onChange={(e) => setLaneFilter(e.target.value)}>
                      <option value="all">Any</option>
                      {lanes.map((l) => (
                        <option key={l.key} value={l.key}>
                          {l.mark} {l.label} ({items.filter((x) => x.lane === l.key).length})
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="filter-field">
                    <span>Type</span>
                    <select
                      value={categoryFilter}
                      onChange={(e) => setCategoryFilter(e.target.value)}
                    >
                      <option value="All">Any</option>
                      {[UNSORTED, ...categoriesList].map((c) => (
                        <option key={c} value={c}>
                          {categoryMetaMap[c]?.emoji || "\u2728"}{" "}
                          {c === UNSORTED ? "Unsorted" : categoryMetaMap[c]?.label || c} (
                          {items.filter((x) => x.category === c).length})
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="filter-field">
                    <span>Status</span>
                    <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
                      <option value="all">Any</option>
                      {statuses.map((st) => (
                        <option key={st.key} value={st.key}>
                          {st.icon} {st.label} ({items.filter((x) => x.status === st.key).length})
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="filter-field">
                    <span>Date</span>
                    <select
                      value={dateFilter}
                      onChange={(e) => {
                        const next = e.target.value as DateFilter;
                        setDateFilter(next);
                        if (next !== "custom") {
                          setDateFrom("");
                          setDateTo("");
                        }
                      }}
                    >
                      <option value="any">Any time</option>
                      <option value="today">Today</option>
                      <option value="7d">Last 7 days</option>
                      <option value="30d">Last 30 days</option>
                      {dateFilter === "custom" && <option value="custom">Custom range</option>}
                    </select>
                  </label>
                </div>
                <p className="filter-hint">
                  For exact dates, use the <Calendar size={11} /> date chip next to Filters.
                </p>
                <div className="filter-row">
                  <span className="filter-label">Contains</span>
                  {(
                    [
                      ["image", "\u{1F5BC} Image"],
                      ["link", "\u{1F517} Link"],
                      ["audio", "\u{1F399} Voice"],
                      ["video", "\u{1F3AC} Video"],
                      ["file", "\u{1F4CE} File"],
                    ] as const
                  ).map(([kind, label]) => (
                    <Button
                      key={kind}
                      className={`cat-filter-chip ${hasFilters.has(kind) ? "on" : ""}`}
                      aria-pressed={hasFilters.has(kind)}
                      onClick={() =>
                        setHasFilters((prev) => {
                          const next = new Set(prev);
                          if (next.has(kind)) next.delete(kind);
                          else next.add(kind);
                          return next;
                        })
                      }
                    >
                      {label}{" "}
                      <span className="cat-count-badge">
                        {items.filter((i) => hasKind(i, kind)).length}
                      </span>
                    </Button>
                  ))}
                  <Button
                    className={`cat-filter-chip untagged-chip ${untaggedOnly ? "on" : ""}`}
                    aria-pressed={untaggedOnly}
                    onClick={() => setUntaggedOnly((v) => !v)}
                  >
                    <Tag size={10} /> Untagged{" "}
                    <span className="cat-count-badge">
                      {items.filter((x) => x.tags.length === 0).length}
                    </span>
                  </Button>
                </div>
              </div>
            )}

            {filtered.length === 0 && !(groupedView && noActiveFilters) ? (
              <div className="empty-state">
                <p>No thoughts match your current filters in "{activeDesk.title}".</p>
                <Button className="chip" onClick={resetFilters}>
                  clear filters
                </Button>
              </div>
            ) : view === "board" ? (
              <div className="board-grid">
                {lanes.map((s) => (
                  <div className="board-column" key={s.key}>
                    <div className="board-heading">
                      <span>
                        {s.mark} {s.label}
                      </span>
                      <span>{filtered.filter((i) => i.lane === s.key).length}</span>
                    </div>
                    <div className="board-cards">
                      {filtered.filter((i) => i.lane === s.key).map(card)}
                      {!filtered.some((i) => i.lane === s.key) && (
                        <div className="board-empty">—</div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            ) : groupedView ? (
              <div className="day-groups">
                {visibleGroups.map((group) => (
                  <section className="day-group" key={group.key} aria-label={group.label}>
                    <header className="day-head">
                      <h3>{group.label}</h3>
                      <span className="day-sub">
                        {group.label === "Today" || group.label === "Yesterday"
                          ? fullDate(group.time)
                          : daysAgoHint(group.time)}
                      </span>
                      <span className="day-count">
                        {group.items.length} {group.items.length === 1 ? "note" : "notes"}
                      </span>
                      {selectMode && (
                        <Button
                          className="day-select"
                          onClick={() => selectMany(group.items.map((i) => i.id))}
                        >
                          Select day
                        </Button>
                      )}
                    </header>
                    {group.items.length === 0 ? (
                      <p className="day-empty">
                        Nothing captured today yet. Type above, or use Voice, Photo or Video.
                      </p>
                    ) : (
                      <div className={`thought-grid ${view === "timeline" ? "timeline-view" : ""}`}>
                        {group.items.map(card)}
                      </div>
                    )}
                  </section>
                ))}
              </div>
            ) : (
              <div className={`thought-grid ${view === "timeline" ? "timeline-view" : ""}`}>
                {paged.map(card)}
              </div>
            )}

            {view !== "board" && (groupedView ? dayPageCount > 1 : pageCount > 1) && (
              <Pager
                page={groupedView ? dayPage : current}
                pages={groupedView ? dayPageCount : pageCount}
                onPage={setPage}
                info={
                  groupedView
                    ? `Days ${dayPage * DAYS_PER_PAGE + 1}\u2013${Math.min(dayGroups.length, (dayPage + 1) * DAYS_PER_PAGE)} of ${dayGroups.length}`
                    : `${current * PAGE_SIZE + 1}\u2013${Math.min(filtered.length, (current + 1) * PAGE_SIZE)} of ${filtered.length}`
                }
              />
            )}
          </section>
        )}

        {/* Footer Utilities */}
        <footer className="desk-footer">
          <span>
            desk: {activeDesk.title} (#{activeDesk.id}) · sovereign storage
          </span>
          <div>
            <Button onClick={reset}>
              <RotateCcw size={12} /> reset demo
            </Button>
            <Button
              onClick={async () => {
                try {
                  const full = await Promise.all(desks.map((d) => hydrateDesk(d as DeskData)));
                  download(
                    JSON.stringify(full, null, 2),
                    `${activeDesk.id}-brain-dump.json`,
                    "application/json",
                  );
                } catch (error) {
                  setToast(`Export failed: ${(error as Error).message}`);
                }
              }}
            >
              <FileJson size={12} /> json
            </Button>
            <Button
              onClick={() =>
                download(
                  items
                    .map(
                      (i) =>
                        `## [${i.category}] (${i.status}) · ${laneInfo(i.lane).label}\n${i.text}\n\n${i.tags.join(" ")}\n`,
                    )
                    .join("\n---\n\n"),
                  `${activeDesk.id}-brain-dump.md`,
                  "text/markdown",
                )
              }
            >
              <FileText size={12} /> markdown <ArrowDownToLine size={12} />
            </Button>
          </div>
        </footer>
      </main>

      {selectMode && (
        <div className="select-bar" role="region" aria-label="Selection">
          <span className="select-count">
            {selectedIds.size} selected
            {(() => {
              const visible = new Set(filtered.map((i) => i.id));
              const hidden = [...selectedIds].filter((id) => !visible.has(id)).length;
              return hidden > 0 ? <small> · {hidden} hidden by filters</small> : null;
            })()}
          </span>
          <Button
            className="select-link"
            onClick={() => selectMany(filtered.map((i) => i.id))}
            disabled={filtered.length === 0}
          >
            Select all {filtered.length} shown
          </Button>
          <Button
            className="select-link"
            onClick={() => setSelectedIds(new Set())}
            disabled={selectedIds.size === 0}
          >
            Clear
          </Button>
          <Button
            className="select-export"
            onClick={() => void exportSelectedPdf()}
            disabled={selectedIds.size === 0 || isExporting}
          >
            <FileText size={13} /> {isExporting ? "Preparing…" : "Export PDF"}
          </Button>
          <Button className="select-done" onClick={exitSelect} aria-label="Exit select mode">
            <X size={13} />
          </Button>
        </div>
      )}

      {toast && (
        <div className="toast" role="status">
          <Check size={13} /> {toast}
          {undoId && (
            <button className="toast-action" onClick={undoCapture}>
              Undo
            </button>
          )}
        </div>
      )}

      {quickTag &&
        (() => {
          const target = items.find((i) => i.id === quickTag.id);
          if (!target) return null;
          const counts = new Map<string, number>();
          items.forEach((i) => i.tags.forEach((t) => counts.set(t, (counts.get(t) ?? 0) + 1)));
          const suggestions = [
            ...new Set([
              ...target.tags,
              ...[...counts.entries()].sort((a, b) => b[1] - a[1]).map(([t]) => t),
            ]),
          ].slice(0, 12);
          const pickTag = (tag: string) => {
            toggleTag(target.id, tag);
            setQuickTag(null);
          };
          return (
            <>
              <div className="quicktag-backdrop" onMouseDown={() => setQuickTag(null)} />
              <div
                className="quicktag-pop"
                style={{ left: quickTag.x, top: quickTag.y }}
                role="dialog"
                aria-label={quickTag.kind === "type" ? "Change type" : "Add or change tags"}
              >
                {quickTag.kind === "type" ? (
                  <>
                    <div className="quicktag-label">Type</div>
                    <div className="quicktag-chips">
                      {[UNSORTED, ...categoriesList].map((c) => (
                        <button
                          key={c}
                          className={target.category === c ? "on" : ""}
                          onClick={() => {
                            if (target.category !== c) {
                              update(target.id, { category: c });
                              playRouteSwoosh();
                            }
                            setQuickTag(null);
                          }}
                        >
                          {categoryMetaMap[c]?.emoji || "\u2728"} {categoryMetaMap[c]?.label || c}
                        </button>
                      ))}
                    </div>
                  </>
                ) : (
                  <>
                    <input
                      className="quicktag-input top"
                      placeholder="+ new tag, press enter"
                      autoFocus
                      onKeyDown={(e) => {
                        if (e.key !== "Enter") return;
                        const value = e.currentTarget.value
                          .trim()
                          .replace(/^#/, "")
                          .toLowerCase()
                          .replace(/\s+/g, "-");
                        if (value && !target.tags.includes(`#${value}`))
                          toggleTag(target.id, `#${value}`);
                        setQuickTag(null);
                      }}
                    />
                    {suggestions.length > 0 && (
                      <>
                        <div className="quicktag-label">Tags</div>
                        <div className="quicktag-chips">
                          {suggestions.map((t) => (
                            <button
                              key={t}
                              className={target.tags.includes(t) ? "on" : ""}
                              onClick={() => pickTag(t)}
                            >
                              {t}
                            </button>
                          ))}
                        </div>
                      </>
                    )}
                  </>
                )}
              </div>
            </>
          );
        })()}

      {/* New Desk Modal */}
      {isCreateModalOpen && (
        <div className="modal-backdrop" onClick={() => setIsCreateModalOpen(false)}>
          <div className="desk-modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Create Brainstorm Desk</h3>
              <button className="close-btn" onClick={() => setIsCreateModalOpen(false)}>
                <X size={14} />
              </button>
            </div>
            <div className="modal-body">
              <label>
                Desk Title
                <input
                  value={newDeskTitle}
                  onChange={(e) => setNewDeskTitle(e.target.value)}
                  placeholder="e.g. Niche Health eBook & Launch"
                  autoFocus
                />
              </label>
              <label>
                Readable name (slug)
                <input
                  value={newDeskIdInput}
                  onChange={(e) => setNewDeskIdInput(e.target.value)}
                  placeholder="e.g. niche-health-ebook"
                />
              </label>
              <div className="modal-row">
                <label>
                  Emoji Icon
                  <input
                    value={newDeskEmoji}
                    onChange={(e) => setNewDeskEmoji(e.target.value)}
                    placeholder="🌿"
                    maxLength={3}
                  />
                </label>
                <label>
                  Workspace Group
                  <select value={newDeskGroup} onChange={(e) => setNewDeskGroup(e.target.value)}>
                    <option value="Health & Products">Health & Products</option>
                    <option value="General">General</option>
                    <option value="Product">Product</option>
                    <option value="Research">Research</option>
                    <option value="Personal">Personal</option>
                  </select>
                </label>
              </div>
            </div>
            <div className="modal-footer">
              <button className="cancel-btn" onClick={() => setIsCreateModalOpen(false)}>
                Cancel
              </button>
              <button className="confirm-btn" onClick={handleCreateDesk}>
                Create Desk
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Edit Desk Modal */}
      {editingDesk && (
        <div className="modal-backdrop" onClick={() => setEditingDesk(null)}>
          <div className="desk-modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Edit desk</h3>
              <button className="close-btn" onClick={() => setEditingDesk(null)}>
                <X size={14} />
              </button>
            </div>
            <div className="modal-body">
              <label>
                Desk Title
                <input
                  value={editTitle}
                  onChange={(e) => setEditTitle(e.target.value)}
                  placeholder="Desk Title..."
                  autoFocus
                />
              </label>
              <label>
                Readable name (slug)
                <input
                  value={editId}
                  onChange={(e) => setEditId(e.target.value)}
                  placeholder="page-id-slug"
                />
              </label>
              <div className="modal-row">
                <label>
                  Emoji Icon
                  <input
                    value={editEmoji}
                    onChange={(e) => setEditEmoji(e.target.value)}
                    maxLength={3}
                  />
                </label>
                <label>
                  Group
                  <select value={editGroup} onChange={(e) => setEditGroup(e.target.value)}>
                    <option value="Health & Products">Health & Products</option>
                    <option value="General">General</option>
                    <option value="Product">Product</option>
                    <option value="Research">Research</option>
                    <option value="Personal">Personal</option>
                  </select>
                </label>
              </div>
              <details className="desk-purpose">
                <summary>
                  Purpose &amp; outcome <small>Optional</small>
                </summary>
                <p>
                  Give AI a little context about what this desk is for. Add this when it becomes
                  clear.
                </p>
                <label>
                  Purpose
                  <textarea
                    value={editIntent}
                    onChange={(e) => setEditIntent(e.target.value)}
                    placeholder="What are you exploring or trying to do?"
                    maxLength={1000}
                  />
                </label>
                <label>
                  Desired outcome
                  <textarea
                    value={editOutcome}
                    onChange={(e) => setEditOutcome(e.target.value)}
                    placeholder="What would a useful result look like?"
                    maxLength={1000}
                  />
                </label>
              </details>
            </div>
            <div className="modal-footer">
              <button className="cancel-btn" onClick={() => setEditingDesk(null)}>
                Cancel
              </button>
              <button className="confirm-btn" onClick={handleSaveEditDesk}>
                Save Changes
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Slide-over Detail & Reflection Drawer */}
      {detail && (
        <div
          className="drawer-backdrop"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) setDetailId(null);
          }}
        >
          <aside className="detail-drawer" role="dialog" aria-label="Thought details">
            <div className="drawer-header">
              <div className="drawer-header-category-wrap">
                <span className="drawer-cat-icon">
                  {categoryMetaMap[detail.category]?.emoji || "💭"}
                </span>
                <select
                  className="drawer-category-select"
                  value={detail.category}
                  onChange={(e) => update(detail.id, { category: e.target.value })}
                  aria-label="Change thought category"
                >
                  {[...new Set([UNSORTED, ...categoriesList, detail.category])].map((cat) => (
                    <option key={cat} value={cat}>
                      {categoryMetaMap[cat]?.label || cat}
                    </option>
                  ))}
                </select>
                <span className="drawer-date-bullet">·</span>
                <span className="drawer-date-text">
                  {new Date(detail.createdAt).toLocaleString(undefined, {
                    month: "short",
                    day: "numeric",
                    hour: "numeric",
                    minute: "2-digit",
                  })}
                </span>
              </div>
              <Button title="Close" onClick={() => setDetailId(null)}>
                <X size={17} />
              </Button>
            </div>

            <div className="drawer-scroll">
              <label className="attachment-picker">
                Attach files
                <input
                  aria-label="Attach files to thought"
                  type="file"
                  multiple
                  onChange={(e) => {
                    void attachFiles(e.target.files, detail.id);
                    e.target.value = "";
                  }}
                />
              </label>
              {(detail.attachments || []).map((file, i) => (
                <div className="file-attachment" key={i}>
                  {mediaKind(file) !== "other" && <MediaPlayer file={file} />}
                  <MediaDownload file={file} />
                  <button
                    aria-label={`Remove ${file.name}`}
                    onClick={() =>
                      update(detail.id, {
                        attachments: detail.attachments?.filter((_, n) => n !== i),
                      })
                    }
                  >
                    ×
                  </button>
                </div>
              ))}
              <textarea
                className="drawer-textarea"
                value={detail.text}
                onChange={(e) => update(detail.id, { text: e.target.value })}
                onPaste={(e) =>
                  processPastedImages(e, (urls) =>
                    update(detail.id, {
                      images: [...(detail.images || []), ...urls],
                    }),
                  )
                }
                onKeyDown={(e) =>
                  handleFormatShortcut(e, detail.text, (val) => update(detail.id, { text: val }))
                }
                placeholder="Write or edit thought text… (supports ```code```, **bold**, *italic*, <u>underline</u>, paste images)"
                aria-label="Edit thought text"
              />

              <div className="formatting-shortcut-hint">
                <span>
                  <kbd>Ctrl+B</kbd> Bold
                </span>
                <span>
                  <kbd>Ctrl+I</kbd> Italic
                </span>
                <span>
                  <kbd>Ctrl+U</kbd> Underline
                </span>
                <span>
                  <kbd>```</kbd> Code
                </span>
              </div>

              {detail.images && detail.images.length > 0 && (
                <>
                  <div className="drawer-label">pasted images & attachments</div>
                  <div className="drawer-images-gallery">
                    {detail.images.map((img, i) => (
                      <div
                        key={i}
                        className="drawer-img-thumb-wrap"
                        onClick={() =>
                          setActiveZoomImages({
                            images: detail.images!,
                            initialIndex: i,
                          })
                        }
                        title="Click to zoom evidence image"
                      >
                        <img src={img} alt="Pasted attachment" className="drawer-img-thumb" />
                        <button
                          className="remove-img-btn"
                          onClick={(e) => {
                            e.stopPropagation();
                            update(detail.id, {
                              images: detail.images?.filter((_, idx) => idx !== i),
                            });
                          }}
                          title="Remove image"
                        >
                          <X size={10} />
                        </button>
                      </div>
                    ))}
                  </div>
                </>
              )}

              <div className="drawer-section-header">
                <div className="drawer-label">action status</div>
                <button
                  className="drawer-subtle-edit-btn"
                  onClick={() => setIsEditingStatuses((prev) => !prev)}
                  title="Configure action statuses for this desk"
                >
                  {isEditingStatuses ? "Done" : "⚙ Edit"}
                </button>
              </div>

              {isEditingStatuses ? (
                <div className="custom-editor-box">
                  <div className="custom-items-list">
                    {statuses.map((st) => (
                      <div key={st.key} className="custom-editor-item">
                        <input
                          className="custom-icon-input"
                          value={st.icon}
                          onChange={(e) => {
                            const val = e.target.value;
                            const updated = statuses.map((item) =>
                              item.key === st.key ? { ...item, icon: val } : item,
                            );
                            updateActiveDesk({ customStatuses: updated });
                          }}
                        />
                        <input
                          className="custom-label-input"
                          value={st.label}
                          onChange={(e) => {
                            const val = e.target.value;
                            const updated = statuses.map((item) =>
                              item.key === st.key ? { ...item, label: val } : item,
                            );
                            updateActiveDesk({ customStatuses: updated });
                          }}
                        />
                        {statuses.length > 1 && (
                          <button
                            className="custom-del-btn"
                            onClick={() => {
                              const updated = statuses.filter((item) => item.key !== st.key);
                              updateActiveDesk({ customStatuses: updated });
                            }}
                            title="Delete status"
                          >
                            <X size={12} />
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                  <div className="custom-add-row">
                    <input
                      className="custom-add-icon"
                      value={newStatusIcon}
                      onChange={(e) => setNewStatusIcon(e.target.value)}
                      placeholder="Icon"
                    />
                    <input
                      className="custom-add-label"
                      value={newStatusLabel}
                      onChange={(e) => setNewStatusLabel(e.target.value)}
                      placeholder="New status name (e.g. L0, L1)..."
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && newStatusLabel.trim()) {
                          const key = newStatusLabel.trim().toLowerCase().replace(/\s+/g, "_");
                          const updated = [
                            ...statuses,
                            { key, label: newStatusLabel.trim(), icon: newStatusIcon || "🏷️" },
                          ];
                          updateActiveDesk({ customStatuses: updated });
                          setNewStatusLabel("");
                        }
                      }}
                    />
                    <button
                      className="custom-add-btn"
                      onClick={() => {
                        if (!newStatusLabel.trim()) return;
                        const key = newStatusLabel.trim().toLowerCase().replace(/\s+/g, "_");
                        const updated = [
                          ...statuses,
                          { key, label: newStatusLabel.trim(), icon: newStatusIcon || "🏷️" },
                        ];
                        updateActiveDesk({ customStatuses: updated });
                        setNewStatusLabel("");
                      }}
                    >
                      <Plus size={12} /> Add
                    </button>
                  </div>
                </div>
              ) : (
                <div className="status-selector-row">
                  {statuses.map((st) => (
                    <Button
                      key={st.key}
                      className={`status-btn ${detail.status === st.key ? "active" : ""}`}
                      onClick={() => update(detail.id, { status: st.key as LifecycleStatus })}
                    >
                      {st.icon} {st.label}
                    </Button>
                  ))}
                </div>
              )}

              <div className="drawer-label">tags</div>
              <div className="drawer-tags">
                {detail.tags.map((tag) => (
                  <span key={tag}>
                    {tag}
                    <Button
                      title={`Remove ${tag}`}
                      onClick={() =>
                        update(detail.id, {
                          tags: detail.tags.filter((t) => t !== tag),
                        })
                      }
                    >
                      <X size={11} />
                    </Button>
                  </span>
                ))}
              </div>

              <input
                className="drawer-tag-input"
                placeholder="+ add tag, press enter"
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    const value = e.currentTarget.value.trim().replace(/^#/, "").toLowerCase();
                    if (value)
                      update(detail.id, {
                        tags: [...new Set([...detail.tags, `#${value}`])],
                      });
                    e.currentTarget.value = "";
                  }
                }}
              />

              <div className="drawer-section-header">
                <div className="drawer-label">destination lane</div>
                <button
                  className="drawer-subtle-edit-btn"
                  onClick={() => setIsEditingLanes((prev) => !prev)}
                  title="Configure destination lanes for this desk"
                >
                  {isEditingLanes ? "Done" : "⚙ Edit"}
                </button>
              </div>

              {isEditingLanes ? (
                <div className="custom-editor-box">
                  <div className="custom-items-list">
                    {lanes.map((l) => (
                      <div key={l.key} className="custom-editor-item">
                        <input
                          className="custom-icon-input"
                          value={l.mark}
                          onChange={(e) => {
                            const val = e.target.value;
                            const updated = lanes.map((item) =>
                              item.key === l.key ? { ...item, mark: val } : item,
                            );
                            updateActiveDesk({ customLanes: updated });
                          }}
                        />
                        <input
                          className="custom-label-input"
                          value={l.label}
                          onChange={(e) => {
                            const val = e.target.value;
                            const updated = lanes.map((item) =>
                              item.key === l.key ? { ...item, label: val } : item,
                            );
                            updateActiveDesk({ customLanes: updated });
                          }}
                        />
                        {lanes.length > 1 && (
                          <button
                            className="custom-del-btn"
                            onClick={() => {
                              const updated = lanes.filter((item) => item.key !== l.key);
                              updateActiveDesk({ customLanes: updated });
                            }}
                            title="Delete lane"
                          >
                            <X size={12} />
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                  <div className="custom-add-row">
                    <input
                      className="custom-add-icon"
                      value={newLaneMark}
                      onChange={(e) => setNewLaneMark(e.target.value)}
                      placeholder="Mark"
                    />
                    <input
                      className="custom-add-label"
                      value={newLaneLabel}
                      onChange={(e) => setNewLaneLabel(e.target.value)}
                      placeholder="New lane name (e.g. Backlog, Todo)..."
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && newLaneLabel.trim()) {
                          const key = newLaneLabel.trim().toLowerCase().replace(/\s+/g, "_");
                          const updated = [
                            ...lanes,
                            {
                              key,
                              label: newLaneLabel.trim(),
                              mark: newLaneMark || "•",
                              hint: "custom lane",
                            },
                          ];
                          updateActiveDesk({ customLanes: updated });
                          setNewLaneLabel("");
                        }
                      }}
                    />
                    <button
                      className="custom-add-btn"
                      onClick={() => {
                        if (!newLaneLabel.trim()) return;
                        const key = newLaneLabel.trim().toLowerCase().replace(/\s+/g, "_");
                        const updated = [
                          ...lanes,
                          {
                            key,
                            label: newLaneLabel.trim(),
                            mark: newLaneMark || "•",
                            hint: "custom lane",
                          },
                        ];
                        updateActiveDesk({ customLanes: updated });
                        setNewLaneLabel("");
                      }}
                    >
                      <Plus size={12} /> Add
                    </button>
                  </div>
                </div>
              ) : (
                <div className="lane-list">
                  {lanes.map((s) => (
                    <Button
                      key={s.key}
                      className={`lane-option ${detail.lane === s.key ? "current" : ""}`}
                      onClick={() => route(detail, s.key as Lane)}
                    >
                      <span className="lane-option-mark">{s.mark}</span>
                      <span>{s.label}</span>
                      <span className="lane-option-hint">{s.hint}</span>
                      {detail.lane === s.key && <Check size={14} />}
                    </Button>
                  ))}
                </div>
              )}

              {/* Pattern Echoes */}
              <div className="echo-section">
                <div className="drawer-label">pattern echoes (related thoughts)</div>
                {echoes.length ? (
                  echoes.map((echo) => (
                    <Button
                      key={echo.id}
                      className="echo-item"
                      onClick={() => setDetailId(echo.id)}
                    >
                      <span>{echo.text}</span>
                      <ArrowUpRight size={13} />
                    </Button>
                  ))
                ) : (
                  <p className="no-echo">No related thoughts discovered yet.</p>
                )}
              </div>
            </div>

            <div className="drawer-footer">
              <Button onClick={() => remove(detail.id)}>
                <Trash2 size={13} /> delete
              </Button>
              <span>
                <Check size={12} /> {saveStatus}
              </span>
            </div>
          </aside>
        </div>
      )}

      {activeZoomImages && (
        <ImageZoomModal
          images={activeZoomImages.images}
          initialIndex={activeZoomImages.initialIndex}
          onClose={() => setActiveZoomImages(null)}
        />
      )}

      <input
        ref={importInput}
        type="file"
        accept=".zip"
        hidden
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) void handleImport(file);
          e.target.value = "";
        }}
      />
      <p className="desk-save-status" role="status">
        {saveStatus}
      </p>
      {isStorageModalOpen && (
        <VaultDirectoryModal
          desk={activeDesk}
          customDirName={customDirName}
          onPickDir={handlePickDirectory}
          onExport={handleExportDeskPackage}
          onImport={() => importInput.current?.click()}
          onOpen={handleOpenFolder}
          saveStatus={saveStatus}
          groupByDate={groupByDate}
          onToggleGroupByDate={toggleGroupByDate}
          onClose={() => setIsStorageModalOpen(false)}
        />
      )}
    </div>
  );
}
