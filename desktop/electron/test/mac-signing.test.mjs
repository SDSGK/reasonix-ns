import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { test } from "node:test";

const require = createRequire(import.meta.url);
const { plan, signBundle } = require("../packaging/mac-signing.js");

test("a certificate-signed bundle is left as it is", () => {
  assert.equal(plan({ team: "ABCDE12345", runtime: true, verifies: true }).action, "keep");
});

test("a certificate signature codesign refuses is a failure to report", () => {
  assert.equal(plan({ team: "ABCDE12345", runtime: true, verifies: false }).action, "fail");
});

test("an ad-hoc bundle carrying the runtime flag signs bare again", () => {
  assert.equal(plan({ team: "not set", runtime: true, verifies: true }).action, "adhoc");
});

test("an ad-hoc bundle without the runtime flag is left as it is", () => {
  assert.equal(plan({ team: "not set", runtime: false, verifies: true }).action, "keep");
});

test("an unsigned bundle is signed ad-hoc", () => {
  assert.equal(plan({ team: "not set", runtime: false, verifies: false }).action, "adhoc");
});

test("an ad-hoc bundle carries neither the runtime flag nor entitlements", { skip: process.platform !== "darwin" }, (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "studio-mac-signing-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));

  const app = path.join(root, "Probe.app");
  const contents = path.join(app, "Contents");
  const executable = path.join(contents, "MacOS", "Probe");
  fs.mkdirSync(path.dirname(executable), { recursive: true });
  fs.writeFileSync(
    path.join(contents, "Info.plist"),
    '<?xml version="1.0" encoding="UTF-8"?><plist version="1.0"><dict><key>CFBundleExecutable</key><string>Probe</string><key>CFBundleIdentifier</key><string>io.reasonix.probe</string><key>CFBundlePackageType</key><string>APPL</string></dict></plist>',
  );
  fs.copyFileSync("/usr/bin/true", executable);
  fs.chmodSync(executable, 0o755);
  spawnSync("codesign", ["--remove-signature", executable]);

  signBundle(app);

  const info = spawnCodesign(["-dvvv", app]);
  assert.match(info, /Signature=adhoc/);
  assert.doesNotMatch(info, /flags=.*runtime/);
  assert.match(info, /TeamIdentifier=not set/);
});

function spawnCodesign(args) {
  const done = spawnSync("codesign", args, { encoding: "utf8" });
  return `${done.stdout || ""}${done.stderr || ""}`;
}
