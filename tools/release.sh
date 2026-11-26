#!/usr/bin/env bash
# Release the plugin: check, build, tag and publish a version. (Adapted from Neon Work's tools/release.sh;
# the plugin's name, id and manifest path come from tools/files.json and the manifest, so it isn't tied to one repo.)
#
#   tools/release.sh [VERSION] [--dry-run] [--yes] [--no-push]
#
#   VERSION     X.Y.Z. Default: the version in the manifest. If it differs from the manifest, the manifest
#               and versions.json are set to it and committed ("Release X.Y.Z").
#   --dry-run   run the checks and the build, then say what would happen; change nothing, push nothing
#   --yes       don't ask before changing the version, tagging or pushing
#   --no-push   stop after tagging (to push later, run it again without --no-push)
#
# Needs docs/release-notes/VERSION.md (its text becomes the GitHub release notes) and a GitHub remote "origin"
# (tools/setup-repo.sh sets that up).
#   1. checks: a clean working tree, the release notes, the unit tests, the build and tools/check.mjs
#   2. the version in the manifest and versions.json (only when VERSION differs)
#   3. the sample vault's copy of the plugin, committed if it is tracked and changed; the web app page,
#      web/threat-modelling.html, built and committed if it changed (installs Pele and Lucide with npm if need be)
#   4. main fast-forwarded to this branch (main must not have commits this branch lacks)
#   5. an annotated tag VERSION on this commit
#   6. push main, this branch and the tag to origin
#   7. the GitHub release: pushing the tag starts GitHub Actions (.github/workflows/release.yml), which builds, tests,
#      attests main.js, manifest.json, styles.css and the web app page (threat-modelling.html) and drafts the release;
#      this script then publishes that draft
#      with the GitHub CLI (gh) when it is installed and signed in, or says where to publish it on github.com
# Safe to run again: steps already done (version set, tag on this commit, release made) are skipped.
set -euo pipefail

cd "$(dirname "$0")/.."

DRY=0
YES=0
PUSH=1
VERSION=''
for a in "$@"; do
  case "$a" in
    --dry-run) DRY=1 ;;
    --yes | -y) YES=1 ;;
    --no-push) PUSH=0 ;;
    -h | --help) sed -n '2,24p' "$0" | sed 's/^# \{0,1\}//'; exit 0 ;;
    -*) echo "Unknown option: $a (see --help)" >&2; exit 2 ;;
    *) VERSION="$a" ;;
  esac
done

[ -d .git ] || { echo "Stopped: not a git repo yet: run tools/setup-repo.sh first" >&2; exit 1; }

say() { printf '\n== %s\n' "$*"; }
fail() { printf '\nStopped: %s\n' "$*" >&2; exit 1; }
# run a command that changes something (shown, or only described with --dry-run)
run() {
  if [ "$DRY" = 1 ]; then printf '   would run: %s\n' "$*"; else printf '   + %s\n' "$*"; "$@"; fi
}
ask() {
  [ "$YES" = 1 ] || [ "$DRY" = 1 ] && return 0
  local r
  read -r -p "   $1 [y/N] " r
  [[ "$r" =~ ^[Yy] ]] || fail "not confirmed"
}

MANIFEST=$(node -p "require('./tools/files.json').manifest")
ID=$(node -p "require('./$MANIFEST').id")
NAME=$(node -p "require('./$MANIFEST').name")
CURRENT=$(node -p "require('./$MANIFEST').version")
MINAPP=$(node -p "require('./$MANIFEST').minAppVersion")
DIST="dist/$ID"
SAMPLE="sample vault/.obsidian/plugins/$ID"
VERSION=${VERSION:-$CURRENT}
NOTES="docs/release-notes/$VERSION.md"
BRANCH=$(git rev-parse --abbrev-ref HEAD)
TMP=${TMPDIR:-/tmp}

say "$NAME $VERSION (manifest: $CURRENT, branch: $BRANCH)$([ "$DRY" = 1 ] && echo ', dry run')"

# ---- 1. checks
say "Checks"
[[ "$VERSION" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]] || fail "'$VERSION' isn't a release version (X.Y.Z; betas aren't released)"
[ "$BRANCH" != HEAD ] || fail "not on a branch"
[ -z "$(git status --porcelain)" ] || { git status --short; fail "the working tree has changes: commit or stash them first"; }
[ -f "$NOTES" ] || fail "no release notes: write $NOTES first"
git remote get-url origin >/dev/null 2>&1 || fail "no GitHub remote: run tools/setup-repo.sh first"
if git rev-parse -q --verify "refs/tags/$VERSION" >/dev/null; then
  # a run that stopped after tagging can carry on; a tag on another commit means this version is out already
  TAGGED=$(git rev-list -n 1 "$VERSION")
  [ "$TAGGED" = "$(git rev-parse HEAD)" ] || fail "$VERSION is already tagged, on $(git log --oneline -1 "$TAGGED"): give the next version, e.g. tools/release.sh X.Y.Z"
fi
# main must be able to move forward to this commit (checked now, before anything changes)
HAS_MAIN=0
git rev-parse -q --verify refs/heads/main >/dev/null && HAS_MAIN=1
if [ "$PUSH" = 1 ]; then git fetch -q origin || fail "can't reach origin (git fetch)"; fi
if git rev-parse -q --verify refs/remotes/origin/main >/dev/null; then
  git merge-base --is-ancestor origin/main HEAD || fail "origin/main has commits this branch lacks: merge them in first"
fi
if [ "$HAS_MAIN" = 1 ] && [ "$BRANCH" != main ]; then
  git merge-base --is-ancestor main HEAD || fail "main has commits this branch lacks: merge main into $BRANCH first"
fi
echo "   release notes: $NOTES"
echo "   unit tests…"
# the TAP reporter on every Node version (newer ones default to "spec", whose lines the greps below don't match)
node --test --test-reporter=tap test/*.test.mjs >"$TMP/$ID-release-tests.txt" 2>&1 || { grep -E '^not ok|^# (pass|fail)' "$TMP/$ID-release-tests.txt"; fail "unit tests failed (all output: $TMP/$ID-release-tests.txt)"; }
grep -E '^# (pass|fail)' "$TMP/$ID-release-tests.txt" | sed 's/^/   /' || true

# ---- 2. the version
if [ "$CURRENT" != "$VERSION" ]; then
  say "Version $CURRENT → $VERSION"
  ask "Set the version to $VERSION and commit?"
  if [ "$DRY" = 1 ]; then
    echo "   would set $MANIFEST and versions.json to $VERSION (minAppVersion $MINAPP), build and commit \"Release $VERSION\""
  else
    node -e "
      const fs = require('fs');
      const m = JSON.parse(fs.readFileSync('$MANIFEST', 'utf8'));
      m.version = '$VERSION';
      fs.writeFileSync('$MANIFEST', JSON.stringify(m, null, 2) + '\n');
      const v = JSON.parse(fs.readFileSync('versions.json', 'utf8'));
      v['$VERSION'] = m.minAppVersion;
      fs.writeFileSync('versions.json', JSON.stringify(v, null, 2) + '\n');"
  fi
fi

say "Build"
node tools/build.mjs | tail -1 | sed 's/^/   /'
node tools/check.mjs dist >"$TMP/$ID-release-check.txt" 2>&1 || { tail -20 "$TMP/$ID-release-check.txt"; fail "tools/check.mjs found problems"; }
tail -1 "$TMP/$ID-release-check.txt" | sed 's/^/   /'
if [ "$DRY" = 0 ]; then
  BUILT=$(node -p "require('./$DIST/manifest.json').version")
  [ "$BUILT" = "$VERSION" ] || fail "the build says $BUILT, not $VERSION"
fi
if [ "$CURRENT" != "$VERSION" ] && [ "$DRY" = 0 ]; then
  node tools/map.mjs >/dev/null
  run git add "$MANIFEST" manifest.json versions.json MAP.md
  run git commit -q -m "Release $VERSION"
fi

# ---- 3. the sample vault
if [ -d "$SAMPLE" ]; then
  say "Sample vault"
  if git check-ignore -q "$SAMPLE/main.js"; then
    echo "   the build keeps its copy up to date (not tracked by git)"
  elif [ "$DRY" = 1 ]; then
    echo "   would copy main.js, styles.css and manifest.json from $DIST and commit them if they changed"
  else
    cp "$DIST/main.js" "$DIST/styles.css" "$DIST/manifest.json" "$SAMPLE/"
    if [ -n "$(git status --porcelain -- "$SAMPLE")" ]; then
      run git add -- "$SAMPLE"
      run git commit -q -m "Sample vault: plugin build $VERSION"
    else
      echo "   already up to date"
    fi
  fi
fi

# ---- 3b. the web app page, kept in the repo for anyone who clones it (the release has it too, built by GitHub Actions)
WEB="web/threat-modelling.html"
say "Web app page"
if [ ! -f node_modules/pele/dist/pele.global.js ] || [ ! -f node_modules/lucide-static/icon-nodes.json ]; then
  echo "   installing Pele and Lucide, which the page is built with"
  npm install --no-save pele@1.13.0 lucide-static@1.77.0 >"$TMP/$ID-release-npm.txt" 2>&1 || { tail -5 "$TMP/$ID-release-npm.txt"; fail "npm install failed (all output: $TMP/$ID-release-npm.txt)"; }
fi
node tools/build-web.mjs | tail -1 | sed 's/^/   /'
if [ "$DRY" = 1 ]; then
  echo "   would copy dist/web/index.html to $WEB and commit it if it changed"
else
  mkdir -p "$(dirname "$WEB")"
  cp dist/web/index.html "$WEB"
  if [ -n "$(git status --porcelain -- "$WEB")" ]; then
    run git add -- "$WEB"
    run git commit -q -m "Web app page: build $VERSION"
  else
    echo "   already up to date"
  fi
fi

# ---- 4. main
say "main"
if [ "$BRANCH" != main ] && [ "$HAS_MAIN" = 0 ]; then
  echo "   no local main yet: made here"
  run git branch main HEAD
elif [ "$BRANCH" != main ]; then
  if [ "$(git rev-parse main)" = "$(git rev-parse HEAD)" ]; then
    echo "   main is already here"
  else
    echo "   main moves forward from $(git log --oneline -1 main) to this commit ($(git rev-list --count main..HEAD) commits)"
    run git branch -f main HEAD
  fi
else
  echo "   on main"
fi

# ---- 5. the tag
say "Tag $VERSION"
if git rev-parse -q --verify "refs/tags/$VERSION" >/dev/null && [ "$(git rev-list -n 1 "$VERSION")" = "$(git rev-parse HEAD)" ]; then
  echo "   already on this commit"
else
  ask "Tag $(git log --oneline -1 HEAD) as $VERSION?"
  TITLE=$(head -1 "$NOTES" | sed -E 's/^# *//; s/ *[—-]+ *release notes$//I')
  run git tag -a "$VERSION" -m "${TITLE:-$NAME $VERSION}"
fi

# ---- 6. push
if [ "$PUSH" = 0 ]; then
  say "Not pushed (--no-push). To finish: tools/release.sh $VERSION"
  exit 0
fi
say "Push"
REFS=(main)
[ "$BRANCH" != main ] && REFS+=("$BRANCH")
ask "Push ${REFS[*]} and tag $VERSION to origin?"
run git push origin "${REFS[@]}"
run git push origin "refs/tags/$VERSION"

# ---- 7. the GitHub release
# Pushing the tag starts .github/workflows/release.yml: GitHub Actions builds, tests, attests the three files and
# drafts the release "NAME VERSION" with them and the release notes. Only publishing the draft is left; never
# make a second release by hand (GitHub then has two for the same tag).
say "GitHub release"
REPO=$(git remote get-url origin | sed -E 's#(git@github.com:|https://github.com/)##; s#\.git$##')
if command -v gh >/dev/null 2>&1 && gh auth status >/dev/null 2>&1; then
  echo "   waiting for GitHub Actions to draft the release (a few minutes)…"
  state=''
  for _ in $(seq 1 60); do
    state=$(gh release view "$VERSION" --json isDraft --jq 'if .isDraft then "draft" else "published" end' 2>/dev/null || true)
    [ -n "$state" ] && break
    [ "$DRY" = 1 ] && break
    sleep 10
  done
  case "$state" in
    published) echo "   already published" ;;
    draft) ask "Publish the draft release $NAME $VERSION?"; run gh release edit "$VERSION" --draft=false --latest ;;
    *) if [ "$DRY" = 1 ]; then echo "   would publish the draft once GitHub Actions has made it"; else echo "   no draft yet: check https://github.com/$REPO/actions, then run this again"; fi ;;
  esac
else
  cat <<EOF
   GitHub Actions is drafting the release now (see https://github.com/$REPO/actions): it builds, tests, attests
   main.js, manifest.json and styles.css, and drafts "$NAME $VERSION" with them and $NOTES.
   When it has finished (a few minutes):
     1. open https://github.com/$REPO/releases
     2. edit the draft "$NAME $VERSION" (by github-actions)
     3. tick "Set as the latest release" and click Publish release
   Don't make a release by hand as well: GitHub then has two for the same tag.
   (With the GitHub CLI installed and signed in, "gh auth login", this script publishes the draft itself.)
EOF
fi

say "Done: $NAME $VERSION"
