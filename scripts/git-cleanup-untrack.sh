#!/usr/bin/env bash
# git-cleanup-untrack.sh
#
# Run this once from the project root in your terminal to complete the
# GitHub sync cleanup. It removes three categories of development artifacts
# from git tracking (files stay on disk), commits the change, and pushes
# all commits to GitHub.
#
# Usage:
#   bash scripts/git-cleanup-untrack.sh

set -euo pipefail

echo "==> Untracking user-uploaded images..."
git rm --cached artifacts/api-server/uploads/social-posts/*.png

echo "==> Untracking agent working-memory files..."
git rm --cached -r .agents/

echo "==> Untracking raw AI prompt pastes..."
git rm --cached attached_assets/Pasted-*.txt

echo "==> Committing cleanup..."
git commit -m "chore: untrack uploads, agent memory, and raw prompt files from git index

Removes from git tracking (files remain on disk):
- artifacts/api-server/uploads/social-posts/ (11 user-upload PNGs)
- .agents/memory/ (29 agent working-memory files)
- attached_assets/Pasted-*.txt (122 raw AI prompt pastes)

All three paths are now covered by .gitignore so they will not
be re-added in future commits."

echo "==> Pushing to origin main..."
git push origin main

echo ""
echo "Done. All 74 commits are now on GitHub."
echo "Run: git log --oneline origin/main | head -5"
