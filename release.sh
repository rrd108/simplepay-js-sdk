#!/bin/bash
set -euo pipefail

RED='\e[1;41m'
GREEN='\e[1;42m'
NC='\033[0m'

die() {
  echo -e "${RED} $* ${NC}" >&2
  exit 1
}

usage() {
  echo "Usage: $0 patch|minor|current"
  echo "  current  publish the version already in package.json"
  echo "  patch    bump the patch version, then publish"
  echo "  minor    bump the minor version, then publish"
}

cd "$(dirname "$0")"

release_type="${1:-}"
if [[ -z "$release_type" ]]; then
  usage
  exit 1
fi

if [[ "$release_type" != "patch" && "$release_type" != "minor" && "$release_type" != "current" ]]; then
  echo "Invalid version type: ${release_type}" >&2
  usage
  exit 1
fi

require_command() {
  local name="$1"
  if command -v "$name" >/dev/null 2>&1; then
    return 0
  fi
  die "Missing command: ${name}"
}

require_command yarn
require_command npm
require_command git
require_command node

if ! command -v gh >/dev/null 2>&1; then
  die "GitHub CLI is missing. Install it with: sudo pacman -S github-cli"
fi

if ! npm whoami >/dev/null 2>&1; then
  die "Not logged in to npm. Run: npm login --auth-type=web"
fi

if ! gh auth status >/dev/null 2>&1; then
  die "GitHub CLI is not authenticated. Run: gh auth login"
fi

if [[ -n "$(git status --porcelain)" ]]; then
  die "Repository is not clean. Commit or stash your changes before running this script."
fi

branch=$(git rev-parse --abbrev-ref HEAD)
if [[ "$branch" != "main" ]]; then
  die "Releases run from main. Current branch: ${branch}"
fi

read_package_version() {
  node --input-type=module - <<'EOF'
import { readFileSync } from 'node:fs'
const version = JSON.parse(readFileSync('package.json', 'utf8')).version
console.log(version)
EOF
}

next_version() {
  node --input-type=module - "$1" "$2" <<'EOF'
const current = process.argv[2]
const releaseType = process.argv[3]
const [major, minor, patch] = current.split('.').map((part) => Number(part))
if (releaseType === 'patch') {
  console.log(`${major}.${minor}.${patch + 1}`)
} else if (releaseType === 'minor') {
  console.log(`${major}.${minor + 1}.0`)
} else {
  throw new Error(`Unsupported release type: ${releaseType}`)
}
EOF
}

package_version=$(read_package_version)
if [[ ! "$package_version" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
  die "package.json version must be x.y.z. Found: ${package_version}"
fi

last_tag=$(git describe --tags --abbrev=0)
last_version="${last_tag#v}"

if [[ "$release_type" == "current" ]]; then
  if [[ "$package_version" == "$last_version" ]]; then
    die "${package_version} is already tagged as ${last_tag}."
  fi
  new_version="$package_version"
else
  if [[ "$package_version" != "$last_version" ]]; then
    die "package.json is ${package_version} and the latest tag is ${last_tag}. Publish it with: $0 current"
  fi
  new_version=$(next_version "$package_version" "$release_type")
fi

if [[ ! "$new_version" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
  die "Refusing to release invalid version: ${new_version}"
fi

if git rev-parse -q --verify "refs/tags/v${new_version}" >/dev/null; then
  die "Tag v${new_version} already exists."
fi

published=$(npm view "simplepay-js-sdk@${new_version}" version 2>/dev/null || true)
if [[ -n "$published" ]]; then
  die "simplepay-js-sdk@${new_version} is already published on npm."
fi

echo "Releasing ${new_version}"

echo "Running tests"
if ! yarn test; then
  die "Tests failed"
fi
echo -e "${GREEN} All tests passed ${NC}"

release_notes=$(git log "${last_tag}..HEAD" --pretty="%s" | awk '/^(feat|fix|docs|test|chore|refactor|style)/ { print "* " $0 }')

created_package_lock=0
if [[ "$release_type" != "current" ]]; then
  if [[ ! -f package-lock.json ]]; then
    created_package_lock=1
  fi
  npm version "$new_version" --no-git-tag-version >/dev/null
  if [[ "$created_package_lock" -eq 1 && -f package-lock.json ]]; then
    rm package-lock.json
  elif [[ -f package-lock.json ]]; then
    git checkout -- package-lock.json
  fi
fi

restore_version_files() {
  git checkout -- src/utils.ts package.json
  if [[ "$created_package_lock" -eq 1 ]]; then
    rm -f package-lock.json
  fi
}

echo "Updating SDK_VERSION to SimplePay_Rrd_${new_version}"
sed -i "s/SimplePay_Rrd_[0-9]\+\.[0-9]\+\.[0-9]\+/SimplePay_Rrd_${new_version}/" src/utils.ts

if ! grep -q "SimplePay_Rrd_${new_version}" src/utils.ts; then
  restore_version_files
  die "Failed to update SDK_VERSION in src/utils.ts"
fi

needs_commit=0
if ! git diff --quiet -- src/utils.ts package.json; then
  needs_commit=1
fi

echo "Building dist"
if ! yarn build; then
  restore_version_files
  die "Build failed. Version files were restored."
fi

echo "Publishing ${new_version} to npm"
if ! npm publish; then
  restore_version_files
  die "npm publish failed. Version files were restored."
fi

if [[ "$needs_commit" -eq 1 ]]; then
  git add src/utils.ts package.json
  if ! git commit -m "chore: release ${new_version}"; then
    die "Published ${new_version} to npm, but the git commit failed. Commit src/utils.ts and package.json, then tag v${new_version}."
  fi
fi

git tag "v${new_version}"

echo "Pushing v${new_version}"
if ! git push --follow-tags; then
  die "Published ${new_version} to npm and created local tag v${new_version}, but git push failed."
fi

echo "Creating GitHub release v${new_version}"
if [[ -n "$release_notes" ]]; then
  gh release create "v${new_version}" \
    --title "v${new_version}" \
    --notes "$release_notes" \
    --target main \
    --latest
else
  gh release create "v${new_version}" \
    --title "v${new_version}" \
    --generate-notes \
    --notes-start-tag "$last_tag" \
    --target main \
    --latest
fi

echo -e "${GREEN} Released v${new_version} ${NC}"
