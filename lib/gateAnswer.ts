/**
 * The gate hooks' answer for the CURRENT user, decided at render time.
 *
 * WHAT IT DECIDES. hooks/useSetupStatus.ts and hooks/useLegalGate.ts each
 * keep ONE stored answer — the last thing a read or a mark wrote — tagged
 * with the id of the user it was written for (null when it was written
 * signed out). This function turns that record plus whoever is signed in
 * right now into the value the hook returns:
 *
 *   signed out                                         → the signed-out answer
 *   signed in, stored answer tagged with this user     → the stored value
 *   signed in, stored answer tagged with another user
 *     or with signed-out                               → 'loading'
 *
 * WHY IT MUST BE SYNCHRONOUS (m1-mode-race, 2026-09-05). Both hooks used to
 * flip to 'loading' inside a useEffect, and effects run AFTER the render in
 * which the user first appears. For that one render each hook still answered
 * from its signed-out branch — 'complete' for setup, 'accepted' for legal —
 * so App.tsx's RootNavigator mounted MainTabs for one commit, ModeShell armed
 * the mode resolution, and ModeProvider resolved and stamped the mode before
 * Setup could park its "Start in" choice. A user who then chose "Find work"
 * landed in the customer tree. Deriving the answer from the tag AT RENDER
 * TIME closes that window: the render in which a user appears whose id the
 * stored answer does not carry already reads 'loading', so the loader holds
 * until a read tagged with that user lands. No effect can be early enough;
 * only a derivation can.
 *
 * Pure on purpose — no React, no Supabase, nothing but this function and its
 * types — so tests/gateAnswer.test.mjs executes it directly, the
 * lib/setupState.ts arrangement.
 */

/** One stored gate answer and the user it belongs to. */
export type GateAnswer<T extends string> = {
  /** The signed-in user the value was written for; null when written signed out. */
  forUser: string | null;
  value: T;
};

/**
 * The value a gate hook returns for `userId`, given what it has stored.
 * `signedOut` is the hook's own signed-out answer and is returned whenever no
 * user is signed in, whatever is stored.
 */
export function deriveGateAnswer<T extends string>(
  userId: string | null,
  stored: GateAnswer<T>,
  signedOut: T
): T | 'loading' {
  if (userId === null) return signedOut;
  if (stored.forUser === userId) return stored.value;
  return 'loading';
}
