package builtin

import (
	"context"
	"fmt"
	"io"
	"os/exec"
	"time"

	"reasonix/internal/contract/tool"
	"reasonix/internal/safety/sandbox"
	"reasonix/internal/state/sessiontemp"
	"reasonix/internal/tools/jobs"
)

// bashLaunch is what a run needs from the caller: the command as the
// sandbox prepared it, the environment it runs in, and the notes a
// foreground result must carry.
type bashLaunch struct {
	params   bashParams
	shell    sandbox.Shell
	argv     []string
	wrapped  bool
	cmdEnv   []string
	probe    pipeStatusProbe
	prepared sandbox.Prepared
	nul      nulWatch
}

// runBackground starts the command as a session job and hands back its id.
// The lease moves into the job, which releases it when the command ends;
// the reported flag says so, and the caller must not release it.
func (b bash) runBackground(ctx context.Context, l bashLaunch, lease *sessiontemp.Lease, ex *tool.ShellExecution, start time.Time) (tool.DetailedResult, bool, error) {
	jm, ok := jobs.FromContext(ctx)
	if !ok {
		ex.State = tool.ShellStateNotRun
		ex.FailurePhase = tool.ShellPhaseDependency
		ex.MutationRisk = tool.ShellMutationNotStarted
		ex.DurationMs = time.Since(start).Milliseconds()
		return tool.DetailedResult{Execution: ex}, false, fmt.Errorf("background execution is not available in this context")
	}
	workDir := b.workDir
	jobLease := lease
	job := jm.StartForSession(jobs.SessionFromContext(ctx), "bash", commandPreview(l.params.Command), func(jobCtx context.Context, out io.Writer) (string, error) {
		if jobLease != nil {
			defer jobLease.Release()
		}
		cmd := exec.CommandContext(jobCtx, l.argv[0], l.argv[1:]...)
		cmd.Dir = workDir
		cmd.Env = l.cmdEnv
		cmd.WaitDelay = bashWaitDelay
		cmd.Stdout = out
		cmd.Stderr = out
		tracked, runErr := runShellProcess(jobCtx, cmd, l.shell, l.params.Command, shouldTrackShellProcess(l.wrapped, l.shell, l.params.Command, l.params.PreserveBackgroundProcesses))
		if shouldReapAfterRun(jobCtx, l.shell, l.params.Command, l.params.PreserveBackgroundProcesses) {
			reapShellProcess(cmd, tracked) // reap process-group stragglers the job left running (#3702)
		}
		b.writeEgressNote(out, l.prepared.EgressToken)
		return "", jobExit(normalizeBashRunError(jobCtx, runErr, l.params.PreserveBackgroundProcesses))
	}, jobs.WithPresentation(l.params.Description, l.params.Command))
	msg := fmt.Sprintf("Started background job %q. It keeps running across turns; read new output with bash_output(job_id=%q), wait for it with wait, or stop it with kill_shell(job_id=%q).", job.ID, job.ID, job.ID)
	msg += resumeNote(ctx, jm)
	// Background start is not a completed execution: completion is reported
	// later by bash_output/wait. Do not masquerade as success with exit 0.
	ex.State, ex.JobID = tool.ShellStateBackgroundStarted, job.ID
	ex.MutationRisk = tool.ShellMutationUnknown
	ex.DurationMs = time.Since(start).Milliseconds()
	return tool.DetailedResult{
		Output:    appendSessionDataHint(msg, b.guard.CommandHint(b.workDir, l.params.Command)),
		Execution: ex,
	}, true, nil
}

// runJobForeground runs the command under the job manager and waits for it
// to settle. The lease moves into the job, which releases it when the
// command ends; the reported flag says so.
func (b bash) runJobForeground(ctx context.Context, jm *jobs.Manager, l bashLaunch, lease *sessiontemp.Lease, ex *tool.ShellExecution, start time.Time) (tool.DetailedResult, bool, error) {
	const syncWindow = 5 * time.Second
	jobLease := lease
	var runOut string
	var runEx *tool.ShellExecution
	var runErr error
	job := jm.StartForSession(jobs.SessionFromContext(ctx), "bash", commandPreview(l.params.Command), func(jobCtx context.Context, out io.Writer) (string, error) {
		if jobLease != nil {
			defer jobLease.Release()
		}
		var childEx *tool.ShellExecution
		runOut, childEx, runErr = b.runForegroundDetailed(jobCtx, l.params, l.shell, l.argv, l.wrapped, l.cmdEnv, l.probe)
		if childEx != nil {
			runEx = childEx
		}
		// The notes belong to the command's result, not to the path that
		// ran it: a command under the job manager is told what a direct
		// run tells it.
		runOut = b.foregroundNotes(runOut, l.wrapped, l.prepared.EgressToken, l.params.Command, l.nul)
		fmt.Fprint(out, runOut)
		return "", runErr
	}, jobs.WithPresentation(l.params.Description, l.params.Command))
	select {
	case <-job.Done():
		// Settled inside the window: return exactly like a direct
		// foreground run — the model cannot tell the difference.
		mergeRunInto(ex, runEx)
		ex.DurationMs = time.Since(start).Milliseconds()
		return tool.DetailedResult{Output: runOut, Execution: ex}, true, runErr
	case <-time.After(syncWindow):
		// Still running past the window: hand back the job id, keep the
		// command alive, and let its completion arrive on its own.
		ex.DurationMs = time.Since(start).Milliseconds()
		ex.State, ex.JobID = tool.ShellStateBackgroundStarted, job.ID
		msg := fmt.Sprintf("Started background job %q (auto-promoted to the background after %s). It keeps running; read new output with bash_output(job_id=%q), wait for it with wait, or stop it with kill_shell(job_id=%q). Its completion is reported on its own.", job.ID, syncWindow, job.ID, job.ID)
		msg += resumeNote(ctx, jm)
		return tool.DetailedResult{Output: appendSessionDataHint(msg, b.guard.CommandHint(b.workDir, l.params.Command)), Execution: ex}, true, nil
	}
}
