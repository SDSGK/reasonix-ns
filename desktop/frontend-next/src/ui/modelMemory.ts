// The model the last conversation in this browser ended on.
//
// It lives here rather than in the kernel's config because it answers a
// different question: default_model says what a session starts on when nobody
// says otherwise, and this says what this person last chose. A new window
// reads it and starts there instead of asking again.
//
// localStorage is where the other per-machine readings live (rx-provider-order,
// rx-model-filter, rx-composer-hint), and a private window that refuses it
// simply starts on its own — the same answer it gives for every other
// preference.

const LAST_MODEL_KEY = "rx-last-model";

/** The key this reading is stored under. */
export const MODEL_MEMORY_KEY = LAST_MODEL_KEY;

/** The model to carry into a new window, or null when there is none. */
export function readRememberedModel(): string | null {
  try {
    const ref = (localStorage.getItem(LAST_MODEL_KEY) ?? "").trim();
    return ref ? ref : null;
  } catch {
    // Storage is off or full: the window keeps the model it was given.
    return null;
  }
}

/** Remembers the model a conversation was left on. */
export function rememberModel(ref: string): void {
  const value = ref.trim();
  if (!value) return;
  try {
    localStorage.setItem(LAST_MODEL_KEY, value);
  } catch {
    // A private window keeps the model for this session only.
  }
}
