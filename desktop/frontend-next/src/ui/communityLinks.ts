const REPO = "https://github.com/SDSGK/reasonix-ns";

export const COMMUNITY = {
  issues: `${REPO}/issues`,
  contributors: `${REPO}/graphs/contributors`,
} as const;

// GitHub's own rule: alphanumerics and single hyphens, no hyphen at either end, 39 at most.
const LOGIN = /^[A-Za-z0-9](?:[A-Za-z0-9]|-(?=[A-Za-z0-9])){0,38}$/;

export function profileUrl(login: string): string | null {
  return LOGIN.test(login) ? `https://github.com/${login}` : null;
}
