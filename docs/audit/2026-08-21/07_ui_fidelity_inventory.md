# 07 — UI fidelity inventory

**Purpose of the hashes:** the audit prompt is explicit — *"Do NOT attempt to measure pixel values or derive spacing constants from the masters — the master set was replaced and prior constants are stale; the hashes exist so future runs can detect replacement."* This file is therefore a **fingerprint record**, not a measurement.

---

## Summary

| Fact | Value |
|-|-|
| Files in `docs/mockups/` | **46** (44 PNG + 2 Markdown) |
| Total bytes | **68,053,581** (~64.9 MiB) |
| Aspect classes | 3 — `941×1672` (32), `852×1846` (10), plus `853×1844` and `863×1822` (1 each) |
| Byte-identical duplicates | **none** ✅ |
| Masters with no implementing screen | **0** ✅ |
| Screens with no master | **22 of 52 (42%)** |
| **Manifest names that do not exist on disk** | **12 — P2 docs drift** |
| Files on disk the manifest never names | **1** |
| "Rendered code frame" on Live Nearby | **NOT REPRODUCIBLE from this tree — see §5** |

---

## 1. Full file inventory

`docs/mockups/`, sorted as on disk. SHA-256 of file bytes; dimensions read from the PNG IHDR chunk.

| file | dimensions | bytes | sha256 |
|-|-|-|-|
| `10_job_post_pg2_dark.png` | 941×1672 | 1,624,404 | `d0b6628baf1113fa59aab2e1413b0f2587fb74d16198e08d480eb410e1eb4d90` |
| `11_job_filter_worker_dark.png` | 941×1672 | 1,612,140 | `ab95a2a27df2c3442e4638667271f90841652e755c9070c5e46c626718899949` |
| `12_job_withinradius_worker_dark.png` | 941×1672 | 1,333,309 | `12bf3708765590d8720c19f0ee6aac6abc04fa3e665b528faee05ca33579bbfc` |
| `13_individual_skillmatch_worker_dark.png` | 941×1672 | 1,806,748 | `87bf3d7cd8790758dcd460a748b829d9a13de26a4913b12448c733a4ea88e0ea` |
| `14_track_worker_client_dark.png` | 941×1672 | 1,488,361 | `b81f84c41369aa635a60d550bf841df0093432579ff6a2dd77c3f188a2f9f091` |
| `15_track_worker_client_pg2_dark.png` | 941×1672 | 1,649,291 | `3ac6325a66cd96e4d710f44d3959fa0ed2e8514e262d9eb249994a6a4c5f8045` |
| `16_job_detail_clientview_dark.png` | 941×1672 | 1,753,492 | `8acdf77937b236461f4a11819d9a47332de6a4b3a54c6a7c82242a9ef57178ff` |
| `17_job_detail_clientview_pg2_dark.png` | 941×1672 | 1,521,681 | `e76cb8d1eb6053549bb4551be24cbe58daf7f561501bdc313a969bacf8d478cc` |
| `18_viewprofile_clientview_dark.png` | 941×1672 | 1,687,986 | `41281f9f6b76f8f303623b4bc9becc108072b65bee422bdd05bd4276d99f918a` |
| `19_messages_clientview_dark.png` | 941×1672 | 1,512,473 | `2faf00be636c78f25aa209e493c4792534c2fdc5621a3167223ca46cd4efe656` |
| `1_find_help_dark.png` | 941×1672 | 1,546,984 | `2fc3d4c85b37e8f53bc31aaacfef5e995870fc4b10bf8558abb0f2b5f98b38b6` |
| `20_featurework_workerview_dark.png` | 941×1672 | 1,785,809 | `c999846e6b72599c2a98bf2c5fe736b180718315ad841e152cf04e8a69fd083b` |
| `22_savedworkers_clientview_dark.png` | 852×1846 | 1,097,496 | `15d027ebf32974f5a2b13dd18c75c3751e41121b6ee93c9f0c2c14e49ffc3449` |
| `23_availability_workerview_dark.png` | 852×1846 | 1,309,759 | `43c7c60dec470bd243bfd233fae3a256c0a6a0ee1d73017fea68e64df6ce6046` |
| `24_availability_workerview_pg2_dark.png` | 852×1846 | 1,523,668 | `94c95e58e8525e4024785ba17c9ee0c6dc99e4a4e7434f6bf2242991dd8e244a` |
| `25_earnings_dark.png` | 852×1846 | 1,449,696 | `9352f7a20b2e5f569e7aa5e02f06d6728535ef87d1aba41fd7dbc0c84c04276b` |
| `26_notifications_dark.png` | 852×1846 | 1,652,614 | `72fc21c709de9776df413ede72a2925a60f9b7adf5d8cee84c87737f7bf3f35d` |
| `27_profile_reviews_dark.png` | 852×1846 | 1,537,503 | `2a007cd9edfd7151e724252e2b78425a5f389cfb955f244f600da1198fac535c` |
| `29_editprofile_pg2_dark.png` | 852×1846 | 1,528,273 | `23a6b6a71d8cd163d3012bb9869d1828fbf8158d16ba6f3af627bbfc25efae2e` |
| `2_sign_up_dark.png` | 941×1672 | 1,757,138 | `a6df44fb8109a0b77cb5a42146c342e2c55e0f58fa28b38330990d7c5388b711` |
| `30_editprofile_dark.png` | 852×1846 | 1,497,611 | `6b18bca9f175ee04ef1eeb5edd1797ba30a606e54db9a5e44a592f1e3bb86554` |
| `31_deleteacc_dark.png` | 852×1846 | 1,549,841 | `19c46d4cfed4ba468cc43de65c680edb697a39ac3028b320684ccd579884f211` |
| `32_deleteacc_pg2_dark.png` | 852×1846 | 1,293,659 | `a612cc42f34554569e05ab56a80f41d961aef1182ffc2dab3d0e283b81d3047e` |
| `3_sign_up_2ndpg_dark.png` | 941×1672 | 1,460,552 | `82bc7df1b0b930c707cf9c9141f6e146ae44b91c74ede6ec633209d4480d9652` |
| **`43_worker_home_dark.png`** | 941×1672 | 1,319,629 | `ae15052b7508cb19c138f55e527b8e741ed33968588510d7721b3b0dca8b6e29` |
| **`44_customer_home_dark.png`** | **853×1844** | 1,651,366 | `c90253ba2f66376c51d0ee79781788c3971c7d47c1d47cc8f4b62533292e0a70` |
| `4_sign_up_dark.png` | 941×1672 | 1,599,332 | `91fe2e69c95c71b1642baafc82fd3d69919c9f4aca7f2709a4d3137736348e6b` |
| `5_view_profile_dark.png` | 863×1822 | 1,437,448 | `2f2a9f8eb1cd287abb8febf9d7601b0272bf1c8ae9f1cf9897a4b6ecd2de000b` |
| `6_job_finished_worker_dark.png` | 941×1672 | 1,681,067 | `e2f7ce9e6bf9c3539512d2335d69c0a6883afb047e08a080fa7a07b149951f67` |
| `7_job_finished_worker_pg2_dark.png` | 941×1672 | 1,405,797 | `728e1d6228a2df32e8f5d2f322ca475563ce0cb8c7adb8bbf58464fbf0621468` |
| `8_jobnbids_dark.png` | 941×1672 | 1,665,927 | `59636371e3ede7749d5d78c224f5d72a55307ef2f6fbbc3e267320dd1852c154` |
| `9_job_post_dark.png` | 941×1672 | 1,955,848 | `74085618b66e94bddf73e9f1a79df372b7efebda3fae9344806f30c131b97361` |
| `Compare_Bids_Dark.png` | 941×1672 | 1,477,206 | `aa2ba42562200c738be0538b608c00ff551465dc239164c0a319cdbc7c9164ba` |
| `Discover_Map_Dark.png` | 941×1672 | 1,699,041 | `c06ba753f816bc59cb6d70bfa6401597b672d1a6ec3d1b40d541c868de5885b1` |
| `Messages_Inbox_Dark.png` | 941×1672 | 1,167,551 | `4c8a86ea0e3a697d6e515425489a4efc68bc2d59744e6dfd38c27af7ecba23b4` |
| `My_Jobs_Active_Dark.png` | 941×1672 | 1,451,207 | `ef33fadeb7bf7629c2c074dee081ecee65fca9a016b09bac09f61f3388d20a65` |
| `My_Jobs_Closed_Dark.png` | 941×1672 | 1,517,336 | `779373c23ab65b4b74c03928dbf22efb0a8f6b00b062d47d978770447ea842f8` |
| `My_Jobs_In_Progress_Dark.png` | 941×1672 | 1,605,784 | `1065796cff190c721c79af453dd69713887b3f1693d1706ee4b0044dbdace8ec` |
| `Notifications_Feed_Dark.png` | 941×1672 | 1,581,430 | `c0ee487e70947c0d587c45fb513409dc01f2876b9842d2c4eb90ea7fa48bcb00` |
| `Notifications_Preferences_Dark.png` | 941×1672 | 1,697,618 | `c8d38eb58c94329e77c2a0e248086ec7d0ca851697143c3fd262ea035b2bb597` |
| `Payment_Methods_Dark.png` | 941×1672 | 1,611,869 | `260b21c0e74118a7127f44a65c30b0d5e0e1e5f5ff46f0ef4dd440ac6918b360` |
| `Profile_Account_Safety_Dark.png` | 941×1672 | 1,218,573 | `12047dff639e251e419d9a5dc8f179da2b7d0f1b0722cad19e42ceee574a744a` |
| `Profile_Details_Dark.png` | 941×1672 | 1,571,383 | `3f9b7d0fbcab10946b5f7c372d7dc19103766109f95d7d810940bf6af918011d` |
| `Profile_Past_Work_Settings_Dark.png` | 941×1672 | 1,548,117 | `1d49815792deef1d2a1360cac2957825d848fc9f49548aa82f751066feb003fb` |
| `BRAZOS_MOCKUP_MANIFEST.md` | — | 40,096 | `f2eab9262237df863b0b8fb0ef9554df0fe2e165d51ad5c2cb0bf3c82c44f3d2` |
| `PRESTIGE_RUN_REPORT.md` | — | 169,468 | `209b234314787396bc46ed6e93a35bf40d284ff14a27bf87f4c1d549c98d7216` |

### Two observations from the dimensions alone

1. **`44_customer_home_dark.png` is `853×1844` — a class of one.** Every other 852-family master is exactly `852×1846`. That one-pixel-wider, two-pixel-shorter outlier is the flagship the last eight commits were measured against, and it is the file the run log repeatedly calls "the replaced master." Its uniqueness is itself the fingerprint: a future run comparing against `853×1844` is looking at the same file this audit saw.

2. **`43_worker_home_dark.png` is still `941×1672`.** So the two flagship homes are in **different aspect classes** — Customer Home was replaced with a new capture, Worker Home was not. Any measurement carried from one to the other is invalid, and the run log's cap-height reversals (`home(16)` → `home(26)`) are exactly that mistake being corrected.

---

## 2. Master → screen mapping

**44 of 44 masters map to an implementing surface (100%).** No master is orphaned.

| master | implements |
|-|-|
| `44_customer_home_dark.png` ★ | `screens/HomeScreen.tsx` |
| `43_worker_home_dark.png` ★ | `screens/WorkerHomeScreen.tsx` |
| `1_find_help_dark.png` | `screens/WorkerSearchScreen.tsx` |
| `Discover_Map_Dark.png` | `screens/MapScreen.tsx` |
| `12_job_withinradius_worker_dark.png` | `screens/WorkerResultsScreen.tsx` |
| `13_individual_skillmatch_worker_dark.png` | `screens/WorkerResultsScreen.tsx` |
| `11_job_filter_worker_dark.png` | `components/JobFilterSheet.tsx` |
| `9_job_post_dark.png` | `screens/PostJobScreen.tsx` |
| `10_job_post_pg2_dark.png` | `screens/SubmitBidScreen.tsx` (manifest: *"filename is misleading"*) |
| `8_jobnbids_dark.png` | `screens/ClientJobDetailScreen.tsx` |
| `16_` / `17_job_detail_clientview*` | `screens/ClientJobDetailScreen.tsx` |
| `14_track_worker_client_dark.png` | `screens/TrackWorkerScreen.tsx` |
| `15_track_worker_client_pg2_dark.png` | `screens/ApproveOrDisputeScreen.tsx` |
| `6_` / `7_job_finished_worker*` | `screens/WorkerJobScreen.tsx` |
| `Compare_Bids_Dark.png` | `screens/CompareBidsScreen.tsx` |
| `Messages_Inbox_Dark.png` | `screens/MessagesInboxScreen.tsx` |
| `19_messages_clientview_dark.png` | `screens/ChatScreen.tsx` |
| `5_view_profile_dark.png` | `screens/WorkerProfileScreen.tsx` (deleted/away state) |
| `18_viewprofile_clientview_dark.png` | `screens/WorkerProfileScreen.tsx` (active) |
| `27_profile_reviews_dark.png` | `screens/ProfileReviewsScreen.tsx` |
| `20_featurework_workerview_dark.png` | `components/PortfolioPicker.tsx` |
| `23_` / `24_availability_workerview*` | `screens/ServicesPricingScreen.tsx` |
| `25_earnings_dark.png` | `screens/EarningsScreen.tsx` |
| `26_notifications_dark.png` | `screens/NotificationsScreen.tsx` |
| `Notifications_Feed_Dark.png` | `screens/NotificationsScreen.tsx` |
| `29_` / `30_editprofile*` | `screens/ProfileDetailsScreen.tsx` |
| `Profile_Details_Dark.png` | `screens/ProfileDetailsScreen.tsx` |
| `22_savedworkers_clientview_dark.png` | `screens/SavedWorkersScreen.tsx` |
| `Profile_Past_Work_Settings_Dark.png` | `screens/ProfileScreen.tsx` |
| `Profile_Account_Safety_Dark.png` | `screens/AccountSafetyScreen.tsx` |
| `Payment_Methods_Dark.png` | `screens/PaymentMethodsScreen.tsx` |
| `Notifications_Preferences_Dark.png` | `screens/NotificationSettingsScreen.tsx` |
| `31_` / `32_deleteacc*` | `screens/DeleteAccountScreen.tsx` |
| `My_Jobs_Active_` / `_In_Progress_` / `_Closed_Dark.png` | `screens/MyJobsHubScreen.tsx` (one screen, three tab states) |
| `2_sign_up_dark.png` | `screens/WelcomeScreen.tsx` |
| `3_sign_up_2ndpg_dark.png` | `screens/CreateAccountScreen.tsx` |
| `4_sign_up_dark.png` | `screens/EmailCreateAccountScreen.tsx` |

### 2.1 Two masters that must never be built — NEEDS OPERATOR DECISION

`23_availability_workerview_dark.png` and `24_availability_workerview_pg2_dark.png` are mapped above to `screens/ServicesPricingScreen.tsx`, which is the honest reading: that screen implements the *services & pricing* half. But the filenames say **availability**, and the audit prompt's invariant list is explicit — **no worker availability calendars or scheduling calendar UI**.

`02_invariants.md` confirms no calendar exists in any of the 52 screens, which is the correct outcome. But it means **the master set contains two designs that the product invariant forbids implementing**, and a future run told to "close the gap to the masters" would build them.

The fix is a note in the manifest, not code. Owner class OPERATOR.

---

## 3. Screens with no master — 22 of 52 (VERIFIED)

```
screens/AdminReportsScreen.tsx        screens/JobDetailScreen.tsx
screens/AppearanceScreen.tsx          screens/LaunchScreen.tsx
screens/AuthFlow.tsx                  screens/LegalDocumentScreen.tsx
screens/BidDetailScreen.tsx           screens/LegalGateScreen.tsx
screens/BidSentScreen.tsx             screens/OnboardingFlow.tsx
screens/BrowseJobsScreen.tsx †        screens/ReviewAndTipScreen.tsx
screens/CellJobsScreen.tsx            screens/RouteArrivalScreen.tsx
screens/CheckoutScreen.tsx            screens/SetupScreen.tsx
screens/CounterofferScreen.tsx        screens/SignInScreen.tsx
screens/EmailSignInScreen.tsx         screens/VerifyPhoneScreen.tsx
screens/JobConfirmedScreen.tsx        screens/WorkChecklistScreen.tsx
```

† dead screen (`10_dead_code.md` §A1).

**Not all of these are gaps.** Three groups, with different implications:

- **Navigator shells, not screens** — `AuthFlow.tsx`, `OnboardingFlow.tsx`. No design is owed.
- **Covered by `design-reference/` instead** — `LaunchScreen`, `SignInScreen`, `EmailSignInScreen`, `VerifyPhoneScreen`, `SetupScreen`, `LegalGateScreen`. CLAUDE.md splits the two sources: *"`docs/mockups/` holds the Emerald Prestige screen designs, and `design-reference/` holds `screen_map.json` and everything beside it."* The auth flow is the `design-reference/` half, and `design-reference/` is `.gitignore`d (78 MB), so it could not be inventoried here. **Coverage for those six is UNKNOWN from this checkout, not zero.**
- **Genuinely undesigned** — `AdminReportsScreen`, `AppearanceScreen`, `BidDetailScreen`, `BidSentScreen`, `CellJobsScreen`, `CheckoutScreen`, `CounterofferScreen`, `JobConfirmedScreen`, `JobDetailScreen`, `LegalDocumentScreen`, `ReviewAndTipScreen`, `RouteArrivalScreen`, `WorkChecklistScreen`. **Thirteen screens** built without a master. Several are money-path surfaces (`CheckoutScreen`, `JobConfirmedScreen`, `ReviewAndTipScreen`), which is where a design gap costs the most.

---

## 4. Manifest drift — **12 names that do not exist on disk (P2, VERIFIED)**

`docs/mockups/BRAZOS_MOCKUP_MANIFEST.md` gives every master a numbered heading. **Twelve of those numbers do not exist on the filesystem** — the files are there, under the same name with the numeric prefix stripped:

| manifest heading | actual filename on disk |
|-|-|
| `33_Discover_Map_Dark.png` | `Discover_Map_Dark.png` |
| `34_Messages_Inbox_Dark.png` | `Messages_Inbox_Dark.png` |
| `35_My_Jobs_Active_Dark.png` | `My_Jobs_Active_Dark.png` |
| `36_My_Jobs_Closed_Dark.png` | `My_Jobs_Closed_Dark.png` |
| `37_My_Jobs_In_Progress_Dark.png` | `My_Jobs_In_Progress_Dark.png` |
| `38_Notifications_Feed_Dark.png` | `Notifications_Feed_Dark.png` |
| `39_Notifications_Preferences_Dark.png` | `Notifications_Preferences_Dark.png` |
| `40_Payment_Methods_Dark.png` | `Payment_Methods_Dark.png` |
| `41_Profile_Account_Safety_Dark.png` | `Profile_Account_Safety_Dark.png` |
| `42_Profile_Details_Dark.png` | `Profile_Details_Dark.png` |
| `45_Profile_Past_Work_Settings_Dark.png` | `Profile_Past_Work_Settings_Dark.png` |
| `46_Compare_Bids_Dark.png` | `Compare_Bids_Dark.png` |

**Why this matters more than a typo.** The repo's whole working vocabulary is *"master 44"*, *"master 33"*, *"master 10"* — commit messages, code comments and `HANDOFF.md` all refer to masters by number. For 32 of the 44 files that number is in the filename and resolves instantly. For these 12 it exists **only inside the manifest**, so `git grep 33_Discover` finds nothing and an agent told to "check master 33" has to read a 40 KB manifest to discover which file that is.

**Also: one file on disk is never named in the manifest.** `9_job_post_dark.png` (941×1672, 1,955,848 bytes — the **largest** master) has no heading. Note the manifest *does* have a heading for `10_job_post_pg2_dark.png` and annotates it *"filename is misleading."* So the pair was disentangled and only the second half got written up. The manifest's own count confirms the gap: it says *"pixel-sampled across all 43"* while **44 PNGs exist**.

**Recommendation, not applied:** either rename the 12 files to carry their numbers, or correct the 12 headings — and add the missing heading for `9_job_post_dark.png`. Renaming is the better fix (it makes the number greppable) but it is a 12-file rename that breaks every existing reference at once, so it is **NEEDS OPERATOR DECISION**. Correcting the manifest is the safe half.

---

## 5. The "rendered code frame" on the Live Nearby card

**Verdict: NOT REPRODUCIBLE from this tree, and the defect is already documented, investigated and ruled out mechanically.** This audit reached the same conclusion independently before finding the prior write-up.

### 5.1 What the render path actually contains (VERIFIED)

`screens/HomeScreen.tsx:628-687` is the Live Nearby section. Every branch was read:

| branch | line | renders |
|-|-|-|
| header | `:629-651` | `<Text>Live Nearby</Text>`, an `Animated.View` halo + dot, a `<Text>View all</Text>` + `Ionicons` |
| loading | `:653-663` | `<Skeleton>` shapes only |
| error | `:664-671` | `<Text>Couldn't load open jobs.</Text>` + a retry `<Text>` |
| empty | `:672-675` | one fixed sentence |
| data | `:677-686` | `preview.map(job => <OpenJobCard …/>)` |

And `OpenJobCard` (`:708-832`) — every dynamic value is a plain string inside a `<Text>`:

- `{job.title}` (`:777`), `{formatBudget(job.budget_cents)}` or `'Open'` (`:786`)
- `{previewNeighborhood(job.location)}` (`:794`), guarded by `job.location ?` at `:790`
- `{interest}` (`:807`) — a `string | null` built at `:728-735`, guarded by `interest ?` at `:803`
- `{JOB_CATEGORY_LABELS[job.category] ?? job.category}` (`:801`) — `??`-guarded
- `{similarToday} similar {similarToday === 1 ? 'job' : 'jobs'}` (`:826`) — numbers and literals

**No template literal, no raw string, and no JSX is rendered as text anywhere in this subtree.** A repo-wide scan for the three shapes that would produce it returned zero hits in `screens/ components/ ui/`:
- `<Text>` containing a literal `<` followed by a component name
- a bare `{\`…${…}\`}` as a JSX child outside a `<Text>`
- `{styles.X}` rendered as a child

### 5.2 The recorded investigation (VERIFIED)

`docs/mockups/PRESTIGE_RUN_REPORT.md:2607-2629` already contains the answer, under **`home(22)` — the red code frame. NOT FIXED, and not reproducible from this tree.** Its reasoning, which this audit re-checked and agrees with:

> *"The reported frame quotes `screens/HomeScreen.tsx` lines 49-50, which are those two comment lines as they stood at `prestige(1a)`..`home(1)` — they now sit at 51-52, twenty commits later."*

What it ruled out mechanically:
- **no monospace font anywhere** in `screens/`, `components/`, `ui/` or `lib/` — so nothing in the app can *draw* source text; the only markdown renderer is on the legal screens
- `AppErrorBoundary` is the app's one boundary, wraps `RootNavigator`, and its fallback is a fixed sentence — *"it cannot render a card-sized red box"*
- the quoted text exists in **exactly one place in the repository: as a source comment** — not a fixture, not a document, not data
- comments are stripped from a production bundle, so *"it can only reach a screen through a DEV symbolicated code frame"*
- every asset `require()` resolves to a real file, and a test asserts it — closing *"the one failure mode that produces a Metro code frame at that exact line range"*

Its conclusion: *"Consistent with a device running a stale JS bundle. **A rebuild is the check.**"*

This audit independently confirms two of those load-bearing claims: `10_dead_code.md` §D5 verifies **zero broken asset references** across all 11 `require()` calls, and `04_data_binding.md` §6 verifies **no mock or placeholder data reaches a render path**.

### 5.3 Verdict and the discriminating check

**Two readings of "rendered code frame" remain, and they are distinguished by a single cheap observation:**

- **(a) The app rendered source text as content.** **RULED OUT — VERIFIED.** No monospace font, no source-text renderer, no raw string in the render path, and the quoted text exists only as a comment that a production bundle strips.
- **(b) Metro/LogBox drew its red-box code frame over the screen.** **PLAUSIBLE and unfalsifiable statically** — a red box is chrome the framework paints, not something the tree contains. The line numbers pointing at where those comments sat **twenty commits ago** is the strongest evidence for this reading: a stale bundle is exactly what quotes stale line numbers.

**The discriminating check is an OPERATOR action, not a static one:** force a fresh bundle (`npx expo start --clear`, or a `--build` run of `node scripts/home-shots.mjs`), reload the device, and open Customer Home with real jobs loaded. If the frame is gone, it was (b). If it survives a clean bundle, capture the **current** line numbers — those will point at live code and make it reproducible for the first time.

Carried to `14_FIX_QUEUE.md` as an **OPERATOR** item, not a code fix. No agent should change code against this report; there is nothing in the tree to change.

---

## 6. Coverage

**100%** — all 46 files inventoried, all 44 masters mapped, the manifest cross-checked in both directions.

Two stated limits, both required by the prompt or by `.gitignore`:
- **No pixel measurement was attempted.** Per the prompt, prior constants derived from the masters are stale after the replacement, so measurement would produce numbers that look authoritative and are not.
- **`design-reference/` was not inventoried** — it is `.gitignore`d (78 MB) and absent from the tracked tree. The six auth screens that source their design from it are recorded as **coverage UNKNOWN** in §3 rather than as gaps.
