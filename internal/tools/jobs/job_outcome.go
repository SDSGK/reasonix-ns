package jobs

// Done exposes the job's completion channel for a caller that started the job
// but chose to wait on it synchronously for a bounded window before letting it
// fall back to the background table.
func (j *Job) Done() <-chan struct{} { return j.done }

// JobOutcome is a point-in-time reading of one job, taken under its lock.
type JobOutcome struct {
	Status Status
	Result string
	Output string // everything the job has written so far (its buffered tail)
}

// Outcome reads the job's current status, model-facing result, and buffered
// output. Safe before completion — the fields read as their current values.
func (j *Job) Outcome() JobOutcome {
	j.mu.Lock()
	defer j.mu.Unlock()
	return JobOutcome{Status: j.status, Result: j.result, Output: string(j.tail)}
}
