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

echo $'\n' "Running Frontend Tests" $'\n'
yarn test
if [ $? -eq 0 ]; then
  echo -e $'\n' "${GREEN} \u2714 All frontend tests passed ${NC}" $'\n'
  PREV_STEP=1
else
  echo -e $'\n' "${RED} \u2a2f Some frontend tests failed ${NC}" $'\n'
  PREV_STEP=0
fi

if [ $PREV_STEP -eq 1 ];then
  echo $'\n' "Run build to generate dist files" $'\n'
  yarn build
fi

if [ $PREV_STEP -eq 1 ];then
  # Run git status and capture the output
  git_status=$(git status --porcelain)

  # Check if the repository is clean
  if [ -z "$git_status" ]; then
    new_version=$(npm version "$1" --no-git-tag-version)
    new_version=${new_version#v}

    echo "👉 Update SDK_VERSION in src/index.ts"
    sed -i "s/SimplePayV2.1_Rrd_[0-9]\+\.[0-9]\+\.[0-9]\+/SimplePayV2.1_Rrd_$new_version/" src/index.ts
    git add src/index.ts
    git commit -m "chore: update SDK_VERSION to $new_version"

    # Bump the version number using patch/minor keyword
    yarn version --"$1" --no-git-tag-version

    # Collect release notes from commits since the last release
    last_release=$(git describe --tags --abbrev=0)
    release_notes=$(git log "${last_release}..HEAD" --pretty="%s" | awk -v prefix="* " '/^(feat|fix|docs|test|chore|refactor|style)/{print prefix $0}')

    echo "👉 Publishing the new version to npmjs.com"
    yarn publish
    
    echo "👉 Pushing new version to git: $new_version"
    git push origin main
    git push simplepay-js-sdk "v$new_version"

    echo "👉 Creating a new release on GitHub"
    gh release create "v$new_version" \
      --notes "$release_notes" \
      --target main \
      --generate-notes \
      --title "v$new_version" \
      --latest
  else
    echo -e $'\n' "${RED} \u2a2f Repository is not clean. ${NC} Please commit or stash your changes before running this script." $'\n'
    exit 1
  fi
fi