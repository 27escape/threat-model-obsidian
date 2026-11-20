#!/usr/bin/env bash
# Set up git and GitHub for this plugin. Run once; safe to run again (steps already done are skipped).
#
#   tools/setup-repo.sh [--dry-run] [--yes] [--name NAME] [--owner OWNER] [--private] [--topic TOPIC]...
#
#   --name      GitHub repo name. Default: this folder's name (you're asked, so you can change it)
#   --owner     GitHub user or organisation. Default: "git config --global github.user", then the GitHub CLI's
#               signed-in user, otherwise you're asked (and offered to save it as github.user)
#   --private   make a new GitHub repo private (default public: Obsidian's plugin list needs a public repo)
#   --topic     extra GitHub topic (repeatable); "obsidian" and "obsidian-plugin" are always added
#   --dry-run   say what would happen; change nothing
#   --yes       don't ask: take the defaults and go ahead
#
# Steps:
#   1. the local repo: if there isn't one, "git init -b main"
#      - the GitHub repo already has commits: fetch them and point main at them, keeping every file here as it
#        is; anything that differs shows in "git status" for you to review and commit (nothing is overwritten)
#      - otherwise: a first commit of the files here
#   2. origin: the GitHub repo https://github.com/OWNER/NAME
#      - not on GitHub yet: made with the GitHub CLI (gh) if it is installed and signed in, after asking;
#        without it, you're told what to make on github.com, then run this again
#      - on GitHub but empty: main is pushed
#   3. the GitHub description (the manifest's) and topics, with gh; without it, printed to paste in
#   4. a check that .github/workflows/release.yml is there (tools/release.sh needs it)
# Needs git and node. SETUP_GIT_BASE (default https://github.com) is only for testing against local repos.
set -euo pipefail

cd "$(dirname "$0")/.."

DRY=0
YES=0
NAME=''
OWNER=''
VISIBILITY=--public
TOPICS=(obsidian obsidian-plugin)
while [ $# -gt 0 ]; do
  case "$1" in
    --dry-run) DRY=1 ;;
    --yes | -y) YES=1 ;;
    --private) VISIBILITY=--private ;;
    --name) NAME="${2:?--name needs a value}"; shift ;;
    --owner) OWNER="${2:?--owner needs a value}"; shift ;;
    --topic) TOPICS+=("${2:?--topic needs a value}"); shift ;;
    -h | --help) sed -n '2,25p' "$0" | sed 's/^# \{0,1\}//'; exit 0 ;;
    *) echo "Unknown option: $1 (see --help)" >&2; exit 2 ;;
  esac
  shift
done

say() { printf '\n== %s\n' "$*"; }
fail() { printf '\nStopped: %s\n' "$*" >&2; exit 1; }
run() {
  if [ "$DRY" = 1 ]; then printf '   would run: %s\n' "$*"; else printf '   + %s\n' "$*"; "$@"; fi
}
ask() {
  [ "$YES" = 1 ] || [ "$DRY" = 1 ] && return 0
  local r
  read -r -p "   $1 [y/N] " r
  [[ "$r" =~ ^[Yy] ]]
}
# ask for a value with a default; --yes and --dry-run take the default
askValue() {
  local r
  if [ "$YES" = 1 ] || [ "$DRY" = 1 ]; then printf '%s' "$2"; return; fi
  read -r -p "   $1 [$2]: " r
  printf '%s' "${r:-$2}"
}

command -v git >/dev/null || fail "git isn't installed"
command -v node >/dev/null || fail "node isn't installed"
MANIFEST=$(node -p "require('./tools/files.json').manifest")
PLUGIN=$(node -p "require('./$MANIFEST').name")
DESC=$(node -p "require('./$MANIFEST').description")
BASE=${SETUP_GIT_BASE:-https://github.com}
GH=0
command -v gh >/dev/null 2>&1 && gh auth status >/dev/null 2>&1 && GH=1

say "$PLUGIN: git and GitHub set-up$([ "$DRY" = 1 ] && echo ' (dry run)')"

# ---- who and where
HAS_REPO=0
[ -d .git ] && HAS_REPO=1
ORIGIN=''
[ "$HAS_REPO" = 1 ] && ORIGIN=$(git remote get-url origin 2>/dev/null || true)
if [ -n "$ORIGIN" ]; then
  URL=$ORIGIN
  SLUG=$(printf '%s' "$ORIGIN" | sed -E 's#^(git@github.com:|https://github.com/)##; s#\.git$##')
  echo "   origin is already set: $URL"
else
  if [ -z "$OWNER" ]; then
    OWNER=$(git config --global github.user || true)
    [ -z "$OWNER" ] && [ "$GH" = 1 ] && OWNER=$(gh api user --jq .login 2>/dev/null || true)
    if [ -z "$OWNER" ]; then
      [ "$YES" = 1 ] || [ "$DRY" = 1 ] && fail "no GitHub user: give --owner, or set it once with: git config --global github.user <you>"
      read -r -p "   Your GitHub user name: " OWNER
      [ -n "$OWNER" ] || fail "no GitHub user"
      if ask "Save it for next time (git config --global github.user $OWNER)?"; then git config --global github.user "$OWNER"; fi
    fi
  fi
  [ -n "$NAME" ] || NAME=$(askValue "GitHub repo name" "$(basename "$PWD")")
  [[ "$NAME" =~ ^[A-Za-z0-9._-]+$ ]] || fail "'$NAME' can't be a GitHub repo name (letters, digits, . _ - only)"
  SLUG="$OWNER/$NAME"
  URL="$BASE/$SLUG.git"
fi
echo "   GitHub repo: $SLUG"

# what is on GitHub: missing (or no access), empty, or has commits
REMOTE=missing
if HEADS=$(GIT_TERMINAL_PROMPT=0 git ls-remote --heads "$URL" 2>/dev/null); then
  if [ -n "$HEADS" ]; then REMOTE=commits; else REMOTE=empty; fi
fi
REMOTE_MAIN=main
if [ "$REMOTE" = commits ] && ! printf '%s\n' "$HEADS" | grep -q 'refs/heads/main$'; then
  REMOTE_MAIN=$(printf '%s\n' "$HEADS" | head -1 | sed 's#.*refs/heads/##')
fi
case "$REMOTE" in
  missing) echo "   on GitHub: not found (or you have no access to it)" ;;
  empty) echo "   on GitHub: there, and empty" ;;
  commits) echo "   on GitHub: there, with commits (branch $REMOTE_MAIN)" ;;
esac

# ---- 1. the local repo
say "Local repo"
if [ "$HAS_REPO" = 1 ]; then
  echo "   already a git repo ($(git rev-parse --abbrev-ref HEAD 2>/dev/null || echo 'no commits yet'))"
else
  [ -n "$(git config user.name || true)" ] && [ -n "$(git config user.email || true)" ] ||
    fail "git doesn't know who you are: git config --global user.name \"Your Name\" and git config --global user.email you@example.com"
  run git init -q -b main
  if [ "$REMOTE" = commits ]; then
    echo "   the GitHub repo has commits: main will point at them; the files here stay as they are"
    run git remote add origin "$URL"
    run git fetch -q origin
    run git reset -q "origin/$REMOTE_MAIN"
    run git branch -q -u "origin/$REMOTE_MAIN" main
    ORIGIN=$URL
    if [ "$DRY" = 0 ]; then
      if [ -n "$(git status --porcelain)" ]; then
        echo "   these files differ from GitHub; review them (git diff) and commit what you want to keep:"
        git status --short | sed 's/^/     /'
      else
        echo "   the files here match GitHub"
      fi
    fi
  else
    run git add -A
    run git commit -q -m "$PLUGIN: first commit"
  fi
fi

# ---- 2. origin
say "origin"
if [ "$REMOTE" = missing ]; then
  if [ "$GH" = 1 ]; then
    if ask "Make $SLUG on GitHub ($( [ "$VISIBILITY" = --public ] && echo public || echo private )) and push main?"; then
      [ -n "$ORIGIN" ] && run git remote remove origin
      run gh repo create "$SLUG" "$VISIBILITY" --source . --remote origin --push --description "$DESC"
      REMOTE=commits
    else
      fail "not made; run this again when you're ready"
    fi
  else
    [ -n "$ORIGIN" ] || run git remote add origin "$URL"
    cat <<EOF
   $SLUG isn't on GitHub yet (or you have no access to it). Either:
     - install the GitHub CLI and sign in ("gh auth login"), then run this again: it makes the repo for you, or
     - make it on github.com: new repository, owner ${SLUG%%/*}, name ${SLUG#*/}, no README, licence or .gitignore
       (this repo has its own), then run this again.
EOF
    exit 0
  fi
elif [ -z "$ORIGIN" ]; then
  run git remote add origin "$URL"
else
  echo "   origin: $ORIGIN"
fi
if [ "$REMOTE" = empty ]; then
  if ask "Push main to $SLUG?"; then
    run git push -u origin main
  else
    echo "   not pushed; later: git push -u origin main"
  fi
elif [ "$REMOTE" = commits ] && [ "$HAS_REPO" = 1 ] && [ "$DRY" = 0 ]; then
  git fetch -q origin || true
  if ! git rev-parse -q --verify "refs/remotes/origin/$REMOTE_MAIN" >/dev/null; then :
  elif git merge-base --is-ancestor "origin/$REMOTE_MAIN" HEAD; then
    [ "$(git rev-parse HEAD)" = "$(git rev-parse "origin/$REMOTE_MAIN")" ] && echo "   up to date with GitHub" || echo "   GitHub is behind: git push"
  else
    echo "   GitHub has commits this repo lacks: git pull, then run this again"
  fi
fi

# ---- 3. description and topics
say "Description and topics"
TOPIC_LIST=$(IFS=,; echo "${TOPICS[*]}")
if [ "$GH" = 1 ] && [ "$REMOTE" != missing ]; then
  run gh repo edit "$SLUG" --description "$DESC" --add-topic "$TOPIC_LIST"
else
  cat <<EOF
   On GitHub, open the repo, click the cog next to "About" (it appears once something is pushed) and set:
     description: $DESC
     topics:      ${TOPICS[*]}
EOF
fi

# ---- 4. release workflow
say "Release workflow"
if [ -f .github/workflows/release.yml ]; then
  echo "   .github/workflows/release.yml is there"
else
  echo "   .github/workflows/release.yml is missing: tools/release.sh needs it to draft GitHub releases"
fi

say "Done: $SLUG"
