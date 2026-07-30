# Build and runtime results

Environment observed:

- Windows / PowerShell
- Node.js 24.18
- npm 11.16
- Expo 54.0.36
- React Native 0.81.5
- React 19.1.0
- TypeScript 5.9.3

The repository instruction requiring review of the exact Expo SDK 56
documentation was followed before source edits. The installed app remains on
Expo SDK 54; upgrading it was outside this pass.

## Final commands

| Check | Command | Result |
|---|---|---|
| TypeScript | `npm run typecheck` | PASS |
| Strict unused-code check | `npm run lint` | PASS |
| Automated tests | `npm test` | PASS, 6/6 |
| Installed dependency tree | `npm ls --depth=0` | PASS |
| Expo compatibility | `npx expo install --check` | PASS, dependencies up to date |
| Production export | `npx expo export --platform all` | PASS |
| Diff whitespace | `git diff --check` | PASS |
| Local HTTP | request to `http://127.0.0.1:8081/` | PASS, HTTP 200 |

Final export output was written outside the repository to:
`C:\Users\mdmah\AppData\Local\Temp\brazos-hardening-export-final-20260730`.
It produced web JavaScript, Android Hermes bytecode, iOS Hermes bytecode, and
73 assets. Nothing was deployed.

## Runtime smoke test

VERIFIED read-only in the in-app browser:

- authenticated Home rendered with the corrected `Open jobs` label;
- the self profile rendered, using the pre-migration compatibility path;
- job detail and bid data rendered with explicit projections;
- the job detail used `Similar open jobs`;
- Messages inbox rendered;
- the prior web notification cold-start runtime error did not recur.

No job/bid/review/message mutation was submitted, no chat was opened (to avoid
marking data read), no admin state was changed, and no production data was
touched.

Remaining console warnings:

- Expo reports push-token-change listening is not fully supported on web.
- React Native Web reports deprecated shadow-style and `pointerEvents` props.

They did not prevent the tested flows or export. They were not addressed because
the first is upstream/platform behavior and the styling warnings require a
broader UI cleanup without a verified functional failure.

## Sandbox note

The first sandboxed export attempt could not execute `hermesc.exe` due to local
process permissions. The identical command was rerun with explicit permission
and passed. This was an environment restriction, not an application build
failure.
