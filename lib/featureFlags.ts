/**
 * FEATURE FLAGS — built, reachable in code, and offered only once the thing
 * underneath them exists.
 *
 * Every flag here guards a surface that is fully written. That is the point,
 * and it is the repo's standing rule stated as a constant: HIDDEN RATHER THAN
 * OFFERED AND THEN FAILING. A menu row that opens a sheet which cannot write
 * is worse than no row — it teaches a user the feature exists and then breaks
 * their trust the first time they use it.
 *
 * SEVEN OF THESE ARE LIVE, and phase77 is why all seven could be.
 *
 *   2026-08-24, RUN W1   supabase/phase77_conversation_features.sql landed on
 *                        staging and W1 wired what it declared: TIMED_BLOCK,
 *                        MARK_UNREAD, CLEAR_CHAT, HIDDEN_CHATS, ARCHIVE and
 *                        DELETE_CHAT.
 *   2026-08-25, RUN W2   LIVE_LOCATION, from that same migration.
 *
 * (Lean D3a removed DOCUMENTS, READ_TICKS, DELIVERED_TICKS and TRANSLATION
 * together with the features they gated: v1 messaging is text and photo.)
 *
 * Each one's block below records what it waited on and what closed it, because
 * a flag that has been flipped is still the place a later reader looks to find
 * out why it could be — and in LIVE_LOCATION's case, why half of its recorded
 * dependency was REFUSED rather than met.
 *
 * ONE REMAINS DARK: PRICE_GUIDANCE, which waits on an attributed source.
 *
 * WHAT A FLAG WAITS ON is written beside it, in the same vocabulary the schema
 * run uses: a table, a column, a policy, a deploy, or a key. Flipping one is a
 * one-line change in this file AFTER its dependency lands, and nothing else
 * has to move — the UI it gates is already built, already typed and already
 * tested against fixtures.
 *
 * WHAT THIS FILE IS NOT. It is not a kill-switch surface, a remote-config
 * client, or an A/B mechanism. It is a compile-time constant table, so an
 * unflipped flag costs a dead branch and nothing more; `false as boolean`
 * keeps TypeScript from narrowing each one to the literal `false` and
 * declaring the guarded code unreachable.
 *
 * HOW TO USE ONE. Guard the ENTRY POINT, not the implementation: the sheet,
 * the screen and the lib call all exist unconditionally, and the row that
 * opens them renders only when its flag is true. That way flipping the flag
 * is the whole change, and the flagged code stays compiled — and therefore
 * type-checked and testable — the entire time it is dark.
 */

/**
 * Sharing a live position into a thread while a job is underway.
 *
 * WAITS ON: nothing since 2026-08-25. It waited on a location-sharing table —
 * a per-thread row carrying the sharer, the coordinates, a heartbeat and an
 * expiry — plus RLS restricting reads to the thread's two participants, AND
 * expo-location's BACKGROUND permission with expo-task-manager installed.
 * phase77's `live_location_shares` closed the first half outright.
 *
 * THE SECOND HALF WAS NOT SATISFIED. IT WAS REFUSED, and that is the one thing
 * to read before "fixing" the suspended-app case. Background location is the
 * most invasive permission iOS asks for, and this feature would be asking for
 * it in order to keep broadcasting a position while the app is not on screen —
 * which is the opposite of what makes a bounded, consensual share safe. So it
 * ships FOREGROUND ONLY: requestForegroundPermissionsAsync and
 * watchPositionAsync, no TaskManager task, no "Always" prompt. A share whose
 * updates stop because iOS suspended the app is an ACCEPTED outcome, because
 * the counterparty's honest upper bound is always the `expires_at` they
 * already hold and nothing can extend it. expo-task-manager has since been
 * removed from package.json; this feature never used it, and
 * tests/liveLocation.test.mjs sweeps both files to keep it that way.
 *
 * A SHARE IS NOT A MESSAGE. `live_location_shares` has no row in `messages`,
 * so starting or stopping one inserts nothing into the thread: it renders as
 * a card while it is live and is gone when it ends. Writing a "started
 * sharing" message would have made an ephemeral fact permanent in a transcript
 * both people keep.
 *
 * AND AN ENDED SHARE DELIVERS NO EVENT, which is where a later run is most
 * likely to go wrong. stop_live_location() sets `expires_at = now()`, and the
 * updated row immediately fails the SELECT policy's expiry term, so realtime
 * DROPS it — an expiry is the same shape, since no UPDATE happens at all. The
 * counterparty's card is therefore cleared by a REFETCH ON FOCUS and a LOCAL
 * CLOCK, never by waiting; the subscription exists only to make a moving pin
 * move. Waiting for an event leaves a stale pin on screen indefinitely.
 *
 * THE GUARD SITE is screens/ChatScreen.tsx and it guards the ASSEMBLY: with
 * this false nothing is read, nothing is subscribed, no watcher can start and
 * the two cards have no share to render. The composer row is gated by this
 * flag and its handler and NOT by `allowAttachments` — all three RPCs take a
 * job id or a direct thread id, so a share works on both thread kinds.
 */
export const LIVE_LOCATION = true as boolean;

// NOT A FLAG — MUTE WAS RETIRED FROM THIS TABLE ON 2026-08-23, before it ever
// gated anything, because it had no unmet dependency to record and this table
// admits nothing that cannot name one.
//
// The overnight dispatch specified Mute as flag-gated in both the inbox row and
// the chat overflow menu. Measured against the repo, that premise is wrong:
// `mutes` has existed since supabase/phase13_moderation_photos_location.sql,
// lib/moderation.ts's muteUser/unmuteUser are live, and the inbox long-press
// sheet has been calling them all along. And a conversation in BRAZOS IS a
// person — the inbox rows are keyed by counterparty, not by thread — so the
// per-conversation mute the dispatch described and the per-user mute that
// already ships are the same feature. Flagging it would have HIDDEN working
// behaviour. The chat menu's Mute is wired to the same two calls instead.
/**
 * Blocking someone FOR A PERIOD rather than permanently.
 *
 * WAITS ON: nothing since 2026-08-24. It waited on an expiry column on the
 * existing block relation and on the block checks reading it; phase77 added
 * `blocks.expires_at`, taught is_blocked_between() to ignore a lapsed row, and
 * added set_block() as the only path that can move an EXISTING row's expiry —
 * `blocks` has no UPDATE policy and no UPDATE grant (phase76), deliberately.
 *
 * THE PERMANENT BLOCK already existed, already worked, and stays reachable
 * exactly where it lives today: the first sheet, on lib/moderation.ts's plain
 * insert, with unblocking still its delete. This flag is only about the timed
 * variant, which is a SEPARATE row inside More precisely so shipping it cannot
 * quietly change what the existing one does.
 */
export const TIMED_BLOCK = true as boolean;

/**
 * Hiding a conversation behind device authentication.
 *
 * WAITS ON: nothing since 2026-08-24. Both halves are here — expo-local-
 * authentication is installed, and phase77's `conversation_states.hidden` is
 * the per-user list.
 *
 * THE ENTRY IS A FOOT ROW, NOT A PILL. A sixth filter pill would sit in the
 * chrome permanently and announce that hidden conversations exist whether or
 * not any do; the foot row appears only when there is something behind it.
 *
 * AND THE DEVICE HAS TO BE ABLE TO ASK. With no biometric or passcode enrolled
 * (hasHardwareAsync / isEnrolledAsync false) neither the foot row nor the
 * "Mark as Hidden" row renders at all — this file's own rule applied to a
 * capability rather than to a schema.
 */
export const HIDDEN_CHATS = true as boolean;

/**
 * Archiving a conversation out of the main inbox.
 *
 * WAITS ON: nothing since 2026-08-24. It waited on a per-participant archived
 * flag on the conversation membership; phase77's `conversation_states.archived`
 * is it.
 *
 * The Archived FILTER PILL shipped before the column did and was honest about
 * it — an empty state, because with no column there was genuinely nothing
 * archived. It now filters on the joined flag, and archived rows leave EVERY
 * other pill rather than only All: a row that vanished from All and resurfaced
 * under Unread would have been filed nowhere.
 */
export const ARCHIVE = true as boolean;

/**
 * Clearing a thread's messages for one participant only.
 *
 * WAITS ON: nothing since 2026-08-24. It waited on a per-participant cleared-at
 * watermark and on every message read filtering by it; phase77's
 * `conversation_states.cleared_before` is the watermark, and the ONE rule that
 * reads it is clearedBy() in lib/conversationVisibility.ts, re-exported from
 * lib/conversations.ts so the inbox and the chat timeline cannot drift apart.
 *
 * Deleting the rows outright was never the feature — the other participant
 * keeps their copy, and nothing tells them this happened.
 */
export const CLEAR_CHAT = true as boolean;

/**
 * Removing a conversation from one participant's inbox entirely.
 *
 * WAITS ON: nothing since 2026-08-24. It waited on the same watermark
 * CLEAR_CHAT needs, on a membership-level flag, and on a DECISION about what
 * re-opens the thread when the other person writes again. phase77 answered all
 * three, and the answer to the third is the interesting one: NOTHING re-opens
 * it, because nothing ever closed it. The row is out of the inbox while
 * `deleted` is set AND nothing newer than the watermark exists, so the next
 * message reopens it BY DERIVATION. `deleted` is never written false — not by
 * the migration, and not anywhere in this app.
 */
export const DELETE_CHAT = true as boolean;

/**
 * Rewinding your OWN read position so a thread returns to the unread state.
 *
 * WAITS ON: nothing since 2026-08-24. It waited on a client-callable path that
 * could move a read position BACKWARD on BOTH thread kinds. The verdict,
 * measured against the repo's own migrations, and what closed it:
 *
 *   job threads     ALREADY REWINDABLE, and still are by the same route.
 *                   message_reads_update_own
 *                   (supabase/phase9_messages_inbox.sql) is
 *                   `using (user_id = auth.uid())` with a matching check and
 *                   no constraint on the VALUE, so a client may write an
 *                   earlier last_read_at — which is exactly a rewind. Nothing
 *                   new was added for this half and nothing new is used.
 *   direct threads  WERE NOT REWINDABLE: `direct_threads` has no INSERT or
 *                   UPDATE policy at all by deliberate design, and the only
 *                   writer, mark_direct_thread_read(), hard-codes `now()`
 *                   (supabase/phase36_direct_offer_threads.sql). phase77 added
 *                   set_direct_thread_read_at(), its explicit-timestamp
 *                   sibling, and left the hot-path function untouched so the
 *                   every-message-open path carries zero new risk.
 *
 * Flagged until both halves worked, for the reason this table exists: an inbox
 * where Mark as Unread works on some rows and silently does nothing on others
 * is worse than one where it is not offered.
 *
 * ONE HONEST BOUNDARY REMAINS, and it is the inbox's unread DERIVATION rather
 * than this write: a row lights only when the last message is the OTHER
 * person's (threadUnread in lib/conversations.ts). Rewinding a conversation
 * whose last message is your own moves your read position and shows no dot,
 * because the derivation reads activity and not intent. Changing that needs a
 * "manually marked unread" bit the schema does not have.
 */
export const MARK_UNREAD = true as boolean;

/**
 * Tier A (C6): the static "Suggested starting range" guidance on the
 * Post-a-Job budget step (lib/priceGuidance.ts). The table is a seed with no
 * attributed source and no BRAZOS data behind it, so it renders OFF — the
 * copy sweep's rule: nothing the app cannot prove.
 *
 * WAITS ON: an attributed source for every range in lib/priceGuidance.ts, or
 * BRAZOS's own accepted-offer data once enough exists to replace the seed.
 * Flip to true then; the module and its fence (tests/conversion.test.mjs
 * §3.2) are unchanged either way.
 *
 * THE GUARD SITE is screens/PostJobScreen.tsx: `guidanceLines` is null while
 * this is false, so the guidance card never mounts.
 */
export const PRICE_GUIDANCE = false as boolean;
