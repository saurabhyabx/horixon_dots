// Formats selected cards (text and images only) as a print-ready document and opens the browser's
// print dialog, where "Save as PDF" produces the file. No library, nothing leaves the device.
import { fullDate, groupByDay } from "./dates";

export type ExportCard = {
  text: string;
  label: string;
  tags: string[];
  createdAt: number;
  images: string[];
};

export type ExportOptions = {
  title: string;
  emoji?: string;
  intent?: string | undefined;
  desiredOutcome?: string | undefined;
  cards: ExportCard[];
};

const esc = (value: string) =>
  value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

// Same light markup the app supports: **bold**, *italic*, <u>underline</u>, `code`, ``` fences.
function inline(text: string) {
  return esc(text)
    .replace(/`([^`\n]+)`/g, "<code>$1</code>")
    .replace(/&lt;u&gt;([\s\S]*?)&lt;\/u&gt;/g, "<u>$1</u>")
    .replace(/\*\*([\s\S]+?)\*\*/g, "<strong>$1</strong>")
    .replace(/\*([^*\n]+?)\*/g, "<em>$1</em>")
    .replace(/\n/g, "<br>");
}

function body(text: string) {
  return text
    .split(/(```[\s\S]*?```)/g)
    .map((part) => {
      if (part.startsWith("```") && part.endsWith("```") && part.length >= 6) {
        let code = part.slice(3, -3);
        const firstBreak = code.indexOf("\n");
        if (firstBreak !== -1 && !code.slice(0, firstBreak).trim().includes(" "))
          code = code.slice(firstBreak + 1);
        return `<pre>${esc(code.trim())}</pre>`;
      }
      return inline(part);
    })
    .join("");
}

const time = (value: number) =>
  new Date(value).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });

export function buildExportHtml({ title, emoji, intent, desiredOutcome, cards }: ExportOptions) {
  const groups = groupByDay([...cards].sort((a, b) => b.createdAt - a.createdAt));
  const sections = groups
    .map(
      (group) => `
    <section class="day">
      <h2>${esc(fullDate(group.time))}<span>${group.items.length} ${group.items.length === 1 ? "note" : "notes"}</span></h2>
      ${group.items
        .map(
          (card) => `
      <article>
        <div class="top"><span class="kind">${esc(card.label)}</span><span class="when">${esc(time(card.createdAt))}</span></div>
        ${card.text.trim() ? `<div class="text">${body(card.text)}</div>` : ""}
        ${card.images.length ? `<div class="images n${Math.min(card.images.length, 2)}">${card.images.map((src) => `<img src="${src}" alt="">`).join("")}</div>` : ""}
        ${card.tags.length ? `<div class="tags">${card.tags.map(esc).join("  ")}</div>` : ""}
      </article>`,
        )
        .join("")}
    </section>`,
    )
    .join("");

  const context = [
    intent ? `<p><b>Purpose</b> ${esc(intent)}</p>` : "",
    desiredOutcome ? `<p><b>Desired outcome</b> ${esc(desiredOutcome)}</p>` : "",
  ].join("");

  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><title>${esc(title)} — notes</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Fraunces:ital,opsz,wght@0,9..144,400;0,9..144,600;1,9..144,400&family=IBM+Plex+Mono:wght@400;500&display=swap">
<style>
  @page { size: A4; margin: 18mm 16mm 20mm; }
  * { box-sizing: border-box; }
  body { margin: 0; font-family: "Fraunces", Georgia, serif; color: #2b2722; font-size: 11.5pt; line-height: 1.55; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  header { padding-bottom: 14px; margin-bottom: 8px; border-bottom: 2px solid #2b2722; }
  h1 { margin: 0 0 4px; font-size: 24pt; font-weight: 600; letter-spacing: -0.01em; }
  .meta { margin: 0; font-family: "IBM Plex Mono", monospace; font-size: 8.5pt; color: #7a7268; }
  .context p { margin: 8px 0 0; font-size: 10.5pt; color: #4a443c; }
  .context b { font-family: "IBM Plex Mono", monospace; font-size: 8pt; font-weight: 500; text-transform: uppercase; letter-spacing: 0.06em; color: #b4421f; margin-right: 6px; }
  h2 { display: flex; justify-content: space-between; align-items: baseline; margin: 22px 0 10px; padding-bottom: 4px; border-bottom: 1px solid #d9d2c5; font-size: 13pt; font-weight: 600; break-after: avoid; }
  h2 span { font-family: "IBM Plex Mono", monospace; font-size: 8pt; font-weight: 400; color: #7a7268; }
  article { break-inside: avoid; margin: 0 0 12px; padding: 10px 14px 10px 16px; border-left: 3px solid #b4421f; background: #faf6ee; border-radius: 0 6px 6px 0; }
  .top { display: flex; justify-content: space-between; margin-bottom: 4px; font-family: "IBM Plex Mono", monospace; font-size: 8pt; letter-spacing: 0.06em; text-transform: uppercase; color: #7a7268; }
  .kind { color: #b4421f; font-weight: 500; }
  .text { overflow-wrap: anywhere; }
  .text code { font-family: "IBM Plex Mono", monospace; font-size: 9.5pt; background: #ece5d7; padding: 1px 4px; border-radius: 3px; }
  .text pre { margin: 6px 0; padding: 8px 10px; background: #2b2722; color: #faf6ee; border-radius: 4px; font-family: "IBM Plex Mono", monospace; font-size: 9pt; white-space: pre-wrap; overflow-wrap: anywhere; }
  .images { display: grid; gap: 8px; margin-top: 8px; }
  .images.n1 { grid-template-columns: 1fr; }
  .images.n2 { grid-template-columns: 1fr 1fr; }
  .images img { display: block; justify-self: center; width: auto; height: auto; max-width: 100%; max-height: 95mm; object-fit: contain; background: #fff; border: 1px solid #e2dacb; border-radius: 4px; }
  .tags { margin-top: 6px; font-family: "IBM Plex Mono", monospace; font-size: 8.5pt; color: #b4421f; }
  footer { margin-top: 26px; padding-top: 8px; border-top: 1px solid #d9d2c5; font-family: "IBM Plex Mono", monospace; font-size: 7.5pt; color: #9a9185; }
</style></head>
<body>
  <header>
    <h1>${emoji ? `${esc(emoji)} ` : ""}${esc(title)}</h1>
    <p class="meta">${cards.length} ${cards.length === 1 ? "note" : "notes"} · exported ${esc(fullDate(Date.now()))}</p>
    ${context ? `<div class="context">${context}</div>` : ""}
  </header>
  ${sections}
  <footer>Text and images only. Voice notes, videos and other files are not included in this export.</footer>
</body></html>`;
}

/** Opens the print dialog for the formatted notes. Resolves once the dialog has been requested. */
export async function exportCardsPdf(options: ExportOptions) {
  const frame = document.createElement("iframe");
  frame.setAttribute("aria-hidden", "true");
  frame.style.cssText =
    "position:fixed;right:0;bottom:0;width:0;height:0;border:0;visibility:hidden";
  document.body.appendChild(frame);
  const cleanup = () => frame.remove();
  try {
    const doc = frame.contentDocument;
    const win = frame.contentWindow;
    if (!doc || !win) throw new Error("Couldn't prepare the export.");
    doc.open();
    doc.write(buildExportHtml(options));
    doc.close();
    // Wait for photos and fonts so nothing prints half-loaded (but never hang on a slow font).
    await Promise.race([
      Promise.all([
        ...Array.from(doc.images).map((img) =>
          img.complete
            ? Promise.resolve()
            : new Promise<void>((resolve) => {
                img.onload = img.onerror = () => resolve();
              }),
        ),
        doc.fonts?.ready ?? Promise.resolve(),
      ]),
      new Promise((resolve) => setTimeout(resolve, 4000)),
    ]);
    win.onafterprint = cleanup;
    win.focus();
    win.print();
    // Fallback cleanup for browsers that don't fire afterprint.
    setTimeout(cleanup, 120000);
  } catch (error) {
    cleanup();
    throw error;
  }
}
