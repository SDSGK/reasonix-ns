<p align="center">
  <img src="docs/logo-ghost-wave-effect.svg" alt="Reasonix" width="360"/>
</p>

<p align="center">
  <strong>English</strong>
  &nbsp;·&nbsp;
  <a href="./README.zh-CN.md">简体中文</a>
  &nbsp;·&nbsp;
  <a href="./docs/GUIDE.md">Guide</a>
  &nbsp;·&nbsp;
  <a href="./docs/ACP.md">ACP</a>
  &nbsp;·&nbsp;
  <a href="./docs/EXTENSIONS.md">Extensions</a>
  &nbsp;·&nbsp;
  <a href="./docs/SPEC.md">Spec</a>
</p>

<p align="center">
  <a href="https://github.com/SDSGK/reasonix-ns/releases?q=studio-v&expanded=true"><img src="https://img.shields.io/github/v/release/SDSGK/reasonix-ns.svg?filter=studio-v*&include_prereleases&style=flat-square&color=8250df&labelColor=161b22&label=studio%202.x" alt="Reasonix Studio 2.x"/></a>
  <a href="https://github.com/SDSGK/reasonix-ns/actions/workflows/ci.yml"><img src="https://img.shields.io/github/actions/workflow/status/SDSGK/reasonix-ns/ci.yml?style=flat-square&label=ci&labelColor=161b22&logo=githubactions&logoColor=white" alt="CI"/></a>
  <a href="./LICENSE"><img src="https://img.shields.io/github/license/SDSGK/reasonix-ns?style=flat-square&color=8b949e&labelColor=161b22" alt="license"/></a>
</p>

> [!NOTE]
> This repository is an independent continuation of [esengine/DeepSeek-Reasonix](https://github.com/esengine/DeepSeek-Reasonix), which is no longer maintained as of 2026-11-12. Maintained by [@SDSGK](https://github.com/SDSGK): it no longer syncs with upstream — fixes, changes and releases happen here.

<br/>

<p align="center"><strong>Open source · MIT · runs on your computer, model of your choice</strong></p>
<h3 align="center">An open-source coding agent for your terminal, desktop, browser and editor.</h3>
<p align="center">It reads your project, edits files and runs commands and tests. Have it ask before each step, or work on its own within limits you set. Files its edit tools changed can be rewound. New here? Start with the Studio desktop app.</p>
<p align="center">Maintained by <strong><a href="https://github.com/SDSGK">SDSGK</a></strong>. Originally built by Huahui Yu and the community at esengine/DeepSeek-Reasonix.</p>

<br/>

## What it is

Reasonix is an open-source AI coding assistant. The program runs on your computer; the AI model is a service you configure, which receives what it reads. You describe a task in plain language; it reads code, edits files and runs commands and tests inside the project folder you choose, and shows you each step.

You pick the model: a DeepSeek preset is built in, any OpenAI-compatible service is one config entry, and you pay the model provider directly.

## What you get

- **Read, edit, run.** It reads code, edits files and runs tests and commands, all inside your project folder.
- **Permission levels.** Have it ask every time, or let everyday actions run on their own; your forbid rules always hold. To see the approach first, use plan mode: it starts work only once you approve.
- **Rewind.** A file is saved before it changes, so you can rewind by conversation turn without touching your git history. Only files its edit tools changed are covered, not what a shell command did.

## 30-second start

Download, add a model key, open a project. New here? Start with the Studio desktop app.

1. Download and install the desktop app, Reasonix Studio, from the [releases page](https://github.com/SDSGK/reasonix-ns/releases?q=studio-v&expanded=true).
2. Open it and enter your model provider and key when asked.
3. Open your project folder and write what you want, for example "add retry on failure to the http client".
4. At the level you chose, it stops and asks before anything that needs your say-so. Allow it to continue, or refuse.

Prefer a terminal? Download the `reasonix` command-line tool from the releases page, run `reasonix setup` to pick a model, then run `reasonix`. See [Install](#install) and [Quick start](#quick-start).

## Four ways to use it

- **Desktop app (Studio).** A graphical app; the best place to start.
- **Terminal.** A full-screen text interface; `reasonix run "task"` also works in scripts.
- **Browser.** `reasonix web` opens a web interface on your own machine.
- **Editor.** Install the extension in VS Code; other editors that support ACP (Agent Client Protocol, a common way for an editor to connect to an AI assistant) can connect to `reasonix acp`.

All four are the same program underneath. What follows is for advanced users and contributors.

## Use it from DeepSeek Harness

DeepSeek Harness (`dsh`) can hand a task to Reasonix as a subagent over ACP. This repository publishes a plugin index for it:

1. Run `reasonix setup` on the machine that runs `dsh`. In the DSH Web UI turn on Custom plugin markets (Plugins, More) and add this index in the Discover tab: `https://raw.githubusercontent.com/SDSGK/reasonix-ns/studio/integrations/dsh-plugin/market-index.json`
2. Install "Reasonix subagent" from it.
3. Open the plugin's page and turn its switch on. While it is off the model has no `reasonix` tool and may run `reasonix -p` in its own shell, which looks like a delegation and is not one.

Setup details, the permission policy and limits are in [Using Reasonix from DeepSeek Harness](./docs/DSH.md).

## Versions

This fork maintains the **Reasonix 2.x line (`studio` branch)**. The historical
1.x line (`main-v2`) is frozen upstream; its npm distribution channel comes
from the original project and is not rebuilt here.

| Line | Branch | Status | Get it |
| --- | --- | --- | --- |
| **Reasonix 2.x** | `studio` (this branch) | Active development | [Studio releases](https://github.com/SDSGK/reasonix-ns/releases?q=studio-v&expanded=true) |
| Reasonix 1.x (historical) | `main-v2` | Frozen upstream | `npm i -g reasonix` (original channel) |

- [2.x roadmap](./docs/ROADMAP.md): what 2.x still has to deliver, how it ships,
  and the decisions still open.
- [Moving from 1.x to 2.x](./docs/MIGRATING.md): what the two lines share, and
  how to run both on one machine without losing sessions.

## Features

Technical highlights for advanced users.

- **Config-driven.** Providers, the agent, enabled tools, and plugins are all
  declared in `reasonix.toml`. No hardcoded models.
- **Multi-model & composable.** DeepSeek ships as a preset; any
  OpenAI-compatible endpoint is a config entry, not new code. Optionally run
  two models together (executor + planner) in separate, cache-stable sessions.
- **Plugin-driven.** MCP servers contribute tools, prompts, and resources;
  Extension Protocol v1 sidecars can also intercept runtime events, contribute
  Providers and structured UI, and ship versioned plugin packages.
- **Cache-aware context maintenance.** Startup injects a small stable environment
  summary, stale tool output is snipped/pruned before summary compaction, and the
  built-in tool schema contract is documented for regression review.
- **Zero-friction distribution.** `CGO_ENABLED=0` single binary; cross-compile
  to six targets with one command. The result is a fully self-contained static
  binary — nothing to install on the target machine beyond the binary itself.

## Install

This branch is **Reasonix 2.x**. Its desktop app is Reasonix Studio; the CLI,
Studio, and editor integrations all run the same local Reasonix engine.

### Reasonix Studio (2.x)

Download the package for your platform from the latest
[Studio release](https://github.com/SDSGK/reasonix-ns/releases?q=studio-v&expanded=true)
(tagged `studio-v2.*`; candidates such as `-rc.N` are marked as
pre-releases):

| Platform | Package | Architecture |
| --- | --- | --- |
| macOS | `.dmg` or `.zip` | Apple Silicon (`arm64`) / Intel (`amd64`) |
| Windows | Installer `-installer.exe` or portable `.zip` | x64 |
| Linux | `.deb`, `.rpm`, or `.AppImage` (download only) | x64 (`amd64`) / ARM64 (`arm64`, aarch64) |

Every package ships with a `.minisig` signature, and the release carries
`SHA256SUMS`. Once installed, Studio updates itself in place.

The same release also carries the 2.x `reasonix` CLI as archives for
`darwin|linux|windows × amd64|arm64`.

### VS Code extension

The extension does not bundle the CLI; it starts your local `reasonix acp`
backend and adds native chat, editor context, tool-call approvals, model
selection, and workspace sessions.

- **VS Code:** [install from Visual Studio Marketplace](https://marketplace.visualstudio.com/items?itemName=SivanLiu.reasonix-agent)
- **VSCodium / Eclipse Theia:** [install from Open VSX Registry](https://open-vsx.org/extension/SivanLiu/reasonix-agent)
- **Extension ID:** `SivanLiu.reasonix-agent` · [source and usage guide](https://github.com/SivanCola/reasonix-vscode)

### Build from source

Clone the repository and build the `studio` branch (2.x):

```sh
git clone https://github.com/SDSGK/reasonix-ns.git
cd reasonix-ns
git switch studio
```

#### CLI

The CLI build requires **Go 1.25+**. The module pins a `toolchain` directive;
keep `GOTOOLCHAIN=auto` so Go downloads the pinned toolchain, or install it.

```sh
make build      # -> bin/reasonix(.exe)
make cross      # -> dist/ (darwin|linux|windows × amd64|arm64)
```

#### Studio

Studio additionally requires **Node 24+ and pnpm 10**
(`npm install -g pnpm@10`) for the frontend.

```sh
make studio
```

See the [Studio build guide](desktop/README.md#prerequisites) for platform
webview dependencies and Linux build tags.

## Quick start

### Reasonix Studio

Install and launch Studio, then connect a provider and model in the app. No CLI
setup is needed.

### CLI / TUI

```sh
reasonix setup                      # configure a provider and model
reasonix                            # start an interactive session
reasonix run "implement the TODOs in main.go"
```

In an interactive session, run `/init` when you want Reasonix to create project
instructions.

For advanced CLI usage and configuration, see the **[CLI reference](./docs/CLI.md)**,
**[Guide](./docs/GUIDE.md)**, and
**[configuration paths](./docs/CONFIG_PATHS.md)**.

## Documentation

- **Maintainers:** [Wiki](./docs/WIKI.md) — architecture map, CI & tests, config quick reference
- **Getting started:** [Guide](./docs/GUIDE.md) · [CLI reference](./docs/CLI.md) ·
  [Configuration paths](./docs/CONFIG_PATHS.md) · [ACP editor integration](./docs/ACP.md) ·
  [Use from DeepSeek Harness](./docs/DSH.md)
- **Features & troubleshooting:** [Subagent profiles](./docs/SUBAGENT_PROFILES.md) ·
  [Context Engine v2](./docs/SESSION_MEMORY_RETRIEVAL.md) ·
  [Capability diagnostics](./docs/CAPABILITY_DIAGNOSTICS.md) ·
  [Recovery and updates](./docs/RECOVERY.md) ·
  [Checkpoints & rewind](./docs/CHECKPOINTS.md)
- **Agent presets:** [Session Agent compositions](./docs/AGENT_COMPOSITIONS.md)
- **Engineering & migration:** [Spec](./docs/SPEC.md) ·
  [Task contracts & pause policy](./docs/TASK_CONTRACT.md) ·
  [Tool contract](./docs/TOOL_CONTRACT.md) · [Moving from 1.x to 2.x](./docs/MIGRATING.md) ·
  [2.x roadmap](./docs/ROADMAP.md)
- **Extension development:** [Skills](./docs/SKILLS.md) · [Extensions](./docs/EXTENSIONS.md) ·
  [Plugin packages and Manifest v1](./docs/PLUGIN_PACKAGES.md) ·
  [Extension Protocol](./docs/EXTENSION_PROTOCOL.md) ·
  [Go SDK and starter](./sdk/go/README.md)

## Acknowledgments

Reasonix was originally built by Huahui Yu and the community at
[esengine/DeepSeek-Reasonix](https://github.com/esengine/DeepSeek-Reasonix).
This fork continues that work. The folks whose work shaped Reasonix the most —
the top 20 contributors by commit count at the final upstream release:

<!-- reasonix-top-contributors:start -->
| Contributor | Contributor | Contributor | Contributor |
| --- | --- | --- | --- |
| [**SivanCola**](https://github.com/SivanCola) | [**KHG420**](https://github.com/KHG420) | [**ttmouse**](https://github.com/ttmouse) | [**chuiwenwei**](https://github.com/chuiwenwei) |
| [**lifu963**](https://github.com/lifu963) | [**XTLine**](https://github.com/XTLine) | [**HUQIANTAO**](https://github.com/HUQIANTAO) | [**xxoingr**](https://github.com/xxoingr) |
| [**Harbor404**](https://github.com/Harbor404) | [**GTC2080**](https://github.com/GTC2080) | [**mchenziyi**](https://github.com/mchenziyi) | [**Li-Charles-One**](https://github.com/Li-Charles-One) |
| [**light-front-theory**](https://github.com/light-front-theory) | [**imcreazy**](https://github.com/imcreazy) | [**eghrhegpe**](https://github.com/eghrhegpe) | [**noreply**](https://github.com/noreply) |
| [**par73e**](https://github.com/par73e) | [**Bernardxu123**](https://github.com/Bernardxu123) | [**lancy69**](https://github.com/lancy69) | [**Guan0923**](https://github.com/Guan0923) |
<!-- reasonix-top-contributors:end -->

Special thanks to [**Bernardxu123**](https://github.com/Bernardxu123) for designing the project logo and intro video.

<br/>

---

<p align="center">
  <sub>MIT — see <a href="./LICENSE">LICENSE</a></sub>
  <br/>
  <sub>Built by the community at <a href="https://github.com/esengine/DeepSeek-Reasonix">esengine/DeepSeek-Reasonix</a> · continued by <a href="https://github.com/SDSGK/reasonix-ns">SDSGK/reasonix-ns</a></sub>
</p>
