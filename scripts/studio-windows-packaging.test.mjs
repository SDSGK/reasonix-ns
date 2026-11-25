// The Windows release builds the installer and the portable archive at the
// same time: two electron-builder processes, each of them unpacking 7-Zip
// and the NSIS resources into electron-builder's tool cache. Sharing one
// cache directory between them is what broke the build — the process that
// got there first unpacked the tools out from under the other one, which
// then failed on a path that was no longer there. Each process needs a
// cache of its own, and the shape of the workflow is what keeps that true.

import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const workflowDir = path.join(root, ".github", "workflows");

// The run: | blocks of a workflow.
function runBlocks(text) {
  const lines = text.split("\n");
  const blocks = [];
  for (let i = 0; i < lines.length; i++) {
    if (!/^\s*run:\s*\|\s*$/.test(lines[i])) continue;
    const indent = lines[i].length - lines[i].trimStart().length;
    const body = [];
    for (let j = i + 1; j < lines.length; j++) {
      const line = lines[j];
      if (line.trim() === "") {
        body.push(line);
        continue;
      }
      if (line.length - line.trimStart().length <= indent) break;
      body.push(line);
    }
    blocks.push(body.join("\n"));
  }
  return blocks;
}

// The shell commands of one block, one per command: the lines a command
// continues over are joined into it, so an environment assignment that
// prefixes a command belongs to that command.
function blockCommands(block) {
  const out = [];
  let current = "";
  for (const line of block.split("\n")) {
    current = current ? `${current} ${line.trim()}` : line.trim();
    if (/\\\s*$/.test(current)) {
      current = current.replace(/\\\s*$/, " ");
      continue;
    }
    if (current.trim()) out.push(current.trim());
    current = "";
  }
  if (current.trim()) out.push(current.trim());
  return out;
}

const isPackager = (command) => /pnpm exec electron-builder/.test(command);
const runsInBackground = (command) => /&\s*$/.test(command);
const cacheOf = (command) => {
  const found = /ELECTRON_BUILDER_CACHE="([^"]+)"/.exec(command);
  return found ? found[1] : null;
};

// The packagers of a block that run at the same time: a block that puts one
// of them in the background has the rest of them running beside it.
function concurrentPackagers(block) {
  const packagers = blockCommands(block).filter(isPackager);
  if (!packagers.some(runsInBackground)) return [];
  return packagers;
}

function workflowFiles() {
  return readdirSync(workflowDir)
    .filter((name) => name.endsWith(".yml"))
    .map((name) => ({ name, text: readFileSync(path.join(workflowDir, name), "utf8") }));
}

test("packagers that run at the same time get a tool cache each", () => {
  for (const { name, text } of workflowFiles()) {
    for (const block of runBlocks(text)) {
      const packagers = concurrentPackagers(block);
      if (packagers.length === 0) continue;
      const caches = packagers.map(cacheOf);
      for (const cache of caches) {
        assert.ok(cache, `${name}: a packager running beside another one needs its own tool cache`);
      }
      assert.equal(
        new Set(caches).size,
        caches.length,
        `${name}: two packagers over one cache directory unpack the tools out from under each other`,
      );
    }
  }
});

test("the Windows release packs the zip and the installer from one cache each", () => {
  const text = readFileSync(path.join(workflowDir, "release-studio.yml"), "utf8");
  const packing = runBlocks(text).filter((block) => concurrentPackagers(block).length > 0);
  assert.equal(packing.length, 2, "the build job and the packaging job each pack Windows");
  for (const block of packing) {
    const packagers = concurrentPackagers(block);
    assert.equal(packagers.length, 2);
    assert.notEqual(cacheOf(packagers[0]), cacheOf(packagers[1]));
  }
});

test("a tool cache override is rooted at an absolute path", () => {
  // electron-builder takes the override only when it parses as an absolute
  // path, and the runner's temporary directory is one in the runner's own
  // spelling — a shell cannot read it as such, so node resolves it.
  for (const { name, text } of workflowFiles()) {
    for (const block of runBlocks(text)) {
      if (!/ELECTRON_BUILDER_CACHE=/.test(block)) continue;
      assert.match(block, /RUNNER_TEMP/, `${name}: the tool cache must be rooted at an absolute path`);
      assert.match(
        block,
        /require\(["']path["']\)\.resolve\(/,
        `${name}: the runner's temporary directory has to be resolved into an absolute path`,
      );
    }
  }
});
