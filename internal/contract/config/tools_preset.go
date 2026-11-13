package config

import (
	"fmt"
	"slices"
)

// ToolsPresetMinimal keeps the lean file + shell core: file read/edit/write,
// the shell and its lifecycle tools, workspace search, the capability proxy,
// context management, and the host-control surface (task list, asks, goal
// disposition). Everything else — browsers, computers, web access, media,
// LSP, peers, skills and subagent entry points — is left out and returns
// with preset = "".
const ToolsPresetMinimal = "minimal"

// minimalToolset is the whitelist expanded for Tools.Preset = "minimal".
// Names must match the boot registry exactly; the cross-check test
// (TestMinimalToolsetNamesAreRegisteredBuiltins) keeps this list aligned
// with the registered built-in surface.
var minimalToolset = []string{
	"read_file", "edit_file", "multi_edit", "write_file",
	"bash", "bash_output", "kill_shell", "wait",
	"grep", "glob", "ls",
	"use_capability",
	"context_budget", "compress", "recall",
	"todo_write", "complete_step",
	"ask", "await_user", "update_goal",
}

// MinimalToolset returns a copy of the whitelist expanded for the "minimal"
// preset, for cross-checks against the boot registry.
func MinimalToolset() []string { return slices.Clone(minimalToolset) }

// expandPreset resolves Tools.Preset into Tools.Enabled in place. A named
// whitelist applies only when no explicit enabled list is configured, so an
// explicit list always wins. Unknown presets warn and keep every tool.
func (t *ToolsConfig) expandPreset(warn func(string)) {
	if t == nil || t.Preset == "" {
		return
	}
	if t.Preset != ToolsPresetMinimal {
		warn(fmt.Sprintf("unknown tools.preset %q (known: %q); keeping every built-in tool", t.Preset, ToolsPresetMinimal))
		t.Preset = ""
		return
	}
	if len(t.Enabled) > 0 {
		// An explicit whitelist wins; drop the preset line so a later save
		// cannot shadow the list the user chose.
		t.Preset = ""
		return
	}
	t.Enabled = slices.Clone(minimalToolset)
}
