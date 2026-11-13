package config

import (
	"slices"
	"strings"
	"testing"
)

func TestToolsPresetExpandsMinimalWhenEnabledEmpty(t *testing.T) {
	c := decodedTools(t, "[tools]\npreset = \"minimal\"\n")
	if c.Tools.Preset != "minimal" {
		t.Fatalf("Preset = %q, want minimal", c.Tools.Preset)
	}
	c.Tools.expandPreset(func(string) {})
	for _, name := range []string{"read_file", "edit_file", "multi_edit", "write_file", "bash", "bash_output", "use_capability", "ask", "await_user"} {
		if !slices.Contains(c.Tools.Enabled, name) {
			t.Errorf("minimal preset lost %q", name)
		}
	}
	for _, name := range []string{"browser_open", "computer_act", "web_fetch", "web_search", "render_chart", "send_peer_message", "setting", "present_files"} {
		if slices.Contains(c.Tools.Enabled, name) {
			t.Errorf("minimal preset must not include %q", name)
		}
	}
}

func TestToolsExplicitEnabledWinsOverPreset(t *testing.T) {
	c := decodedTools(t, "[tools]\npreset = \"minimal\"\nenabled = [\"bash\"]\n")
	c.Tools.expandPreset(func(string) {})
	if c.Tools.Preset != "" {
		t.Errorf("Preset = %q, want \"\" (an explicit enabled list wins)", c.Tools.Preset)
	}
	if !slices.Equal(c.Tools.Enabled, []string{"bash"}) {
		t.Errorf("Enabled = %v, want [bash]", c.Tools.Enabled)
	}
}

func TestToolsUnknownPresetWarnsAndKeepsAll(t *testing.T) {
	c := decodedTools(t, "[tools]\npreset = \"tiny\"\n")
	var warned string
	c.Tools.expandPreset(func(msg string) { warned = msg })
	if c.Tools.Preset != "" {
		t.Errorf("Preset = %q, want \"\" after an unknown preset", c.Tools.Preset)
	}
	if len(c.Tools.Enabled) != 0 {
		t.Errorf("Enabled = %v, want empty (every built-in tool)", c.Tools.Enabled)
	}
	if warned == "" {
		t.Error("an unknown preset did not warn")
	}
}

// A save from an expanded minimal config writes the preset line, not the
// expanded list: one line in, one line out.
func TestRenderToolListsPrefersPresetLine(t *testing.T) {
	c := Default()
	c.Tools.Preset = ToolsPresetMinimal
	c.Tools.Enabled = slices.Clone(minimalToolset)
	var b strings.Builder
	renderToolLists(&b, c, true)
	out := b.String()
	if !strings.Contains(out, "preset = \"minimal\"") {
		t.Errorf("render lost the preset line: %q", out)
	}
	if strings.Contains(out, "enabled = ") {
		t.Errorf("preset render must not write the expanded enabled list: %q", out)
	}
}
