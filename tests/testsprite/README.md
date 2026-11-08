# TestSprite contract tests (the server boundary, from outside)

One file per server function in `supabase/functions/`. Each proves, against staging and with no secret, that the function refuses a missing or bogus token, a wrong method and a bogus body (a 4xx, never a 200 or a 404), that stripe-webhook refuses every bad signature with a 400, that connect-return answers only its constant bounce, and that no response carries a secret-shaped string. Happy paths need a staging test user: out of scope for v1.

Run: GitHub, Actions, "TestSprite", Run workflow (`.github/workflows/testsprite.yml`); it also runs on a push to `mainexpo` that touches `supabase/functions/`. TestSprite runs each file top to bottom; the closing `assert not failures` is the verdict.

Add one: copy the nearest file, keep its `BASE_URL` line, add `check(...)` lines, then `testsprite test create --type backend --project <id> --name "<function>: contract" --code-file tests/testsprite/<function>.py`. An edit to an existing file goes up with `testsprite test code put <test-id> --code-file <file> --expected-version <n>`. `npm test` (`tests/testspriteGate.test.mjs`) keeps one file per function.
