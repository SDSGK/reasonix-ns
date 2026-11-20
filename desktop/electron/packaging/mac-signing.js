"use strict";
const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

// An ad-hoc signature cannot carry the hardened runtime flag or a restricted
// entitlement: AMFI answers -423 and the process leaves without a window. A
// bundle no certificate signed therefore signs bare, and the entitlements
// electron-builder.yml asks for belong to a signed release only.
const ADHOC = ["--force", "--deep", "--sign", "-"];

function run(args) {
  const done = spawnSync(args[0], args.slice(1), { encoding: "utf8" });
  if (done.status !== 0) {
    throw new Error(`${args.join(" ")} failed: ${(done.stderr || done.stdout || "").trim()}`);
  }
  return done;
}

// inspect reads what codesign says about a bundle: who signed it and whether
// the hardened runtime flag is on it.
function inspect(app) {
  const done = spawnSync("codesign", ["-dvvv", app], { encoding: "utf8" });
  const text = `${done.stdout || ""}${done.stderr || ""}`;
  const team = /^TeamIdentifier=(.*)$/m.exec(text);
  const flags = /^flags=(.*)$/m.exec(text);
  return {
    team: team ? team[1].trim() : "not set",
    runtime: flags ? /(^|,)runtime(,|$)/.test(flags[1]) : false,
  };
}

// verifies reports whether the bundle carries a signature the machine accepts.
function verifies(app) {
  return spawnSync("codesign", ["--verify", "--deep", "--strict", app], { encoding: "utf8" }).status === 0;
}

// plan decides what happens to a bundle. A certificate-signed one keeps its
// signature: the notarization ticket and the hardened runtime it was signed
// with are part of what that signature says. An ad-hoc one carrying the
// hardened runtime flag signs bare again, because that flag is what AMFI
// refuses. A certificate signature that does not verify is a failure to
// report, not a signature to replace.
function plan(state) {
  if (state.team !== "not set") return { action: state.verifies ? "keep" : "fail" };
  if (state.runtime) return { action: "adhoc" };
  return { action: state.verifies ? "keep" : "adhoc" };
}

// locateApp finds the bundle electron-builder signed. The directory holds one
// bundle per build; a name electron-builder chose is not a contract.
function locateApp(context) {
  const dir = context?.appOutDir ?? context?.packager?.appOutDir;
  if (!dir || !fs.existsSync(dir)) return null;
  const apps = fs.readdirSync(dir).filter((name) => name.endsWith(".app")).sort();
  return apps.length ? path.join(dir, apps[0]) : null;
}

function signBundle(app) {
  run(["codesign", ...ADHOC, app]);
  run(["xattr", "-cr", app]);
  run(["codesign", "--verify", "--deep", "--strict", app]);
}

// afterSign: the bundle carries a signature the machine can check. Without
// one the installer says the app is damaged, and no quarantine clearing
// answers that.
module.exports = async function macSigning(context) {
  if (process.platform !== "darwin") return;
  const app = locateApp(context);
  if (!app) throw new Error("mac-signing: no bundle to sign");
  const state = { ...inspect(app), verifies: verifies(app) };
  const { action } = plan(state);
  if (action === "keep") {
    console.log(`mac-signing: ${path.basename(app)} is signed`);
    return;
  }
  if (action === "fail") {
    throw new Error(`mac-signing: ${path.basename(app)} carries a signature codesign refuses`);
  }
  signBundle(app);
  console.log(`mac-signing: ${path.basename(app)} is signed ad-hoc`);
};

module.exports.inspect = inspect;
module.exports.plan = plan;
module.exports.signBundle = signBundle;
