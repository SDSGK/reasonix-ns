import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

const script = fileURLToPath(new URL("install-studio-macos.sh", import.meta.url));

function bundle(dir) {
  const app = path.join(dir, "Reasonix Studio.app");
  const contents = path.join(app, "Contents");
  fs.mkdirSync(path.join(contents, "MacOS"), { recursive: true });
  fs.writeFileSync(
    path.join(contents, "Info.plist"),
    '<?xml version="1.0" encoding="UTF-8"?><plist version="1.0"><dict><key>CFBundleExecutable</key><string>Reasonix Studio</string><key>CFBundleIdentifier</key><string>io.reasonix.studio</string><key>CFBundlePackageType</key><string>APPL</string></dict></plist>',
  );
  fs.copyFileSync("/usr/bin/true", path.join(contents, "MacOS", "Reasonix Studio"));
  fs.chmodSync(path.join(contents, "MacOS", "Reasonix Studio"), 0o755);
  spawnSync("codesign", ["--remove-signature", path.join(contents, "MacOS", "Reasonix Studio")]);
  return app;
}

function install(t, source, installDir) {
  const run = spawnSync("bash", [script, source], {
    encoding: "utf8",
    env: { ...process.env, REASONIX_STUDIO_INSTALL_DIR: installDir },
  });
  return run;
}

test("a dmg installs a bundle the machine can open", { skip: process.platform !== "darwin" }, (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "studio-install-"));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));

  const dmg = path.join(dir, "studio.dmg");
  const made = spawnSync("hdiutil", ["create", "-srcfolder", bundle(dir), "-volname", "Studio", "-quiet", dmg], { encoding: "utf8" });
  assert.equal(made.status, 0, made.stderr);

  const installDir = path.join(dir, "Applications");
  fs.mkdirSync(installDir);
  const run = install(t, dmg, installDir);
  assert.equal(run.status, 0, run.stderr);

  const installed = path.join(installDir, "Reasonix Studio.app");
  const verify = spawnSync("codesign", ["--verify", "--deep", "--strict", installed], { encoding: "utf8" });
  assert.equal(verify.status, 0, verify.stderr);
  const quarantine = spawnSync("xattr", ["-p", "com.apple.quarantine", installed], { encoding: "utf8" });
  assert.notEqual(quarantine.status, 0);
});

test("a bundle installs without a dmg around it", { skip: process.platform !== "darwin" }, (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "studio-install-"));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));

  const installDir = path.join(dir, "Applications");
  fs.mkdirSync(installDir);
  const run = install(t, bundle(dir), installDir);
  assert.equal(run.status, 0, run.stderr);
  assert.ok(fs.existsSync(path.join(installDir, "Reasonix Studio.app")));
});
