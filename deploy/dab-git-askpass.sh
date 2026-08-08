#!/bin/sh
set -eu
case "${1:-}" in
  *Username*) printf '%s\n' 'x-access-token' ;;
  *) printf '%s\n' "${DAB_GIT_GITHUB_TOKEN:?DAB_GIT_GITHUB_TOKEN is required}" ;;
esac
