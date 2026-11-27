package modhost

import (
	"context"
	"errors"
	"strings"
	"testing"

	"reasonix/internal/base/testenv"
	"reasonix/internal/ext/pluginpkg"
)

// A mod whose JavaScript runtime cannot be found does not run, and the rules
// it carries are not in force. The host says so: a mod that silently stays
// away is a mod whose denials silently do not apply.
func TestAModWithNoRuntimeIsReportedInsteadOfSilentlyStayingAway(t *testing.T) {
	pkg := packageWith(t, `{"modules":["./register.js"]}`, map[string]string{"hooks/register.js": "export function register(){}"})
	reg := NewRegistry()
	deps := Deps{
		Settings:  Settings{Enabled: true},
		Resolver:  Resolver{LookPath: func(string) (string, error) { return "", errors.New("no node on PATH") }},
		StateRoot: testenv.TempDir(t),
		Registry:  reg,
	}
	packages, warnings := Packages(context.Background(), deps, []pluginpkg.InstalledPackage{pkg})
	if len(packages) != 0 {
		t.Fatalf("packages = %d, want none without a runtime", len(packages))
	}
	if len(warnings) != 1 || !strings.Contains(warnings[0], "demo") {
		t.Fatalf("warnings = %v, want the mod named", warnings)
	}
	status := reg.Snapshot()
	if len(status) != 1 || status[0].State != StateInactive || status[0].Code != CodeRuntimeMissing {
		t.Fatalf("status = %+v", status)
	}
}
