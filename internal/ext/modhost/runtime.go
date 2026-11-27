package modhost

import (
	"context"
	"errors"
	"fmt"
	"os/exec"
	"path/filepath"
	"slices"
	"strconv"
	"strings"
	"sync"
	"time"
)

// The typed causes a runtime can fail to resolve for.
var (
	ErrRuntimeMissing     = errors.New("no JavaScript runtime found: install Node.js")
	ErrRuntimeUnsupported = errors.New("the JavaScript runtime is older than the mod host needs")
)

// MinNodeMajor is the oldest Node the host script runs on: type stripping for
// .ts modules and the loader hooks the virtual module needs arrive with it.
const MinNodeMajor = 22

// versionProbeTimeout bounds the first attempt at asking the runtime for its
// version. The answer is one line, but the runtime may be cold: a Windows CI
// runner scans the node binary on its first run, and a probe that gives up
// early turns a slow machine into "no runtime at all" — the mods then stay
// unloaded and the rules they carry stop applying.
const versionProbeTimeout = 20 * time.Second

// versionProbeRetryTimeout bounds the second attempt. The binary is warm by
// then — the scan that slowed the first attempt is done — so a runtime that
// answers at all answers inside this.
const versionProbeRetryTimeout = 10 * time.Second

// Runtime is the JavaScript runtime a mod runs on.
type Runtime struct {
	// Kind is "electron" (Studio's own binary in Node mode) or "node".
	Kind    string
	Path    string
	Version string
	// Env is what the runtime needs added to its environment to behave as Node.
	Env map[string]string
}

// Resolver finds a runtime. The zero value looks for node on PATH; Studio sets
// Electron to the binary it launched this host from.
type Resolver struct {
	// Electron is the path of the Electron binary that started the host, or "".
	Electron string
	// Workspace is the open project: a node found inside it is never used.
	Workspace string
	// Env is the process environment as the host read it; nil lets a child inherit.
	Env []string
	// LookPath and Probe replace exec.LookPath and the version probe in tests.
	LookPath func(string) (string, error)
	Probe    func(ctx context.Context, path string, env []string) (string, error)
}

type cachedRuntime struct {
	at  time.Time
	rt  Runtime
	err error
}

var (
	runtimeMu    sync.Mutex
	runtimeCache = map[string]cachedRuntime{}
)

// runtimeTTL is how long a resolved runtime is trusted without asking the
// binary for its version again: a build loads packages several times.
const runtimeTTL = time.Minute

// Resolve returns the runtime to use, preferring the embedder's own Electron.
// A resolver with no test seams remembers its answer for a minute.
func (r Resolver) Resolve(ctx context.Context) (Runtime, error) {
	if r.LookPath != nil || r.Probe != nil {
		return r.resolve(ctx)
	}
	key := r.Electron + "\x00" + r.Workspace
	runtimeMu.Lock()
	if c, ok := runtimeCache[key]; ok && time.Since(c.at) < runtimeTTL {
		runtimeMu.Unlock()
		return c.rt, c.err
	}
	runtimeMu.Unlock()
	rt, err := r.resolve(ctx)
	runtimeMu.Lock()
	runtimeCache[key] = cachedRuntime{at: time.Now(), rt: rt, err: err}
	runtimeMu.Unlock()
	return rt, err
}

func (r Resolver) resolve(ctx context.Context) (Runtime, error) {
	probe := r.Probe
	if probe == nil {
		probe = probeVersion
	}
	if r.Electron != "" {
		env := map[string]string{"ELECTRON_RUN_AS_NODE": "1"}
		version, err := probe(ctx, r.Electron, envList(r.Env, env))
		if err != nil {
			return Runtime{}, fmt.Errorf("%w: %w", ErrRuntimeMissing, err)
		}
		return checkVersion(Runtime{Kind: "electron", Path: r.Electron, Version: version, Env: env})
	}
	look := r.LookPath
	if look == nil {
		look = exec.LookPath
	}
	path, err := look("node")
	if err != nil {
		return Runtime{}, fmt.Errorf("%w: %w", ErrRuntimeMissing, err)
	}
	if !filepath.IsAbs(path) {
		return Runtime{}, fmt.Errorf("%w: %q is not an absolute path", ErrRuntimeMissing, path)
	}
	if inside(r.Workspace, path) {
		return Runtime{}, fmt.Errorf("%w: the node on PATH sits inside the open project (%s) and is not used", ErrRuntimeMissing, path)
	}
	version, err := probe(ctx, path, r.Env)
	if err != nil {
		return Runtime{}, fmt.Errorf("%w: %w", ErrRuntimeMissing, err)
	}
	return checkVersion(Runtime{Kind: "node", Path: path, Version: version})
}

func checkVersion(rt Runtime) (Runtime, error) {
	major, ok := majorOf(rt.Version)
	if !ok || major < MinNodeMajor {
		return rt, fmt.Errorf("%w: have %s (%s), need Node %d or newer", ErrRuntimeUnsupported, rt.Version, rt.Kind, MinNodeMajor)
	}
	return rt, nil
}

func majorOf(version string) (int, bool) {
	v := strings.TrimPrefix(strings.TrimSpace(version), "v")
	head, _, _ := strings.Cut(v, ".")
	n, err := strconv.Atoi(head)
	return n, err == nil
}

// inside reports whether path is root or below it; both are compared after
// resolving symlinks, so a link into the project does not hide it.
func inside(root, path string) bool {
	if strings.TrimSpace(root) == "" {
		return false
	}
	r, p := resolved(root), resolved(path)
	rel, err := filepath.Rel(r, p)
	return err == nil && rel != ".." && !strings.HasPrefix(rel, ".."+string(filepath.Separator))
}

func resolved(p string) string {
	if abs, err := filepath.Abs(p); err == nil {
		p = abs
	}
	if real, err := filepath.EvalSymlinks(p); err == nil {
		return real
	}
	// A path that does not exist yet still has a parent that may be a link.
	dir, base := filepath.Split(filepath.Clean(p))
	for dir != "" && dir != string(filepath.Separator) {
		if real, err := filepath.EvalSymlinks(dir); err == nil {
			return filepath.Join(real, base)
		}
		parent, name := filepath.Split(filepath.Clean(dir))
		if parent == dir {
			break
		}
		base, dir = filepath.Join(name, base), parent
	}
	return p
}

func envList(base []string, extra map[string]string) []string {
	out := slices.Clone(base)
	for k, v := range extra {
		out = append(out, k+"="+v)
	}
	return out
}

// probeVersion asks the runtime for its Node version, without a shell and under
// a short limit. A runtime that is cold — the node binary on a Windows CI
// runner is read from disk and scanned on its first run — can miss the first
// limit even though it is there and well, so the question is asked twice: the
// binary is warm the second time it runs.
func probeVersion(ctx context.Context, path string, env []string) (string, error) {
	return probeWithRetry(ctx, func(ctx context.Context, budget time.Duration) (string, error) {
		return probeVersionOnce(ctx, path, env, budget)
	})
}

// probeWithRetry asks the runtime once and asks again when the attempt ran out
// of time. A runtime that answered — or that failed for any other reason — is
// asked once: it is either there or broken, and asking a broken runtime again
// only makes the wait longer.
func probeWithRetry(ctx context.Context, ask func(context.Context, time.Duration) (string, error)) (string, error) {
	version, err := ask(ctx, versionProbeTimeout)
	if err == nil || !errors.Is(err, context.DeadlineExceeded) {
		return version, err
	}
	return ask(ctx, versionProbeRetryTimeout)
}

// probeVersionOnce asks the runtime once, under a limit of its own. A limit
// that ran out is reported as context.DeadlineExceeded, so the caller can tell
// a runtime that was slow from one that answered and was refused.
func probeVersionOnce(ctx context.Context, path string, env []string, budget time.Duration) (string, error) {
	ctx, cancel := context.WithTimeout(ctx, budget)
	defer cancel()
	cmd := exec.CommandContext(ctx, path, "-p", "process.versions.node")
	cmd.Env = env
	out, err := cmd.Output()
	if err != nil {
		if errors.Is(ctx.Err(), context.DeadlineExceeded) {
			return "", fmt.Errorf("asking %s for its version: %w", path, context.DeadlineExceeded)
		}
		return "", fmt.Errorf("asking %s for its version: %w", path, err)
	}
	return strings.TrimSpace(string(out)), nil
}
