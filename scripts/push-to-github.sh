#!/usr/bin/env bash
# Kör lokalt efter: gh auth login
set -euo pipefail
OWNER="${GITHUB_OWNER:-hugolilliestrom}"
REPO="${GITHUB_REPO:-tidsrapport}"
VISIBILITY="${VISIBILITY:-private}"  # private|public

cd "$(dirname "$0")/.."

if ! gh auth status >/dev/null 2>&1; then
  echo "Kör först: gh auth login"
  exit 1
fi

if gh repo view "$OWNER/$REPO" >/dev/null 2>&1; then
  echo "Repo finns redan: https://github.com/$OWNER/$REPO"
else
  gh repo create "$OWNER/$REPO" --"$VISIBILITY" --source=. --remote=origin --push
  echo "Skapat och pushat: https://github.com/$OWNER/$REPO"
  exit 0
fi

git init
git add .
git commit -m "Tidsrapport: Next.js + Supabase cloud" || true
git branch -M main
git remote remove origin 2>/dev/null || true
git remote add origin "https://github.com/$OWNER/$REPO.git"
git push -u origin main
echo "Pushat: https://github.com/$OWNER/$REPO"
echo "Vercel import: https://vercel.com/new/import?s=https://github.com/$OWNER/$REPO"
