package config_test

import (
	"testing"

	"reasonix/internal/contract/config"
	"reasonix/internal/contract/tool"
	// Registers the compile-time built-ins via init(): without this blank
	// import BuiltinContractEntries() sees an empty registry and the
	// cross-check below would fail on every name. This file lives in the
	// external test package because internal/tools/builtin depends on
	// internal/contract/config, which the in-package test binary cannot
	// import without an import cycle.
	_ "reasonix/internal/tools/builtin"
)

// The minimal preset whitelist must name real registered built-ins, so a
// rename on the boot surface cannot silently drop a minimal tool.
//
// ask/await_user/use_capability ride the boot surface outside
// BuiltinContractEntries (documented in docs/TOOL_CONTRACT.md), so they are
// exempt here.
func TestMinimalToolsetNamesAreRegisteredBuiltins(t *testing.T) {
	bootSurfaceOnly := map[string]bool{"ask": true, "await_user": true, "use_capability": true}
	registered := map[string]bool{}
	for _, e := range tool.BuiltinContractEntries() {
		registered[e.Name] = true
	}
	for _, name := range config.MinimalToolset() {
		if bootSurfaceOnly[name] {
			continue
		}
		if !registered[name] {
			t.Errorf("minimal toolset names %q which is not a registered built-in", name)
		}
	}
}
