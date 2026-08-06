#!/bin/sh
set -eu

fail() {
  code="$1"
  message="$2"
  printf 'APOLLOS_CORE_PREFLIGHT_FAILED code=%s message=%s\n' "$code" "$message" >&2
  exit 1
}

pass() {
  code="$1"
  message="$2"
  printf 'APOLLOS_CHECK_OK code=%s message=%s\n' "$code" "$message"
}

command -v node >/dev/null 2>&1 ||
  fail "APOLLOS_NODE_MISSING" "Node.js is not installed in the production API image"

node_major="$(node -p "Number(process.versions.node.split('.')[0])")"
[ "$node_major" -ge 20 ] ||
  fail "APOLLOS_NODE_UNSUPPORTED" "Node.js 20 or newer is required; found $(node --version)"
pass "APOLLOS_NODE_RUNTIME" "node=$(node --version)"

required_entries="
/app/artifacts/api-server/dist/index.mjs
/app/artifacts/api-server/dist/dab-planner-worker.mjs
/app/artifacts/api-server/dist/dab-agent-worker.mjs
/app/artifacts/api-server/dist/dab-preparation-worker.mjs
/app/artifacts/api-server/dist/dab-publishing-worker.mjs
"

for entry in $required_entries; do
  [ -s "$entry" ] ||
    fail "APOLLOS_ENTRYPOINT_MISSING" "Required production entrypoint is missing or empty: $entry"
done
pass "APOLLOS_ENTRYPOINTS" "API and four DAB worker entrypoints are present"

media_root="${LOCAL_MEDIA_DIR:-/data/media}"
mkdir -p "$media_root/uploads" 2>/dev/null ||
  fail "APOLLOS_MEDIA_DIR_CREATE_FAILED" "Cannot create media upload directory: $media_root/uploads"

probe="$media_root/uploads/.apollos-write-probe-$$"
printf 'apollos-runtime-probe\n' > "$probe" 2>/dev/null ||
  fail "APOLLOS_MEDIA_DIR_NOT_WRITABLE" "Media upload directory is not writable: $media_root/uploads"

[ -s "$probe" ] ||
  fail "APOLLOS_MEDIA_WRITE_EMPTY" "Media write probe produced an empty file: $probe"

rm -f "$probe" ||
  fail "APOLLOS_MEDIA_CLEANUP_FAILED" "Media write probe could not be removed: $probe"
pass "APOLLOS_MEDIA_STORAGE" "media_root=$media_root writable=true"

case "${NODE_ENV:-}" in
  production|test)
    pass "APOLLOS_NODE_ENV" "NODE_ENV=${NODE_ENV}"
    ;;
  *)
    fail "APOLLOS_NODE_ENV_INVALID" "NODE_ENV must be production or test for preflight; found ${NODE_ENV:-unset}"
    ;;
esac

case "${SCHEDULER_ENABLED:-false}" in
  true|false)
    pass "APOLLOS_SCHEDULER_FLAG" "SCHEDULER_ENABLED=${SCHEDULER_ENABLED:-false}"
    ;;
  *)
    fail "APOLLOS_SCHEDULER_FLAG_INVALID" "SCHEDULER_ENABLED must be true or false"
    ;;
esac

case "${REFERRAL_DELIVERY_EMERGENCY_STOP:-true}" in
  true|false)
    pass "APOLLOS_EMERGENCY_STOP_FLAG" "REFERRAL_DELIVERY_EMERGENCY_STOP=${REFERRAL_DELIVERY_EMERGENCY_STOP:-true}"
    ;;
  *)
    fail "APOLLOS_EMERGENCY_STOP_INVALID" "REFERRAL_DELIVERY_EMERGENCY_STOP must be true or false"
    ;;
esac

if [ -n "${GOOGLE_API_CERTIFICATE_CONFIG:-}" ]; then
  fail "APOLLOS_STALE_GOOGLE_CERT_CONFIG" "GOOGLE_API_CERTIFICATE_CONFIG must be unset; standard OAuth publishing does not use this optional mTLS path"
fi
pass "APOLLOS_GOOGLE_CERT_CONFIG" "legacy optional mTLS certificate path is absent"

printf 'APOLLOS_CORE_PREFLIGHT_OK node=%s entrypoints=5 media_root=%s\n'   "$(node --version)" "$media_root"
