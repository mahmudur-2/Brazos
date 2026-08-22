## 2026-08-22 — SERIF RETIRED APP-WIDE + G-001 — COMPLETE, ONE COMMIT SKIPPED

Four dispatched commits; **three landed, one was skipped on its own stated
continue-path**, plus this record. `fd00e1a` ignores `.audit-scratch/` and
commits the operator's Emerald complaints, `b9b5879` retires every serif,
`fc5a78d` closes G-001. Bare `npm run verify` exit 0 at baseline and after
every commit — **suite 846 → 846 → 846 → 846 pass / 0 fail / 0 skipped / 0 TS
errors**. Zero net delta, and not because nothing moved: the Playfair fence was
INVERTED in place (−1 +1) and the F-ERRMSG sweep was WIDENED rather than
added to. `git` is the authority on what reached the remote.

**No guard, hook, deny rule, fence or lint rule was weakened, disabled,
narrowed or granted an allowance.** Two fence CONSTANTS were updated because
this run deliberately changed the facts they recorded; both are named below.
One fence was widened. No fence logic and no fence scope changed.

### THE APP HAS NO SERIF — current state, supersedes every earlier font note

`fonts.display` on BOTH token surfaces now resolves to the platform system
sans — the family body copy already used. There is no `assets/fonts/`, no
`.ttf`, no `useFonts`, no expo-font import, and no `Georgia` / `serif` stack
anywhere, LaunchScreen's wordmark included. Operator decision of 2026-08-22,
reversing that morning's Playfair bundling in full AND retiring the platform
serif that predated it. `docs/emerald-v2/DECISIONS.md` D5 carries all three
notes in order; nothing was deleted from it.

* **`fonts.display` still exists and is still the one lever.** ~60 screen
  styles name it (heroHeadline, sectionTitle, statusWord, earningsAmount…),
  so repointing the token moved all of them and NO screen file was edited for
  the face. Do not delete the token to "clean up" the duplication with
  `fonts.body` — that duplication is the point.
* **Weights are load-bearing again.** A bundled file makes `fontWeight` inert
  on iOS; with nothing bundled it selects the face. Restored to their exact
  pre-bundling values and no others: `type.display` 800, `type.h1` 800,
  `type.h2` 700, `typography.title` 800, `typography.heading` 700. A heading
  that renders at normal weight means one of these was dropped.
* **SIZES ARE UNTUNED AND THAT IS DELIBERATE.** No fontSize, lineHeight or
  letterSpacing changed. The sans sets NARROWER than Georgia, so strings will
  wrap differently from every device capture on record. Two dials are waiting
  for the operator, neither guessed at by this run: the `letterSpacing: -1` on
  the six heading roles (measured against a serif), and HomeScreen's
  cap-height ladder — `GEORGIA_CAP_RATIO`, `MASTER_SERIF_CAPS`, `serifSize()`
  are now the NAMES OF FROZEN ARITHMETIC, not claims about the face in use.
* **Fence: INVERTED, not deleted.** `tests/themeTokens.test.mjs`'s Playfair
  test now fails if a serif family name or a bundled `.ttf` returns. Four
  halves; proven red three ways before being kept (a heading role repointed at
  `'Georgia'`, a screen repointed at `'PlayfairDisplay-Bold'`, a probe `.ttf`
  under `assets/`). Its scan is an ALLOW-LIST over every `fontFamily:` in the
  tree, so it also rejects a re-added `fonts.displayBold`.
* Money colour, money formatting, cents arithmetic and every payment-state
  string are byte-unchanged — verified by scanning the changed lines, not
  assumed.

### G-001 — raw storage error text can no longer reach an alert (`fc5a78d`)

`lib/storage.ts`'s `uploadAsset()` returns the service's own StorageError
unwrapped; `ui/primitives/MediaUploader.tsx` extracted its text and
`screens/PostJobScreen.tsx` rendered it verbatim through `alertAsync` on two
live mounts. Wrapped at the SEAM with the existing `userMessage()` — no new
helper, no new copy, and a no-error failure still reads exactly as it did.

It survived because F-ERRMSG's `dirs` were `['screens','components','hooks']`
and `ui/` sat one directory outside. `'ui'` is added WITH `{ recursive: true }`
— a widening, and it closes G-006 at the same time. Widening surfaced no other
violation under `ui/`. Proven red: reverting only the wrap fails the widened
sweep by file name, which also proves the recursive walk (the file is in
`ui/primitives/`).

### SKIPPED — ChatScreen's floating-nav clearance (dispatched commit 4)

Skipped on the dispatch's own continue-path. **The carry-forward's premise is
false on the shipped target, and the classification it asks for is not
decidable from the layout.** Nothing in `screens/ChatScreen.tsx` was changed.

1. **It is not a double count. On iOS it is not a count at all.**
   `screens/ChatScreen.tsx:983` puts `paddingBottom: navClearance` on a
   `KeyboardAvoidingView` whose `behavior` is `'padding'` on iOS (`:984`).
   RN 0.81.5's padding branch renders
   `style={StyleSheet.compose(style, {paddingBottom: bottomHeight})}`
   (`node_modules/react-native/Libraries/Components/Keyboard/KeyboardAvoidingView.js:279`),
   and `composeStyles` is documented as "style2 will override any styles in
   style1". `bottomHeight` is `0` whenever the keyboard is closed (`:235`), so
   the clearance is OVERRIDDEN TO ZERO at every moment on iOS. `navClearance`
   appears exactly twice in the file — the hook at `:103` and that one
   application — so there is no second reservation to remove. On Android/web
   `behavior` is `undefined`, the default branch uses the style verbatim, and
   it does apply; Android is deferred and web is frozen.
2. **The column is neither cleanly pinned nor cleanly scrolling** — the
   dispatch's stated skip condition, met literally. The KAV (`:976`–`:1214`)
   contains BOTH a `flex: 1` FlatList (`:992`) AND a bottom element in normal
   flow beneath it (`:1126`–`:1213`), and WHICH of them is last above the pill
   is state-dependent: composer, locked notice, blocked notice, or — when
   `messagingUnlocked === null` (`:1151`) — nothing at all, which makes the
   list last and the scrolling rule the right one.
3. **The repo contradicts the carry-forward.** `screens/ChatScreen.tsx` is
   ALREADY on a roster: `tests/layout.test.mjs:235`, the scrolling-surface
   list, whose own comment records that `home(7)` considered this case and
   kept it — "this list is scrolling surfaces **and the chat composer** only",
   "the composer when there is one". Moving it would mean REMOVING it from
   that roster, which is a fence SCOPE change, not a constant update.

Any of the three alone would justify the skip. What would settle it is a
device: whether the pill's footprint is already reserved by the tab bar's
normal-flow layout is the question underneath all of it, and `tabBarStyle`
(`ui/primitives/BottomNav.tsx:369`) sets no `position: 'absolute'` while
`useFloatingNavClearance()`'s docblock and `home(7)`'s fence comment describe
the geometry in opposite terms.

### Fence constants updated (each a fact this run changed)

* `tests/themeTokens.test.mjs` — the Playfair fence, inverted in place. Old:
  the three heading roles must equal `'PlayfairDisplay-ExtraBold'` /
  `'PlayfairDisplay-Bold'`, `type.title.fontFamily` must equal `'Georgia'`,
  the two `.ttf`s must exist and carry the TrueType magic, App.tsx must call
  `useFonts`. New: every role must name NO family, the restored weights are
  pinned as values, no `fontFamily:` in the tree may name anything but the
  tokens, and no font file may exist.
* `tests/mediaUploader.test.mjs` — the failure-safety shape assertion. Old:
  `onUploadError?.(error?.message ?? 'Upload failed. Please try again.')`.
  New: `onUploadError?.(userMessage(error, 'Upload failed. Please try again.'))`.
  The guard shape it exists for — early return, no `items` mutation, ordering
  against the upload call — is untouched.

### Device checks OWED (operator, physical device only)

- **Every heading's weight.** 28/26pt must read ExtraBold-ish and 21pt Bold in
  the system sans. These are now `fontWeight`-driven; a heading that looks
  normal means a weight was lost, and no test can see it.
- **Wrapping, everywhere.** The sans sets narrower than Georgia at the same
  point size. Home's hero, section titles, `statusWord`, `earningsAmount` and
  every card title will wrap differently from the 2026-08-22 dark captures.
  Re-tuning sizes is the operator's call; this run deliberately changed none.
- **The two dials.** Whether `letterSpacing: -1` still reads right on a sans,
  and whether HomeScreen's Georgia-derived ladder still lands where the
  masters want it.
- **Cold start.** Launch layer → Home with no font flash and no hold: there is
  nothing left to load, and the gate now holds only for `sessionReady`.
  Airplane-mode cold start must still reach the Terms retry screen.
- **LaunchScreen's wordmark** in the system sans at 30pt / +6 tracking.
- **The chat composer's real footprint** — see the skip above.
- **A failed job-photo or job-video upload** must now show the mapped sentence,
  never service text.

