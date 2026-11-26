package agent

import (
	"os"
	"path/filepath"
	"runtime"
	"slices"
	"strings"

	"reasonix/internal/runtime/taskmonitor"
)

// hostStateRoot is the directory the host keeps its own runtime state in: the
// task snapshot store lives under it. The host writes there while a call
// runs, so the root's own metadata moves without the work changing. It comes
// from the store's own path, so the two cannot drift.
var hostStateRoot = filepath.Dir(taskmonitor.StoreDir)

// hostOwnedPath reports whether path lies in the task-snapshot store, the host's
// own path convention. It de-noises the receipt only: any writer can create files
// there, and a link of any kind on the way (symlink or Windows junction) or a
// ".." in the path as given means it may lead elsewhere. A missing component
// cannot be a link, so only the existing prefix is inspected.
func hostOwnedPath(root, path string) bool {
	if slices.Contains(strings.FieldsFunc(path, func(r rune) bool { return r == '/' || r == filepath.Separator }), "..") {
		return false
	}
	if !filepath.IsAbs(path) {
		path = filepath.Join(root, path)
	}
	rel, err := filepath.Rel(root, path)
	if err != nil || !underDir(rel, taskmonitor.StoreDir) {
		return false
	}
	return noLinkOnTheWay(root, rel)
}

// hostStatePath reports whether path is the host's own state: the directory the
// host keeps that state in, or anything in the task snapshot store under it.
// The host writes there while a call runs, so what the walk sees there is the
// host's bookkeeping, not the call's work.
func hostStatePath(root, path string) bool {
	if slices.Contains(strings.FieldsFunc(path, func(r rune) bool { return r == '/' || r == filepath.Separator }), "..") {
		return false
	}
	if !filepath.IsAbs(path) {
		path = filepath.Join(root, path)
	}
	rel, err := filepath.Rel(root, path)
	if err != nil || rel == ".." || strings.HasPrefix(rel, ".."+string(filepath.Separator)) {
		return false
	}
	if filepath.ToSlash(rel) == filepath.ToSlash(hostStateRoot) {
		return noLinkOnTheWay(root, rel)
	}
	return hostOwnedPath(root, path)
}

// hostOwnsState reports whether path is state the host keeps in the workspace.
// The walk reads the observed root and any granted extra root, so the answer
// is looked up under each of them.
func (a *Agent) hostOwnsState(path string) bool {
	return hostStatePath(a.writeWorkspaceRoot, path) || hostStatePath(a.observeRoot, path)
}

// noLinkOnTheWay reports whether every component of rel under root is a
// plain directory or file. A missing component cannot be a link, so the walk
// stops there and answers from what it saw.
func noLinkOnTheWay(root, rel string) bool {
	at := root
	for part := range strings.SplitSeq(rel, string(filepath.Separator)) {
		at = filepath.Join(at, part)
		info, err := os.Lstat(at)
		if err != nil {
			return os.IsNotExist(err)
		}
		if info.Mode()&(os.ModeSymlink|os.ModeIrregular) != 0 {
			return false
		}
	}
	return true
}

func underDir(rel, dir string) bool {
	rel, dir = filepath.ToSlash(rel), filepath.ToSlash(dir)
	if runtime.GOOS == "windows" {
		rel, dir = strings.ToLower(rel), strings.ToLower(dir)
	}
	return rel == dir || strings.HasPrefix(rel, dir+"/")
}
