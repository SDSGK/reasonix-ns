package boot

import "reasonix/internal/safety/sandbox"

// sandboxCanConfine reports whether this host can actually confine a command:
// Available() only asks whether the backend is installed, and on Linux that
// probe leaves the network open, while confining needs the namespace asked for.
func sandboxCanConfine() bool {
	return sandbox.AvailableFor(sandbox.Spec{Mode: "enforce"})
}
