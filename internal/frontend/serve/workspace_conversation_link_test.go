package serve

import (
	"net/http"
	"os"
	"path/filepath"
	"runtime"
	"testing"

	"reasonix/internal/base/testenv"
)

// A reply's link names a file by its name inside the folder the link was
// resolved against. A name resolved against another folder names the same
// file only when that folder travels with it; without it the kernel looks in
// the workspace, finds nothing, and answers "not there" — the state the
// workbench shows as "the file is gone".
func TestWorkspaceFileReadsANameAgainstTheRootItTravelsWith(t *testing.T) {
	srv, _, library, _ := grantedFileServer(t)

	status, file, why := readFile(t, srv, "notes/plan.md", library)
	if status != http.StatusOK || file.Content != "# plan in the library\n" {
		t.Fatalf("a name with its folder: status %d, file %+v, reason %+v", status, file, why)
	}

	// The same name without the folder is a name in the workspace: it is not
	// there, and saying so is honest.
	status, _, why = readFile(t, srv, "notes/plan.md", "")
	if status != http.StatusNotFound || why.Code != "workspace.file_missing" {
		t.Fatalf("the same name without its folder: status %d, reason %+v", status, why)
	}
}

// The workspace's own file answers under its own name, and the root that says
// so may be spelled the way the machine writes it.
func TestWorkspaceFileAcceptsTheWorkspaceRootSpelledAnotherWay(t *testing.T) {
	srv, work, _, _ := grantedFileServer(t)

	status, file, why := readFile(t, srv, "own.md", work)
	if status != http.StatusOK || file.Content != "# own\n" || file.ReadOnly {
		t.Fatalf("the workspace's own file: status %d, file %+v, reason %+v", status, file, why)
	}

	// A trailing separator names the same folder.
	status, file, _ = readFile(t, srv, "own.md", work+string(filepath.Separator))
	if status != http.StatusOK || file.Content != "# own\n" {
		t.Fatalf("the workspace root with a trailing separator: status %d, file %+v", status, file)
	}

	if runtime.GOOS == "windows" {
		t.Skip("creating a symlink needs a privilege on Windows")
	}
	// A symlinked spelling of the workspace names the same folder, so a read
	// that names it must not be refused for the way it was written.
	linked := filepath.Join(testenv.TempDir(t), "workspace")
	if err := os.Symlink(work, linked); err != nil {
		t.Fatal(err)
	}
	status, file, why = readFile(t, srv, "own.md", linked)
	if status != http.StatusOK || file.Content != "# own\n" {
		t.Fatalf("the workspace root through a symlink: status %d, file %+v, reason %+v", status, file, why)
	}
}

// Naming a folder the workspace was not granted is still refused, and the
// refusal says the folder is unknown rather than the file is gone.
func TestWorkspaceFileStillRefusesAFolderNobodyGranted(t *testing.T) {
	srv, _, _, other := grantedFileServer(t)
	status, _, why := readFile(t, srv, "secret.md", other)
	if status != http.StatusForbidden || why.Code != "workspace.root_not_granted" {
		t.Fatalf("status %d, reason %+v", status, why)
	}
}
