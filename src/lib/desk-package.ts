import { zip, unzipSync, strToU8, strFromU8 } from "fflate";
import { z } from "zod";

// `data` is a data URL, or an `idb:` reference to a blob in the browser media store (see media-store.ts).
const attachment = z.object({
  name: z.string(),
  data: z.string(),
  mime: z.string().optional(),
  seconds: z.number().optional(),
});
const thought = z.object({
  id: z.string().min(1),
  text: z.string(),
  category: z.string(),
  lane: z.string(),
  status: z.string(),
  tags: z.array(z.string()),
  createdAt: z.number().finite(),
  images: z.array(z.string()).optional(),
  attachments: z.array(attachment).optional(),
});
export const deskSchema = z.object({
  id: z.string().min(1),
  title: z.string(),
  slug: z.string().optional(),
  projectId: z.string().nullable().optional(),
  intent: z.string().optional(),
  desiredOutcome: z.string().optional(),
  emoji: z.string(),
  group: z.string(),
  isPinned: z.boolean(),
  createdAt: z.number().finite(),
  updatedAt: z.number().finite(),
  thoughts: z.array(thought),
  customStatuses: z
    .array(z.object({ key: z.string(), label: z.string(), icon: z.string() }))
    .optional(),
  customLanes: z
    .array(z.object({ key: z.string(), label: z.string(), mark: z.string(), hint: z.string() }))
    .optional(),
});
export type DeskData = z.infer<typeof deskSchema>;
export const safeName = (name: string) =>
  name
    .replace(/[^a-zA-Z0-9._-]/g, "-")
    .replace(/^\.+/, "")
    .slice(0, 100) || "attachment";
export const MAX_FILE = 20 * 1024 * 1024;
const MAX_PACKAGE = 100 * 1024 * 1024;

export function readFile(file: File): Promise<string> {
  if (file.size > MAX_FILE)
    return Promise.reject(new Error("Each attachment must be 20 MB or smaller."));
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error(`Could not read ${file.name}`));
    reader.readAsDataURL(file);
  });
}
function decode(data: string): { bytes: Uint8Array; mime: string } {
  const match = /^data:([^;,]*)(?:;base64),([\s\S]*)$/.exec(data);
  if (!match)
    throw new Error(
      "An attachment is missing its local copy. Reattach it before exporting or saving to a folder.",
    );
  const bytes = Uint8Array.from(atob(match[2]!), (c) => c.charCodeAt(0));
  if (bytes.length > MAX_FILE) throw new Error("An attachment exceeds the 20 MB limit.");
  return { bytes, mime: match[1] || "application/octet-stream" };
}
function encode(bytes: Uint8Array, mime: string) {
  let binary = "";
  for (let i = 0; i < bytes.length; i += 8192)
    binary += String.fromCharCode(...bytes.subarray(i, i + 8192));
  return `data:${mime};base64,${btoa(binary)}`;
}

// Export copies never mutate live records. Each desk owns its own assets directory.
export function packageFiles(input: DeskData): Record<string, Uint8Array> {
  const desk = deskSchema.parse(input);
  const files: Record<string, Uint8Array> = Object.create(null);
  let total = 0;
  const thoughts = desk.thoughts.map((t, ti) => {
    const { images, attachments, ...record } = t;
    const assets = [
      ...(images || []).map((data, index) => ({ name: `image-${index + 1}`, data, image: true })),
      ...(attachments || []).map((a) => ({ ...a, image: false })),
    ].map((a, ai) => {
      const { bytes, mime } = decode(a.data);
      total += bytes.length;
      if (total > MAX_PACKAGE) throw new Error("Desk attachments exceed the 100 MB package limit.");
      const extension =
        (
          {
            "image/png": ".png",
            "image/jpeg": ".jpg",
            "image/webp": ".webp",
            "image/gif": ".gif",
          } as Record<string, string>
        )[mime] || ".bin";
      const name = a.image ? a.name + extension : a.name;
      const path = `assets/${ti + 1}-${ai + 1}-${safeName(name)}`;
      files[path] = bytes;
      return { name, path, mime, image: a.image };
    });
    return { ...record, ...(assets.length ? { attachments: assets } : {}) };
  });
  files["desk.json"] = strToU8(JSON.stringify({ ...desk, thoughts }, null, 2));
  return files;
}
export async function exportZip(desk: DeskData) {
  const files = packageFiles(desk);
  return new Promise<Uint8Array>((resolve, reject) =>
    zip(files, { level: 0 }, (error, bytes) => (error ? reject(error) : resolve(bytes))),
  );
}
const manifestSchema = deskSchema.omit({ thoughts: true }).extend({
  thoughts: z.array(
    thought.omit({ images: true, attachments: true }).extend({
      attachments: z
        .array(
          z.object({
            name: z.string(),
            path: z.string(),
            mime: z.string().regex(/^[\w.+-]+\/[\w.+-]+$/),
            image: z.boolean(),
          }),
        )
        .optional(),
    }),
  ),
});
export function importFiles(files: Record<string, Uint8Array>, asNew = true): DeskData {
  if (!files["desk.json"]) throw new Error("This package has no desk.json.");
  const manifest = manifestSchema.parse(JSON.parse(strFromU8(files["desk.json"])));
  const restored = manifest.thoughts.map((t) => {
    const { attachments, ...rest } = t;
    const images: string[] = [];
    const other: { name: string; data: string }[] = [];
    for (const a of attachments || []) {
      if (!/^assets\/[a-zA-Z0-9][a-zA-Z0-9._-]*$/.test(a.path) || !files[a.path])
        throw new Error(`Missing or unsafe attachment: ${a.name}`);
      if (files[a.path]!.length > MAX_FILE) throw new Error("Attachment is too large.");
      const data = encode(files[a.path]!, a.mime);
      if (a.image && /^image\/(png|jpeg|webp|gif)$/.test(a.mime)) images.push(data);
      else other.push({ name: a.name, data });
    }
    return { ...rest, images, attachments: other };
  });
  // Import is always a new desk; it cannot overwrite an existing desk or thought.
  return deskSchema.parse({
    ...manifest,
    id: asNew ? crypto.randomUUID() : manifest.id,
    slug: asNew
      ? `${manifest.slug || safeName(manifest.title)}-import-${crypto.randomUUID().slice(0, 8)}`
      : manifest.slug,
    projectId: manifest.projectId ?? null,
    thoughts: restored.map((t) => ({ ...t, id: asNew ? crypto.randomUUID() : t.id })),
  });
}
export async function readFolder(handle: FileSystemDirectoryHandle) {
  const file = await (await handle.getFileHandle("desk.json")).getFile();
  if (file.size > MAX_FILE) throw new Error("Desk JSON is too large.");
  const json = await file.text();
  const manifest = manifestSchema.parse(JSON.parse(json));
  const files: Record<string, Uint8Array> = { "desk.json": strToU8(json) };
  let total = file.size;
  for (const thought of manifest.thoughts)
    for (const a of thought.attachments || []) {
      if (!/^assets\/[a-zA-Z0-9][a-zA-Z0-9._-]*$/.test(a.path))
        throw new Error("Unsafe attachment path.");
      const dir = await handle.getDirectoryHandle("assets");
      const asset = await (await dir.getFileHandle(a.path.slice(7))).getFile();
      total += asset.size;
      if (asset.size > MAX_FILE || total > MAX_PACKAGE)
        throw new Error("Desk exceeds attachment limits.");
      files[a.path] = new Uint8Array(await asset.arrayBuffer());
    }
  return importFiles(files, false);
}
export function importZip(bytes: Uint8Array) {
  if (bytes.length > MAX_PACKAGE) throw new Error("Package must be under 100 MB.");
  let total = 0;
  const files = unzipSync(bytes, {
    filter: (f) => {
      total += f.originalSize;
      if (
        total > MAX_PACKAGE ||
        f.originalSize > MAX_FILE ||
        f.name.includes("..") ||
        f.name.startsWith("/")
      )
        throw new Error("Package is too large or contains unsafe paths.");
      return true;
    },
  });
  return importFiles(files);
}
export async function writeFolder(handle: FileSystemDirectoryHandle, desk: DeskData) {
  const files = packageFiles(desk);
  const assets = await handle.getDirectoryHandle("assets", { create: true });
  // Content-address files so a failed save cannot overwrite assets referenced by the previous JSON.
  const manifest = JSON.parse(strFromU8(files["desk.json"]!)) as z.infer<typeof manifestSchema>;
  for (const t of manifest.thoughts)
    for (const a of t.attachments || []) {
      const bytes = files[a.path]!;
      const hash = Array.from(
        new Uint8Array(await crypto.subtle.digest("SHA-256", new Uint8Array(bytes))),
      )
        .map((b) => b.toString(16).padStart(2, "0"))
        .join("");
      const filename = `${hash}-${safeName(a.name)}`;
      const file = await assets.getFileHandle(filename, { create: true });
      if ((await file.getFile()).size !== bytes.length) {
        const writer = await file.createWritable();
        await writer.write(new Uint8Array(bytes));
        await writer.close();
      }
      a.path = `assets/${filename}`;
    }
  const file = await handle.getFileHandle("desk.json", { create: true });
  const writer = await file.createWritable();
  await writer.write(JSON.stringify(manifest, null, 2));
  await writer.close();
}

// Read-only feed for a future AI integration. Nothing is sent to a model here.
export function deskContext(desk: DeskData) {
  return {
    id: desk.id,
    projectId: desk.projectId ?? null,
    title: desk.title,
    intent: desk.intent || null,
    desiredOutcome: desk.desiredOutcome || null,
    updatedAt: desk.updatedAt,
    thoughts: desk.thoughts.map((t) => ({
      id: t.id,
      text: t.text,
      category: t.category,
      tags: t.tags,
      lane: t.lane,
      status: t.status,
      attachmentNames: (t.attachments || []).map((a) => a.name),
      imageCount: t.images?.length || 0,
    })),
  };
}
