# Emerald correction pass — independent verification, 2026-08-19

Adversarial verification of the eleven `emerald(N)` commits before they are
pushed. Written by a run that did NOT make them and did not read the chat log
that produced them: every verdict below is derived from `git log`, `git diff`
and the source at HEAD.

* Range under audit: `de048e9..HEAD` (`de048e9` = `fidelity(7)`, the last
  pushed commit; `origin/mainexpo` is still at it).
* HEAD at audit start: `098e108` (`emerald(11)`), branch `mainexpo`, tree clean.
* Baseline: bare `npm run verify`, stdout redirected, exit read from `$?` —
  **exit 0 · 775 pass · 0 fail · 0 skipped · 7 suites.** That is the floor.

---

## OPERATOR MUST READ

Nothing in this pass is incompatible with anything else in the repository.
There is no cross-run collision, because **only one run landed** — see below.
The adversarial verification of the eleven decisions follows in audit 2.

---

## Audit 1 — cross-run reconciliation

**Result: clean. Only the emerald run is present in the range.**

`git rev-list --count de048e9..HEAD` = **11**, and all eleven subjects begin
`emerald(`. `git log --all --grep="^light("` returns nothing: **no light-mode
parity run landed anywhere in this repository, on any ref.** The hypothetical
collision this audit exists to find does not exist, so there is nothing to
reconcile and no test in one run contradicting a test in another.

Prefix census over the whole Prestige campaign (`715ddf8~1..HEAD`), for the
record:

|Prefix|Count|Range|Relationship to this audit|
|-|-|-|-|
|`prestige(0a)`–`(7z)`|35|`715ddf8..04410c2`|Below the range. Not audited.|
|`fidelity(1)`–`(7)`|7|`fdb379f..de048e9`|Below the range; `de048e9` is its LAST commit and the audit BASE.|
|`emerald(1)`–`(11)`|11|`4af3a35..098e108`|The range under audit.|
|`light(1)`–`(7)`|**0**|—|Never landed.|

The one adjacency worth naming: `fidelity` is the emerald run's immediate
predecessor, and emerald deliberately reverses several fidelity decisions (the
emerald/red toggle, the flat clearance token, the seven scrims). That is **not**
a blind collision — the emerald run read the fidelity work, names it as the
thing it is reversing, and records every reversal in
`docs/mockups/PRESTIGE_RUN_REPORT.md` §(d). The two runs are sequential and
aware of each other, which is exactly the property the hypothetical light run
would have lacked.

**Light-mode values:** because no light run restored anything, there is no
"deliberately restored light value subsequently overwritten" case. Independently
verified that the emerald pass left light alone where it claims to
(§ Audit 2, D5 / D6 / D7 / D8 / D10) rather than inferring it from the absence
of a light run.

---

