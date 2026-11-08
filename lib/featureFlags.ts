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
 * SIX OF THESE ARE LIVE, and phase77 is why all six could be.
 *
 *   2026-08-24, RUN W1   supabase/phase77_conversation_features.sql landed on
 *                        staging and W1 wired what it declared: TIMED_BLOCK,
 *                        MARK_UNREAD, CLEAR_CHAT, HIDDEN_CHATS, ARCHIVE and
 *                        DELETE_CHAT.
 *
 * (Lean D3a removed DOCUMENTS, READ_TICKS, DELIVERED_TICKS and TRANSLATION,
 * and lean D3b removed LIVE_LOCATION, together with the features they gated:
 * v1 messaging is text and photo.)
 *
 * Each one's block below records what it waited on and what closed it, because
 * a flag that has been flipped is still the place a later reader looks to find
 * out why it could be.
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
