# The Production button: your steps

Only you do these steps. A chat never starts, approves or runs the button again.
Each step says what to do, what you must see, and what to do if you do not see it.
Production takes test money only (D-20261111-3).

## A. Make a place for the new project

1. In Supabase, open the retired production project. Click Project Settings, General, Pause project.
   - You see: the project shows "Paused". The free plan allows two active projects: staging and the new one.
   - If not: Supabase says why. Do not delete the retired project.

## B. The new Supabase project

2. Click New project. Use the name `brazos-production` and the same region as staging. Keep the Data API on, with the public schema.
3. Make a strong database password. Save it in your password manager now. You cannot see it again.
   - You see: the new project opens and shows "Healthy" after a few minutes.
   - If not: wait 5 minutes, then reload the page.
4. Click Project Settings, General. Copy the Project ID (20 small letters). This is the ref.
5. Click your account picture, Account preferences, Access Tokens, Generate new token. Name it `production button`. Copy it.
   - A new token is scoped (it gets only the access that you select). Resource access: Project, `brazos-production` only. Set these 10 rows, and no other:
     Read-write: Project Settings, Auth Config, Edge Functions, Edge Function Secrets.
     Read: API Keys, API Key Secrets, Data API Config, Database Config, Connection Pooling, Storage Config.
   - A token cannot be changed after you make it. If a row is missing, make a new token and delete the old one. Run 43369079390 stopped with HTTP 403 at "Function secret STRIPE_SECRET_KEY" because the row Edge Function Secrets was missing. The token in use since 2026-11-13 is `production button 2` (run 43435759116: PASS); the first token is deleted.
   - You see: a token that starts with `sbp_`.

## C. Stripe (test mode only)

6. In Stripe, click the account name, then Create sandbox. Name it `Brazos production`.
7. In the sandbox, open Connect and complete the platform setup that Stripe shows.
   - You see: the Connect overview page, with no setup task open.
8. Click Developers, API keys. Copy the Secret key. Also copy the Publishable key for step 21.
   - You see: the secret key starts with `sk_test_`. If it starts with `sk_live_`, you are not in the sandbox. Stop and switch to the sandbox.

## D. Twilio (phone sign-in)

9. Use a funded Twilio account. A trial account sends codes only to numbers you verified.
10. On the Console home page, copy the Account SID and the Auth Token.
11. Click Verify, Services, Create new. Name it `Brazos`. Copy the Service SID (it starts with `VA`). If a service `Brazos` exists already, use it; do not make a second one.

## E. GitHub: the approval rule and the secrets

12. The repository must be public. On GitHub Free, Pro and Team, the approval rule works only on a public repository. On a private one the button stops at its first check.
13. In the repository, click Settings, Environments, New environment. Use the name `production`.
14. Set these rules:
    - Required reviewers: on. Add yourself.
    - Prevent self-review: off. You start the run and approve it yourself.
    - Allow administrators to bypass configured protection rules: off.
    - Deployment branches and tags: Selected branches and tags. Add `mainexpo`.
    - Custom rules (for example `TestSprite`): all off. A custom rule lets another company's app hold or pass a production step. On 2026-11-13 `TestSprite` was on; the owner turned it off.
    - You see: "1 protection rule" or more under the environment name.
15. In the same environment, click Add environment secret seven times. Use these names exactly:

| Secret | Value |
|---|---|
| `SUPABASE_ACCESS_TOKEN` | the token from step 5 |
| `SUPABASE_PROJECT_REF` | the ref from step 4 |
| `SUPABASE_DB_PASSWORD` | the password from step 3 |
| `STRIPE_SECRET_KEY` | the `sk_test_` key from step 8 |
| `TWILIO_ACCOUNT_SID` | from step 10 |
| `TWILIO_AUTH_TOKEN` | from step 10 |
| `TWILIO_VERIFY_SERVICE_SID` | from step 11 |

## F. Press the button

16. Click Actions, then Production in the left list, then Run workflow. Keep the branch `mainexpo`. Keep `allow_destructive` empty. Click Run workflow.
    - You see: "lint + tests" and "build the database locally (no secrets)" run. Then "plan (changes nothing)" shows Waiting.
    - If a job is red: open it. Its last lines say why. Fix that, then press again.
17. Click Review deployments, select `production`, click Approve and deploy.
18. When the plan job ends, open the run's Summary. Read the PRODUCTION PLAN table.
    - You see: the files the button will apply, and the last line "PRODUCTION PLAN: PASS". On the first press, every file is new. Files the scan flags are listed and allowed, because the database is empty.
    - If you see FAIL: the sentence in that row says what to do. Do the step, then press again.
19. Then "apply (second approval)" shows Waiting. Approve it only if the plan is what you expect. If not, click Reject. Nothing changed. Approve it within one day of pressing the button, because the local fingerprint the apply job needs is kept for one day; after that, press the button again.
20. When the apply job ends, read the PRODUCTION table in the Summary.
    - You see: every row PASS, and the last line "PRODUCTION: PASS".
    - If you see FAIL: read the sentence in the first FAIL row. Rows after it that say "This check did not run" only follow from it. Do what the first sentence says, then press again.

What the table means: each row is one check that ran. PASS means the button saw the right answer. It never shows a key, a password or a code. Pressing again is always safe: each step reads first and changes only what is different. If something changed between your two approvals, the apply job stops before it changes anything. Press again.

## G. After the first PASS

21. The app build needs three values. The table does not show them. Copy them yourself:
    - `EXPO_PUBLIC_SUPABASE_URL`: `https://` + the ref + `.supabase.co`
    - `EXPO_PUBLIC_SUPABASE_KEY`: Supabase, Project Settings, API Keys, the Publishable key named `default`
    - `EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY`: the `pk_test_` key from step 8

    Put them on expo.dev: the project, Environment variables, environment `production`. On 2026-11-13 that environment still held the retired project's URL: replace all three values in one sitting, never the URL alone.
22. Done 2026-11-13: the ref is in the build gate (`PRODUCTION_REF` in `scripts/supabase-ref.mjs`, used by `scripts/eas-build-pre-install.mjs`). A production build against any other project stops at the gate.
23. Receipts: until you set `RESEND_API_KEY` and `RECEIPT_FROM` on the project, each receipt is marked "skipped", with the reason, and logged. No email goes out.
24. The Stripe sandbox now has a webhook to `https://<ref>.supabase.co/functions/v1/stripe-webhook`. Do not change it. If you delete it, press the button again.

## H. Later

- If you change or delete a Supabase key, press the button again.
- On the free plan, Supabase pauses a project after a week with no use. If the table says "The production project is not running", restore it in the dashboard, then press again.
- A migration the scan flags on a database that is not empty stops the plan. Read the file. If you agree with it, press again with `allow_destructive` checked.

## I. Optional steps

- Legacy keys: if the table says "legacy keys: yes, active", you can switch them off. In Supabase, click Project Settings, API Keys, Legacy API keys, and disable them. Press the button again. The table must still say PASS. If not, switch them on again and press again.
- Your chat rules: change line 6 of `CLAUDE.md` to say that production changes only through this button, which only you start and approve. In `.claude/settings.json`, add deny lines for the new ref and for `*gh workflow run*`, `*gh run rerun*`, `*pending_deployments*` and `*/dispatches*`. A chat may not edit these files, so this step is yours.
