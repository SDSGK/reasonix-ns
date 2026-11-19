#!/usr/bin/env bash
# Work out the credentials a Studio release needs, and put them where the
# release workflow can read them.
#
# A secret cannot live in the repository: anyone who can read a commit can read
# it, and a fork can read the workflow that uses it. So every value is read
# here, on the machine that holds it, and handed to GitHub. Nothing is written
# to a file and nothing is passed on a command line, where it would show up in
# the process list.
#
# Two ways to install it, and the script picks:
#
#   - With the GitHub CLI installed, it installs the secrets and the variables
#     for you, and offers to create the Homebrew tap.
#   - Without it, it prints exactly what to paste into the repository's
#     settings, and where. The release itself never needs the CLI: it starts
#     from a tag you push.
#
# What is required and what is not:
#
#   - minisign: every published artifact carries a detached signature, and the
#     updater verifies it against a public key compiled into the binary. No
#     signature, no release. Required, and the only required credential.
#   - Apple: a Developer ID signed and notarized macOS bundle. Optional.
#     Without it the bundle is ad-hoc signed, the release body says so, and the
#     macOS self-update stays off.
#   - Certum: Windows Authenticode. Optional; off until STUDIO_SIGNING_ENABLED.
#   - npm, Homebrew, the release tag token: the CLI channels. Optional; off
#     until STUDIO_PUBLISHES_CLI.
#   - R2: an object-storage mirror and the delta chunks. Optional; off until
#     STUDIO_PUBLISH_MIRROR.
#
# Usage: bash scripts/setup-release-secrets.sh [--repo OWNER/NAME] [--yes]
set -euo pipefail

repo="${REPOSITORY:-}"
assume_yes=false
while [ "$#" -gt 0 ]; do
	case "$1" in
	--repo)
		repo="${2:?--repo needs OWNER/NAME}"
		shift 2
		;;
	--yes)
		assume_yes=true
		shift
		;;
	*)
		echo "unknown argument: $1" >&2
		exit 2
		;;
	esac
done

here="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
root="$(cd -- "$here/.." && pwd)"
notes="$root/.release-secrets.txt"

manual=false
if ! command -v gh >/dev/null 2>&1; then
	manual=true
	echo "The GitHub CLI is not installed, so the values will be printed for you to paste"
	echo "into the repository's settings by hand. Installing it makes this automatic:"
	echo "    brew install gh    # then rerun this script"
	echo
elif ! gh auth status >/dev/null 2>&1; then
	echo "::error::not signed in to GitHub: run 'gh auth login' first" >&2
	exit 1
fi

if [ -z "$repo" ]; then
	repo="$(git -C "$root" remote get-url origin 2>/dev/null | sed -E 's#.*github\.com[:/]+##; s#\.git$##' || true)"
fi
if [ -z "$repo" ] && [ "$manual" = false ]; then
	repo="$(gh repo view --json nameWithOwner --jq .nameWithOwner 2>/dev/null || true)"
fi
if [ -z "$repo" ]; then
	echo "::error::which repository? pass --repo OWNER/NAME" >&2
	exit 1
fi
echo "repository: $repo"

: >"$notes"

# A secret that is already set is left alone unless the answer is yes: a rerun
# must not overwrite a working key with a half-typed one.
set_secret() {
	local name="$1" prompt="$2" purpose="$3" value=""
	if [ "$manual" = false ] && [ "$assume_yes" = true ]; then
		if gh secret list --repo "$repo" --json name --jq '.[].name' 2>/dev/null | grep -Fxq "$name"; then
			echo "skip   $name (already set)"
			return 0
		fi
	fi
	read -r -s -p "$prompt: " value
	echo
	if [ -z "$value" ]; then
		echo "skip   $name"
		return 0
	fi
	if [ "$manual" = true ]; then
		{
			echo "$name"
			echo "    purpose: $purpose"
			echo "    value:   $value"
		} >>"$notes"
		echo "note   $name"
		return 0
	fi
	if gh secret list --repo "$repo" --json name --jq '.[].name' 2>/dev/null | grep -Fxq "$name"; then
		read -r -p "$name is already set. Replace it? [y/N] " answer
		case "$answer" in
		y | Y) ;;
		*)
			echo "skip   $name"
			return 0
			;;
		esac
	fi
	# The value goes in on stdin: a command line would put it in the process
	# list, where anyone on the machine can read it.
	printf '%s' "$value" | gh secret set "$name" --repo "$repo"
	echo "set    $name"
}

# minisign signs every artifact, and the updater holds the matching public key.
# A fresh key pair is the usual case: the public key goes into
# internal/platform/update/verify.go (a commit), and the private key becomes
# this repository's secret.
setup_minisign() {
	local password dir keyfile pubfile
	read -r -s -p "Password for the minisign key (MINISIGN_PASSWORD): " password
	echo
	if [ -z "$password" ]; then
		echo "skip   minisign (no password given; a release cannot be signed without it)"
		return 0
	fi
	dir="$root/.minisign"
	keyfile="$dir/reasonix.key"
	pubfile="$dir/reasonix.pub"
	if [ ! -f "$keyfile" ]; then
		echo "no key pair yet; generating one (this writes .minisign/ in the repository)"
		if ! command -v go >/dev/null 2>&1; then
			echo "::error::go is required to generate the key pair" >&2
			return 1
		fi
		# GOTOOLCHAIN=local: the toolchain line in go.mod would otherwise send
		# Go looking for that exact release, and a machine without it would try
		# to download one. The local toolchain is what the code needs.
		(cd "$root/desktop" && GOTOOLCHAIN=local MINISIGN_PASSWORD="$password" go run ./cmd/sign genkey "$dir")
	fi
	if [ ! -f "$keyfile" ] || [ ! -f "$pubfile" ]; then
		echo "::error::the key pair was not produced" >&2
		return 1
	fi
	if [ "$manual" = true ]; then
		{
			echo "MINISIGN_PASSWORD"
			echo "    purpose: the password that decrypts the minisign private key below"
			echo "    value:   $password"
			echo
			echo "MINISIGN_PRIVATE_KEY"
			echo "    purpose: the encrypted minisign private key; every artifact is signed with it"
			echo "    value:   $(cat "$keyfile")"
		} >>"$notes"
		echo "note   MINISIGN_PASSWORD, MINISIGN_PRIVATE_KEY"
	else
		printf '%s' "$password" | gh secret set MINISIGN_PASSWORD --repo "$repo"
		echo "set    MINISIGN_PASSWORD"
		gh secret set MINISIGN_PRIVATE_KEY --repo "$repo" <"$keyfile"
		echo "set    MINISIGN_PRIVATE_KEY"
	fi
	echo
	echo "The public key must match the one compiled into the updater. Compare it"
	echo "with internal/platform/update/verify.go and update that constant if it differs:"
	echo
	cat "$pubfile"
	echo
}

echo
echo "== required: the artifact signature =="
setup_minisign

echo
echo "== optional: macOS Developer ID and notarization =="
echo "A Developer ID certificate (p12, base64) plus an App Store Connect API key."
echo "Five values; all five or none. Skip with an empty answer."
set_secret APPLE_CERT_P12 "APPLE_CERT_P12" "the base64 p12 certificate; all five Apple values or none"
set_secret APPLE_CERT_PASSWORD "APPLE_CERT_PASSWORD" "the password of that certificate"
set_secret APPLE_API_KEY_P8 "APPLE_API_KEY_P8" "the .p8 App Store Connect API key"
set_secret APPLE_API_KEY_ID "APPLE_API_KEY_ID" "the API key's identifier"
set_secret APPLE_API_ISSUER_ID "APPLE_API_ISSUER_ID" "the issuer identifier"

echo
echo "== optional: Windows Authenticode through Certum SimplySign =="
set_secret CERTUM_USERNAME "CERTUM_USERNAME" "the Certum SimplySign account"
set_secret CERTUM_OTP_URI "CERTUM_OTP_URI" "the otpauth:// provisioning URI"
set_secret CERTUM_KEY_ID "CERTUM_KEY_ID" "the certificate's SHA-1 thumbprint"

echo
echo "== optional: the CLI channels =="
set_secret NPM_TOKEN "NPM_TOKEN" "an npm automation token"
set_secret HOMEBREW_TAP_TOKEN "HOMEBREW_TAP_TOKEN" "a GitHub token with repo scope, for the tap"
set_secret RELEASE_TAG_TOKEN "RELEASE_TAG_TOKEN" "a GitHub token with write:repo, for the v* tags"

echo
echo "== optional: the object-storage mirror and the delta chunks =="
set_secret R2_ACCESS_KEY_ID "R2_ACCESS_KEY_ID" "the object storage access key"
set_secret R2_SECRET_ACCESS_KEY "R2_SECRET_ACCESS_KEY" "the object storage secret"
set_secret R2_ACCOUNT_ID "R2_ACCOUNT_ID" "the object storage account"
set_secret R2_BUCKET "R2_BUCKET" "the bucket that holds the mirror and the chunks"

echo
echo "== the switches =="
set_variable() {
	local name="$1" value="$2" help="$3"
	if [ "$manual" = true ]; then
		{
			echo "$name"
			echo "    purpose: $help"
			echo "    value:   $value"
		} >>"$notes"
		echo "note   $name"
		return 0
	fi
	if [ "$assume_yes" = true ]; then
		echo "skip   $name ($value)"
		return 0
	fi
	read -r -p "$name [$value] ($help) " answer
	answer="${answer:-$value}"
	gh variable set "$name" --repo "$repo" --body "$answer"
	echo "set    $name = $answer"
}

# The defaults are the smallest release that works: macOS ad-hoc signed, no
# Windows signing, no CLI channels, no mirror, no changelog site.
set_variable STUDIO_SIGNING_ENABLED "false" "Windows Authenticode"
set_variable STUDIO_REQUIRE_APPLE_SIGNING "false" "fail the release without a Developer ID"
set_variable STUDIO_PUBLISHES_CLI "false" "npm, Homebrew and the CLI pointer"
set_variable STUDIO_PUBLISH_MIRROR "false" "object-storage mirror and delta chunks"
set_variable STUDIO_PUBLISH_WEBSITE "false" "the changelog website"

echo
echo "== the Homebrew tap =="
tap_owner="${repo%%/*}"
tap="$tap_owner/homebrew-reasonix"
if [ "$manual" = true ]; then
	echo "Create $tap by hand: https://github.com/new  (name it exactly that, public)"
	echo "Then the cask is written into it by the cli-channels job."
elif gh repo view "$tap" >/dev/null 2>&1; then
	echo "skip   $tap (already exists)"
else
	if [ "$assume_yes" = true ]; then
		echo "skip   $tap (not created)"
	else
		read -r -p "Create $tap for the Homebrew cask? [y/N] " answer
		case "$answer" in
		y | Y)
			gh repo create "$tap" --public --description "Homebrew tap for Reasonix" --disable-issues
			echo "created $tap"
			;;
		*)
			echo "skip   $tap"
			;;
		esac
	fi
fi

echo
if [ "$manual" = true ]; then
	echo "== what to paste into the repository's settings =="
	echo
	echo "Repository $repo → Settings → Secrets and variables → Actions."
	echo "Secrets tab → New repository secret, once per entry below."
	echo "Variables tab → New repository variable, once per entry below."
	echo
	cat "$notes"
	echo
	echo "The file above is .release-secrets.txt in the repository root. It holds"
	echo "private keys: delete it once the values are in, and never commit it."
else
	echo "Done. The repository now holds the credentials a release needs."
fi
echo
echo "Next:"
echo "  1. Put the public key above into internal/platform/update/verify.go and commit it."
echo "  2. Write release-notes/studio/X.Y.Z.md for the version you are about to tag."
echo "  3. Tag and push: git tag studio-vX.Y.Z && git push origin studio-vX.Y.Z"
echo "  4. Watch it at https://github.com/$repo/actions/workflows/release-studio.yml"
