#!/usr/bin/env bash
# ---------------------------------------------------------------------------
# staging-scan.sh — the migration risk detector for the staging pipeline and
# for the Production button (.github/workflows/production.yml).
#
# THE PRODUCTION BUTTON RUNS THE SAME SCAN. It reads the same table, calls the
# same modes and gets the same flags. One difference is decided outside this
# file, in scripts/production-deploy.mjs: when --applied-count says the
# production database holds no migration at all, nothing can break there, so a
# flagged file is listed and applied anyway. Once anything is applied, a flag
# stops production exactly as it stops staging.
#
# WHY THIS IS A SCRIPT AND NOT INLINE YAML. The scan is proven by EXECUTING it
# against fixture files before it ships, and a proof is only a proof if it runs
# the same bytes CI will run. YAML embedded in a workflow cannot be executed
# locally without transcribing it, at which point the thing proven is the
# transcription and not the thing that runs.
#
# WHAT THIS IS FOR. Installed builds read these databases (TestFlight builds
# read staging; store builds read production). A migration that removes,
# renames or changes something a build still uses, or that runs code the moment
# it is applied, waits for a person to read it; the rest flows automatically.
#
# A RISK DETECTOR, NOT A PROOF (R-M4, F01). The statement-level reading lives in
# scripts/migration-scan.mjs, which lists what it flags and what it does not.
# A file it does not flag can still break an installed build (a changed return
# type, a new constraint, a replaced view); the local suite is the proof. So its
# words say "review required" on a flag and never call a file safe.
#
# USAGE
#   staging-scan.sh <allow_destructive: true|false> [migration file ...]
#   staging-scan.sh --pending-files <migration-list output file | ->
#   staging-scan.sh --applied-count <migration-list output file | ->
#
#   Zero migration files is success: nothing pending is nothing to scan.
#   exit 0 — nothing flagged; or flagged with allow_destructive=true, in which case every
#            hit is still printed. A silent bypass is not a bypass, it is a
#            blind spot.
#   exit 1 — flagged with allow_destructive=false, BEFORE anything is applied.
#   exit 2 — the script was called wrongly (bad flag value, missing file), or
#            the scan itself failed (scripts/migration-scan.mjs threw or did not
#            run); never read as a flag, so allow_destructive cannot pass it.
# ---------------------------------------------------------------------------

set -euo pipefail

if [ "$#" -lt 1 ]; then
  echo "staging-scan.sh: usage: staging-scan.sh <true|false> [migration file ...]" >&2
  echo "staging-scan.sh:        staging-scan.sh --pending-files <migration-list output file | ->" >&2
  echo "staging-scan.sh:        staging-scan.sh --applied-count <migration-list output file | ->" >&2
  exit 2
fi

# ---------------------------------------------------------------------------
# THE PENDING SET — added by run A1-FIX, 2026-08-29, because it broke in CI.
#
# WHY IT LIVES HERE NOW. A1's first pipeline run failed at this exact seam. The
# pinned CLI wraps every cell of its migration table in BACKTICK characters,
# the parse did not expect them, and so it read ZERO versions out of a table
# that plainly held four. The parse could not be proven before it shipped for
# one reason: it was embedded in workflow YAML, and YAML cannot be executed
# against a fixture without first being transcribed — at which point the thing
# proven is the transcription and not the thing that runs. That is the same
# argument the header above makes about the scan itself, so the parse now sits
# beside the scan, where a fixture runs the real bytes.
#
# NORMALISE, DO NOT SPECIAL-CASE. The CLI's table formatting is the thing that
# just proved unstable, so a row is normalised before it is read rather than
# patched for the one glyph that bit us: the U+2502 box drawing character
# becomes an ASCII pipe, EVERY backtick is removed, and then each cell's
# whitespace is stripped. A cell is EMPTY when nothing survives that. A row is
# PENDING when its LOCAL cell holds a 14-digit version and its REMOTE cell is
# empty. Header and rule rows fall out for free: neither has 14 digits in
# cell one.
#
# WHAT DELIBERATELY DID NOT CHANGE. Both fail-loud paths stay exactly as strict
# as they were, and they are the reason this fix took minutes instead of a
# debugging session — the raw output the gate printed on its way down is what
# diagnosed it:
#
#   * reading ZERO versions while migration files exist is FATAL, and the RAW
#     output is printed;
#   * a pending version that does not resolve to exactly one existing file is
#     FATAL.
#
# Guessing what is pending is precisely the mistake this gate exists to
# prevent, so neither path may ever soften into an empty pending set.
#
#   staging-scan.sh --pending-files <migration-list output file | ->
#
#   stdout — one resolved migration file path per line, ready to be handed
#            straight back in as this script's scan arguments. Nothing else is
#            ever written there, so the caller can read it directly.
#   stderr — every diagnostic, including the resolved list as a human reads it.
#   exit 0 — the pending set was resolved; it may legitimately be empty.
#   exit 1 — FATAL: an unreadable table, or a version with no matching file.
#   exit 2 — called wrongly (missing or unreadable input).
#
#   staging-scan.sh --applied-count <migration-list output file | ->
#
#   stdout — one number: how many versions the database reports as applied
#            (rows whose REMOTE cell holds a 14-digit version, including a
#            version this checkout has no file for). 0 means an empty database.
#   exit 0 — counted.
#   exit 1 — FATAL: the same unreadable-table rule as --pending-files. A table
#            that cannot be read never answers 0, because 0 is the answer that
#            lets a flagged file through on production.
#   exit 2 — called wrongly (missing or unreadable input).
# ---------------------------------------------------------------------------

MIGRATIONS_DIR="supabase/migrations"

# The normalisation step itself. Box glyph to pipe first, then every backtick
# removed, so the per-cell whitespace strip below decides emptiness on what is
# actually content.
normalise_table() {
  sed -e 's/\xe2\x94\x82/|/g' -e 's/`//g'
}

# Reads the table from a file or stdin into TABLE_RAW (as printed) and
# TABLE_ROWS (normalised), and stops FATAL when it holds no readable version
# while migration files exist. Shared by --pending-files and --applied-count,
# so both modes refuse the same unreadable table in the same words.
load_table() {
  local source="$1" flag="$2" readable local_count

  if [ "$source" = "-" ]; then
    TABLE_RAW="$(cat)"
  elif [ -f "$source" ]; then
    TABLE_RAW="$(cat "$source")"
  else
    echo "staging-scan.sh: ${flag}: no such input file: ${source}" >&2
    exit 2
  fi

  TABLE_ROWS="$(printf '%s\n' "$TABLE_RAW" | normalise_table)"

  readable="$(printf '%s\n' "$TABLE_ROWS" | awk -F'|' '
    NF >= 2 { v = $1; gsub(/[[:space:]]/, "", v); if (v ~ /^[0-9]+$/ && length(v) == 14) n++ }
    END { print n + 0 }')"

  local_count=0
  if [ -d "$MIGRATIONS_DIR" ]; then
    local_count="$(find "$MIGRATIONS_DIR" -maxdepth 1 -name '*.sql' | wc -l)"
  fi

  if [ "$readable" -eq 0 ] && [ "$local_count" -gt 0 ]; then
    echo "FATAL: the migration table yielded no readable version, yet" >&2
    echo "${local_count} migration file(s) exist locally. The pinned CLI's output" >&2
    echo "format is not what this parse expects, and guessing what is pending is" >&2
    echo "exactly the mistake this gate exists to prevent. Raw output follows:" >&2
    printf '%s\n' "$TABLE_RAW" >&2
    exit 1
  fi
}

count_applied() {
  local applied
  load_table "$1" --applied-count
  applied="$(printf '%s\n' "$TABLE_ROWS" | awk -F'|' '
    NF >= 2 { r = $2; gsub(/[[:space:]]/, "", r); if (r ~ /^[0-9]+$/ && length(r) == 14) n++ }
    END { print n + 0 }')"
  echo "Migrations the database reports as applied: ${applied}" >&2
  printf '%s\n' "$applied"
  exit 0
}

resolve_pending_files() {
  local pending_versions version
  local matches=()
  local pending=()

  load_table "$1" --pending-files

  pending_versions="$(printf '%s\n' "$TABLE_ROWS" | awk -F'|' '
    NF >= 2 {
      local_v = $1; remote_v = $2
      gsub(/[[:space:]]/, "", local_v)
      gsub(/[[:space:]]/, "", remote_v)
      if (local_v ~ /^[0-9]+$/ && length(local_v) == 14 && remote_v == "") {
        print local_v
      }
    }')"

  # Map each pending version to its file. Exactly one file per version, or this
  # cannot know what to scan and says so. Collected first and printed last, so
  # a FATAL never leaves a half-written pending set on stdout.
  while IFS= read -r version; do
    [ -n "$version" ] || continue
    matches=("$MIGRATIONS_DIR/${version}"_*.sql)
    if [ "${#matches[@]}" -ne 1 ] || [ ! -f "${matches[0]}" ]; then
      echo "FATAL: the database reports ${version} pending, but" >&2
      echo "${MIGRATIONS_DIR}/${version}_*.sql did not resolve to exactly one" >&2
      echo "existing file. Matched: ${matches[*]}" >&2
      echo "Cannot decide what to scan, and will not guess." >&2
      exit 1
    fi
    pending+=("${matches[0]}")
  done < <(printf '%s\n' "$pending_versions")

  echo "Pending migrations, resolved from the database:" >&2
  if [ "${#pending[@]}" -eq 0 ]; then
    echo "  (none — the database is already at the committed head)" >&2
  else
    printf '  %s\n' "${pending[@]}" >&2
    printf '%s\n' "${pending[@]}"
  fi

  exit 0
}

if [ "$1" = "--pending-files" ]; then
  shift
  if [ "$#" -ne 1 ]; then
    echo "staging-scan.sh: --pending-files takes exactly one argument: the file" >&2
    echo "holding the migration table, or - to read it from stdin." >&2
    exit 2
  fi
  resolve_pending_files "$1"
fi

if [ "$1" = "--applied-count" ]; then
  shift
  if [ "$#" -ne 1 ]; then
    echo "staging-scan.sh: --applied-count takes exactly one argument: the file" >&2
    echo "holding the migration table, or - to read it from stdin." >&2
    exit 2
  fi
  count_applied "$1"
fi

allow_destructive="$1"
shift

# The caller is a workflow expression, so a mis-evaluated input must be loud
# rather than silently treated as an override.
case "$allow_destructive" in
  true | false) ;;
  *)
    echo "staging-scan.sh: first argument must be exactly 'true' or 'false', got '${allow_destructive}'" >&2
    exit 2
    ;;
esac

if [ "$#" -eq 0 ]; then
  echo "staging-scan.sh: no pending migrations to scan — nothing to do."
  exit 0
fi

# THE READING ITSELF is scripts/migration-scan.mjs: it splits the file into SQL
# statements (quotes, comments and $tag$ bodies understood) and prints one
# "<line><TAB><reason>" per flagged statement; exit 0 nothing flagged, 1
# flagged. Any other exit is a broken scan, never a pass.
SCANNER="$(dirname "$0")/migration-scan.mjs"

status=0

for file in "$@"; do
  if [ ! -f "$file" ]; then
    echo "staging-scan.sh: pending migration file not found: ${file}" >&2
    exit 2
  fi

  scan_status=0
  hits="$(node "$SCANNER" "$file")" || scan_status=$?

  if [ "$scan_status" -eq 0 ]; then
    echo "  ok   ${file}"
    continue
  fi
  if [ "$scan_status" -ne 1 ]; then
    echo "staging-scan.sh: the scan could not read ${file} (exit ${scan_status})" >&2
    exit 2
  fi

  status=1
  echo ""
  echo "  FLAG ${file}"
  printf '%s\n' "$hits" | while IFS=$'\t' read -r lineno reason; do
    [ -n "$lineno" ] || continue
    # Report the ORIGINAL line: the operator is going to open this file at this
    # line number and expect to see what is printed.
    original="$(sed -n "${lineno}p" "$file" | tr -d '\r')"
    echo "       line ${lineno}: ${original} (review required: ${reason})"
  done
done

if [ "$status" -eq 0 ]; then
  echo ""
  echo "staging-scan.sh: scanned $# pending migration file(s); the scan flags none. It detects risky shapes; it is no proof that nothing breaks."
  exit 0
fi

echo ""

if [ "$allow_destructive" = "true" ]; then
  echo "OVERRIDE IN EFFECT — allow_destructive was checked."
  echo ""
  echo "The flagged statements above are being applied anyway, because a human"
  echo "asked for that from the Actions tab. They are printed above so the override"
  echo "is on the record."
  exit 0
fi

echo "STOPPING. NOTHING HAS BEEN APPLIED."
echo ""
echo "Review required: a statement above may remove, rename or change something an"
echo "installed build still uses, or it runs code the moment it is applied."
echo "Installed builds read this database (TestFlight builds read staging; store"
echo "builds read production), so a person reads those lines before it lands."
echo ""
echo "Two ways forward:"
echo "  1. Change the migration so it only adds, and push again; or"
echo "  2. start this workflow again from the Actions tab (Run workflow) with"
echo "     allow_destructive CHECKED, once you have read the lines above."
exit 1
