#!/bin/bash

RED='\e[1;41m'
GREEN='\e[1;42m'
NC='\033[0m' # No Color

# Check if a version type (minor or patch) is provided as a command-line argument
if [ -z "$1" ]; then
  echo "Usage: $0 patch|minor"
  exit 1
fi

# Check if the provided version type is valid
if [ "$1" != "patch" ] && [ "$1" != "minor" ]; then
  echo "Invalid version type: $1"
  echo "version_type should be 'patch' or 'minor'"
  exit 1
fi

echo $'\n' "Running Frontend Tests" $'
' # Use $'...' for ANSI-escaped strings
yarn test
if [ $? -eq 0 ]; then
  echo -e $'
' "${GREEN} \u2714 All frontend tests passed ${NC}" $'
' # Use $'...' for ANSI-escaped strings
  PREV_STEP=1
else
  echo -e $'
' "${RED} \u2a2f Some frontend tests failed ${NC}" $'
' # Use $'...' for ANSI-escaped strings
  PREV_STEP=0
fi

if [ $PREV_STEP -eq 1 ];then
  echo $'
' "Run build to generate dist files" $'
' # Use $'...' for ANSI-escaped strings
  yarn build
fi

if [ $PREV_STEP -eq 1 ];then
  # Run git status and capture the output
  git_status=$(git status --porcelain)

  # Check if the repository is clean
  if [ -z "$git_status" ]; then
    # Calculate the new version and update package.json
    new_version=$(npm version "$1" --no-git-tag-version)
    new_version=${new_version#v}

    echo "👉 Update version in SDK_VERSION in src/utils.ts"
    sed -i "s/SimplePay_Rrd_[0-9]\+\.[0-9]\+\.[0-9]\+/SimplePay_Rrd_$new_version/" src/utils.ts

    # Stage the changes
    git add src/utils.ts package.json

    # Commit the version change and create a git tag
    git commit -m "chore: bump version to $new_version"
    git tag "v$new_version"

    echo "👉 Log in to npmjs.com"
    npm login

    echo "👉 Publishing the new version to npmjs.com"
    npm publish

    echo "👉 Pushing new version to git: $new_version"
    git push --follow-tags

    # Collect release notes from commits since the last release
    last_release=$(git describe --tags --abbrev=0)
    release_notes=$(git log "${last_release}..HEAD" --pretty="%s" | awk -v prefix="* " '/^(feat|fix|docs|test|chore|refactor|style)/{print prefix $0}')
    echo "👉 Creating a new release on GitHub"
    gh release create "v$new_version" \
      --notes "$release_notes" \
      --target main \
      --generate-notes \
      --title "v$new_version" \
      --latest
  else
    echo -e $'
' "${RED} \u2a2f Repository is not clean. ${NC} Please commit or stash your changes before running this script." $'
' # Use $'...' for ANSI-escaped strings
    exit 1
  fi
fi
