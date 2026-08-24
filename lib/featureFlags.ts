/**
 * FEATURE FLAGS — built, reachable in code, and NOT offered to a user yet.
 *
 * Every flag here is `false` and every one of them guards a surface that is
 * fully written. That is the point, and it is the repo's standing rule stated
 * as a constant: HIDDEN RATHER THAN OFFERED AND THEN FAILING. A menu row that
 * opens a sheet which cannot write is worse than no row — it teaches a user
 * the feature exists and then breaks their trust the first time they use it.
 *
 * WHAT A FLAG WAITS ON is written beside it, in the same vocabulary the
 * daytime schema run will use: a table, a column, a policy, a deploy, or a
 * key. Flipping one is a one-line change in this file AFTER its dependency
 * lands, and nothing else has to move — the UI it gates is already built,
 * already typed and already tested against fixtures.
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
 * WAITS ON: a location-sharing table (a per-thread row carrying the sharer,
 * the coordinates, a heartbeat and an expiry) plus RLS restricting reads to
 * the thread's two participants, AND expo-location's background permission
 * with expo-task-manager installed. The chat composer's drop-up already
 * carries the entry; the SEND path and the bubble are out of scope until the
 * schema exists.
 */
export const LIVE_LOCATION = false as boolean;

/**
 * Attaching a document (PDF, docx, spreadsheet) to a message.
 *
 * WAITS ON: expo-document-picker installed, and a storage bucket plus the
 * message-attachment column that names it. Photos and video already have
 * both; documents have neither.
 */
export const DOCUMENTS = false as boolean;

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
 * WAITS ON: an expiry column on the existing block relation, and the block
 * checks reading it. NOTE: the PERMANENT block already exists, already works,
 * and stays reachable exactly where it lives today — this flag is only about
 * the timed variant, and nothing here removes or gates the permanent one.
 */
export const TIMED_BLOCK = false as boolean;

/**
 * Hiding a conversation behind device authentication.
 *
 * WAITS ON: expo-local-authentication installed, plus a per-user hidden-thread
 * list. The list is the schema half; Face ID is the dependency half, and
 * neither is here yet.
 */
export const HIDDEN_CHATS = false as boolean;

/**
 * Archiving a conversation out of the main inbox.
 *
 * WAITS ON: a per-participant archived flag on the conversation membership.
 * The Archived FILTER PILL ships today and is honest about it — it shows an
 * empty state, because with no column there is genuinely nothing archived.
 */
export const ARCHIVE = false as boolean;

/**
 * Clearing a thread's messages for one participant only.
 *
 * WAITS ON: a per-participant cleared-at watermark on the membership, and
 * every message read filtering by it. Deleting the rows outright is not the
 * feature — the other participant keeps their copy.
 */
export const CLEAR_CHAT = false as boolean;

/**
 * Removing a conversation from one participant's inbox entirely.
 *
 * WAITS ON: the same per-participant watermark CLEAR_CHAT needs, plus a
 * membership-level hidden flag and a decision about what re-opens the thread
 * when the other person writes again.
 */
export const DELETE_CHAT = false as boolean;

/**
 * Rewinding your OWN read position so a thread returns to the unread state.
 *
 * WAITS ON: a client-callable path that can move a read position BACKWARD on
 * BOTH thread kinds. The verdict, measured against the repo's own migrations
 * on 2026-08-23:
 *
 *   job threads     ALREADY REWINDABLE. message_reads_update_own
 *                   (supabase/phase9_messages_inbox.sql) is
 *                   `using (user_id = auth.uid())` with a matching check and
 *                   no constraint on the VALUE, so a client may write an
 *                   earlier last_read_at — which is exactly a rewind.
 *   direct threads  NOT REWINDABLE. `direct_threads` has no INSERT or UPDATE
 *                   policy at all by deliberate design, and the only writer,
 *                   mark_direct_thread_read(), hard-codes `now()`
 *                   (supabase/phase36_direct_offer_threads.sql).
 *
 * Half again, and flagged for the same reason: an inbox where Mark as Unread
 * works on some rows and silently does nothing on others is worse than one
 * where it is not offered. What the schema needs is a mark_direct_thread_read
 * sibling that accepts an explicit timestamp, or an RPC that owns both
 * surfaces so the client stops writing message_reads directly.
 */
export const MARK_UNREAD = false as boolean;

/**
 * The GOLD (read) ticks on an own message.
 *
 * WAITS ON: nothing. phase77 supplied the missing half and W1 built the
 * wiring; this flag is now an ordinary switch over a complete feature.
 *
 * WHAT WAS MISSING, and what closed it:
 *
 *   direct threads  ALREADY READABLE, and always were. `direct_threads`
 *                   carries both parties' read columns on the row, and
 *                   direct_threads_select_party
 *                   (supabase/phase36_direct_offer_threads.sql) lets either
 *                   participant SELECT that whole row.
 *   job threads     NOT READABLE until phase77. message_reads_select_own
 *                   (supabase/phase9_messages_inbox.sql) is
 *                   `using (user_id = auth.uid())`, so a user could read only
 *                   their OWN row. `message_reads_select_party`
 *                   (supabase/phase77_conversation_features.sql) adds exactly
 *                   one row to that: the OTHER party's, on a job the caller is
 *                   already in. Chosen over a definer RPC because a policy
 *                   keeps ONE tick pipeline for both thread kinds — an RPC
 *                   cannot ride realtime, so job ticks would poll and lag
 *                   their direct siblings inside the same conversation.
 *
 * WHY BOTH HALVES HAD TO LAND TOGETHER. One conversation folds a pair's job
 * threads AND their direct thread into a single timeline (see `targets` in
 * screens/ChatScreen.tsx), so wiring only the readable half would have made
 * the SAME conversation show gold on some bubbles and never on others — an
 * absent tick meaning "not read yet" on one message and "unknowable here" on
 * the next. That is why it shipped dark rather than half.
 *
 * THE GUARD SITE is screens/ChatScreen.tsx, and it guards the ASSEMBLY: with
 * this false, no read position is fetched, no subscription is opened, and
 * `delivery` is never passed — so ChatBubble falls back to
 * `tickStateFor({})`, one tick, exactly what an unflipped build has always
 * drawn. lib/messageTicks.ts holds the derivation; components/MessageTicks.tsx
 * draws all three states and is unit-tested for each.
 */
export const READ_TICKS = false as boolean;

/**
 * The second (delivered) tick on an own message.
 *
 * WAITS ON: real delivery plumbing — a per-recipient delivered_at, written
 * when a device actually receives the row. Nothing in the current schema
 * distinguishes "the insert succeeded" from "the other device has it", and a
 * tick that means the former while looking like the latter is a lie. The tick
 * ELEMENT renders all three states and is unit-tested for all three; only the
 * live wiring waits. This is the strictly harder half of [[READ_TICKS]]: read
 * state at least EXISTS in the schema for one thread kind, and delivery
 * exists for neither.
 *
 * NO GUARD SITE TODAY, exactly as for [[READ_TICKS]] and for the same reason:
 * flipping this constant changes nothing, because nothing imports it. It is
 * named only in the prose of components/MessageTicks.tsx and
 * lib/messageTicks.ts.
 *
 * WHAT MUST BE BUILT: a per-recipient `delivered_at` (a column and the client
 * write that sets it when a device receives the row), then the same step 3
 * [[READ_TICKS]] names — ChatScreen assembling `deliveredAt` into the
 * MessageDelivery it passes to ChatBubble, guarded by this flag. Both flags
 * feed ONE prop, so whichever lands first builds the assembly and the second
 * only adds its field.
 */
export const DELIVERED_TICKS = false as boolean;

/**
 * In-chat translation of a message or a whole conversation.
 *
 * WAITS ON: the `translate` edge function being reviewed and DEPLOYED, and
 * AZURE_TRANSLATOR_KEY + AZURE_TRANSLATOR_REGION set in its environment. The
 * function is drafted in supabase/functions/translate/ and is explicitly not
 * deployed; the sheet renders from fixtures today.
 */
export const TRANSLATION = false as boolean;
