#!/usr/bin/env bash
# ---------------------------------------------------------------------------
# staging-scan.sh — the destructive-migration tripwire for the staging pipeline.
#
# WHY THIS IS A SCRIPT AND NOT INLINE YAML. The scan is proven by EXECUTING it
# against fixture files before it ships, and a proof is only a proof if it runs
# the same bytes CI will run. YAML embedded in a workflow cannot be executed
# locally without transcribing it, at which point the thing proven is the
# transcription and not the thing that runs.
#
# WHAT THIS IS FOR. Staging is what the operator's and the co-founder's
# TestFlight builds read. Production has no users; staging effectively does. So
# "safe" here does not mean protecting production — it means never leaving an
# installed build talking to a database that no longer matches it.
#
#   Additive SQL — new tables, new columns, new functions — cannot break an
#   installed build, which simply ignores what it does not know about.
#   Removing or renaming something a build still reads breaks it immediately.
#
# This script separates those two shapes so the first flows automatically and
# the second stops and waits for a human.
#
# WHAT THIS IS NOT. It is a tripwire for the obvious shapes, not a proof of
# compatibility. SQL that breaks an installed build without matching one of the
# six rules below passes this scan: a function whose return shape changed, a
# constraint that now rejects rows the app still writes, a default that alters
# what a read returns. The real protection is the local suite that had to be
# green before the migration was ever committed. This exists to catch the one
# class of change that is both catastrophic and trivially detectable.
#
# AND IT DELIBERATELY DOES NOT FIRE ON EVERYTHING. `drop policy`, `drop
# trigger`, `drop index` and `drop constraint` are this repository's ordinary
# idempotent idiom and are not matched — not by an exemption, but because none
# of the six rules contains those words. A gate that fires on every migration
# trains the operator to bypass it, which destroys the gate.
#
# USAGE
#   staging-scan.sh <allow_destructive: true|false> [migration file ...]
#
#   Zero migration files is success: nothing pending is nothing to scan.
#   exit 0 — safe; or flagged with allow_destructive=true, in which case every
#            hit is still printed. A silent bypass is not a bypass, it is a
#            blind spot.
#   exit 1 — flagged with allow_destructive=false, BEFORE anything is applied.
#   exit 2 — the script was called wrongly (bad flag value, missing file).
# ---------------------------------------------------------------------------

set -euo pipefail

if [ "$#" -lt 1 ]; then
  echo "staging-scan.sh: usage: staging-scan.sh <true|false> [migration file ...]" >&2
  exit 2
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

# THE SIX RULES. Case-insensitive and whitespace-tolerant: GNU grep ERE, with
# [[:space:]]+ between keywords so `DROP   Column` matches, and \b at the word
# edges so a longer identifier never matches by accident.
#
# TRUNCATE IS ANCHORED TO STATEMENT POSITION — start of line, or just after a
# `;` — and this is not decoration. TRUNCATE is ALSO the name of a table
# PRIVILEGE, and this repository's baseline grants it eleven times:
#
#     GRANT SELECT,REFERENCES,DELETE,TRIGGER,TRUNCATE,MAINTAIN ON TABLE ...
#
# A bare \btruncate\b flags every one of those. A GRANT adds a privilege and
# removes nothing; flagging it is precisely the false positive that trains an
# operator to check the override box by reflex, which destroys the gate. In a
# privilege list TRUNCATE always follows a comma or another privilege, never a
# statement boundary, so the anchor separates the two with no exemption list.
# The same trap does not exist for DELETE: `DELETE,TRIGGER` in a grant has no
# `from` after it, so the two-word rule already excludes it.
PATTERNS=(
  '\bdrop[[:space:]]+table\b'    # with or without `if exists`: destructive either way
  '\bdrop[[:space:]]+column\b'   # catches `alter table ... drop column`
  '\bdrop[[:space:]]+schema\b'
  '(^|;)[[:space:]]*truncate\b'  # the STATEMENT, not the GRANT privilege of the same name
  '\brename[[:space:]]+to\b'     # `alter table ... rename to`
  '\brename[[:space:]]+column\b'
  '\bdelete[[:space:]]+from\b'   # only ever seen bare — function bodies are stripped first
)

GREP_ARGS=()
for pattern in "${PATTERNS[@]}"; do
  GREP_ARGS+=(-e "$pattern")
done

# PREPROCESS, in order, one output line per input line so that line numbers
# still point at the real file:
#
#   1. strip carriage returns;
#   2. strip `--` comments to end of line — so a line that merely TALKS about
#      dropping a table cannot fire the gate;
#   3. strip every dollar-quoted body. Each occurrence of a dollar-quote
#      delimiter ($$ or $tag$, pattern \$[A-Za-z_]*\$) toggles between keep and
#      discard, which also handles a body that opens and closes on one line.
#      Function bodies are runtime behaviour, not schema shape: `delete from`
#      and `truncate` inside them are this repository's ordinary idiom and must
#      never fire the gate.
#
# STATED LIMITS, so nobody mistakes this for more than it is:
#   * /* */ block comments are NOT stripped. None exist in this repository's
#     migrations today; one containing `drop table` would be a false positive,
#     which fails safe (it stops, it does not wave something through).
#   * A statement split across lines (`drop\n  table`) is not matched, because
#     the match is line-based. Fails open — noted, not defended.
#   * A dollar-quote tag containing a digit ($tag1$) is not recognised as a
#     delimiter. An unbalanced delimiter count discards the rest of the file.
#     Both fail open in the same direction as the line above.
#   * A `--` inside a string literal truncates that line early. Removing text
#     can only lose a match, never invent one.
#   * A TRUNCATE statement that begins somewhere other than the start of a line
#     or just after a `;` is not matched, per the anchor explained above. At the
#     top level of a migration there is nowhere else for a statement to begin;
#     inside a function body there is, and function bodies are stripped anyway.
#   * `date_trunc(` cannot match any rule: it contains `trunc`, never `truncate`.
preprocess() {
  awk '
    BEGIN { inbody = 0 }
    {
      line = $0
      gsub(/\r/, "", line)
      sub(/--.*$/, "", line)

      out = ""
      rest = line
      while (match(rest, /\$[A-Za-z_]*\$/)) {
        if (inbody == 0) {
          out = out substr(rest, 1, RSTART - 1)
          inbody = 1
        } else {
          inbody = 0
        }
        rest = substr(rest, RSTART + RLENGTH)
      }
      if (inbody == 0) { out = out rest }

      print out
    }
  ' "$1"
}

status=0

for file in "$@"; do
  if [ ! -f "$file" ]; then
    echo "staging-scan.sh: pending migration file not found: ${file}" >&2
    exit 2
  fi

  # Assigned in two steps on purpose: a failure inside preprocess() must kill
  # the script, and it would be swallowed by the `|| true` that grep's
  # no-match exit status requires.
  preprocessed="$(preprocess "$file")"
  hits="$(printf '%s\n' "$preprocessed" | grep -n -i -E "${GREP_ARGS[@]}" || true)"

  if [ -z "$hits" ]; then
    echo "  ok   ${file}"
    continue
  fi

  status=1
  echo ""
  echo "  FLAG ${file}"
  printf '%s\n' "$hits" | while IFS= read -r hit; do
    [ -n "$hit" ] || continue
    lineno="${hit%%:*}"
    # Report the ORIGINAL line, not the preprocessed one: the operator is going
    # to open this file at this line number and expect to see what is printed.
    original="$(sed -n "${lineno}p" "$file" | tr -d '\r')"
    echo "       line ${lineno}: ${original}"
  done
done

if [ "$status" -eq 0 ]; then
  echo ""
  echo "staging-scan.sh: scanned $# pending migration file(s); no destructive shape found."
  exit 0
fi

echo ""

if [ "$allow_destructive" = "true" ]; then
  echo "OVERRIDE IN EFFECT — allow_destructive was checked."
  echo ""
  echo "The shapes above were found and are being applied anyway, because a human"
  echo "asked for that from the Actions tab. They are printed above so the override"
  echo "is on the record."
  exit 0
fi

echo "STOPPING. NOTHING HAS BEEN APPLIED."
echo ""
echo "This migration removes or renames something an installed build may still read."
echo "Staging is what the TestFlight builds on real phones talk to, so applying this"
echo "would break those builds the moment it lands — not at the next release."
echo ""
echo "Two ways forward:"
echo "  1. Apply it by hand, at a moment of your choosing, with those builds in mind;"
echo "     or"
echo "  2. re-run this pipeline from the Actions tab (Run workflow) with"
echo "     allow_destructive CHECKED, once you have read the lines above."
exit 1
