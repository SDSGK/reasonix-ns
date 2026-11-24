package boot

import "reasonix/internal/safety/sandbox"

// sandboxCanConfine reports whether this host can actually confine a command
// the way the tests below ask for.
//
// sandbox.Available() only asks whether the backend is installed: on Linux it
// probes bubblewrap with the network left open, while confining a command
// needs the network namespace the sandbox asks for. A host that grants one and
// denies the other reports itself available and then hands the command back
// unwrapped — a test that runs there measures a broken sandbox, not the
// product's behaviour, so it steps aside instead of failing.
func sandboxCanConfine() bool {
	return sandbox.AvailableFor(sandbox.Spec{Mode: "enforce"})
}
