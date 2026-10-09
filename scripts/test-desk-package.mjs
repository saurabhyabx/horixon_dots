import assert from "node:assert/strict";
import {
  packageFiles,
  exportZip,
  importZip,
  importFiles,
  writeFolder,
  readFolder,
  deskContext,
} from "../src/lib/desk-package.ts";
import { strFromU8, strToU8, zipSync } from "fflate";

const desk = {
  id: "stable-desk",
  title: "Research",
  slug: "research",
  projectId: null,
  intent: "Understand",
  desiredOutcome: "Decide",
  emoji: "R",
  group: "Research",
  isPinned: false,
  createdAt: 1,
  updatedAt: 2,
  customStatuses: [{ key: "review", label: "Review", icon: "R" }],
  customLanes: [{ key: "evidence", label: "Evidence", mark: "E", hint: "Sources" }],
  thoughts: [
    {
      id: "thought-1",
      text: "Evidence",
      category: "Learning",
      lane: "evidence",
      status: "review",
      tags: ["#test"],
      createdAt: 1,
      images: ["data:image/png;base64,aGVsbG8="],
      attachments: [
        { name: "notes.txt", data: "data:text/plain;base64,d29ybGQ=" },
        { name: "notes.txt", data: "data:text/plain;base64,YWdhaW4=" },
      ],
    },
  ],
};
const original = JSON.stringify(desk);
const files = packageFiles(desk);
const manifest = JSON.parse(strFromU8(files["desk.json"]));
assert.equal(manifest.id, desk.id);
assert.equal(manifest.intent, desk.intent);
assert(!strFromU8(files["desk.json"]).includes("base64"));
assert.equal(Object.keys(files).length, 4);
assert.equal(new Set(manifest.thoughts[0].attachments.map((a) => a.path)).size, 3);
const imported = importZip(await exportZip(desk));
assert.notEqual(imported.id, desk.id);
assert.notEqual(imported.thoughts[0].id, desk.thoughts[0].id);
assert.deepEqual(imported.thoughts[0].images, desk.thoughts[0].images);
assert.deepEqual(imported.thoughts[0].attachments, desk.thoughts[0].attachments);
assert.deepEqual(imported.customLanes, desk.customLanes);
assert.equal(imported.desiredOutcome, desk.desiredOutcome);
assert.equal(JSON.stringify(desk), original);
const missing = { ...files };
delete missing[manifest.thoughts[0].attachments[0].path];
assert.throws(() => importFiles(missing), /Missing/);
const unsafe = structuredClone(manifest);
unsafe.thoughts[0].attachments[0].path = "../outside";
assert.throws(
  () => importFiles({ ...files, "desk.json": strToU8(JSON.stringify(unsafe)) }),
  /unsafe/,
);
assert.throws(() => importZip(zipSync({ "../escape": strToU8("bad"), ...files })), /unsafe/);
assert.throws(
  () =>
    packageFiles({ ...desk, thoughts: [{ ...desk.thoughts[0], images: ["assets/missing.png"] }] }),
  /missing its local copy/,
);

function directory() {
  const entries = new Map();
  return {
    entries,
    async getDirectoryHandle(name) {
      if (!entries.has(name)) entries.set(name, directory());
      return entries.get(name);
    },
    async getFileHandle(name) {
      if (!entries.has(name))
        entries.set(name, {
          bytes: new Uint8Array(),
          async getFile() {
            return new Blob([this.bytes]);
          },
          async createWritable() {
            const entry = this;
            let pending;
            return {
              async write(data) {
                pending = typeof data === "string" ? strToU8(data) : data;
              },
              async close() {
                entry.bytes = pending;
              },
            };
          },
        });
      return entries.get(name);
    },
  };
}
const folder = directory();
await writeFolder(folder, desk);
const restored = await readFolder(folder);
assert.equal(restored.id, desk.id);
assert.deepEqual(restored.thoughts, desk.thoughts);
assert.equal(folder.entries.size, 2);
const initial = await (await (await folder.getFileHandle("desk.json")).getFile()).text();
const broken = {
  ...folder,
  async getDirectoryHandle() {
    throw new Error("permission denied");
  },
};
await assert.rejects(() => writeFolder(broken, { ...desk, title: "changed" }), /permission denied/);
assert.equal(await (await (await folder.getFileHandle("desk.json")).getFile()).text(), initial);
assert.equal(JSON.stringify(desk), original);
assert.equal(deskContext(desk).thoughts[0].attachmentNames.length, 2);
assert(!JSON.stringify(deskContext(desk)).includes("base64"));
console.log(
  "PASS: ZIP and folder round trips, isolated import IDs, duplicate filenames, metadata, missing assets, unsafe paths, write failure, no live mutation, AI context.",
);
