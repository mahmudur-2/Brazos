import { supabase } from '../supabase';
import { PRIVACY_POLICY } from './privacyPolicy';
import { TERMS_OF_SERVICE } from './termsOfService';

export { PRIVACY_POLICY, TERMS_OF_SERVICE };

// ---------------------------------------------------------------------------
// Versioned legal documents.
//
// Acceptance is recorded per document AND per version, so changing a document
// later re-prompts everyone who only accepted the older one. Bump the version
// whenever the substance changes — a typo fix does not need one, a change to
// what users are agreeing to does.
//
// Date-based rather than semver: what matters when reading an acceptance
// record months later is which text was on screen at the time.
// ---------------------------------------------------------------------------

// 2026-11-13 (privacy only): the Payments section says the payout set-up email is passed to Stripe.
// 2026-11-11 (website brief): both texts rewritten for launch and checked claim by claim against the code;
// the draft notice is gone at the owner's word (the lawyer review, ledger O1, is still owed), and the
// version no longer says "draft" because both legal screens print it.
// draft4 (lean P5): the Terms no longer mention a payments test mode or a mute tool; the gate asks for 18+.
// draft3 (lean E4): portfolio photos left the Terms; the Privacy Policy says profile photos are public too.
export const TERMS_VERSION = '2026-11-11';
export const PRIVACY_VERSION = '2026-11-13';

export type LegalDocumentKey = 'terms' | 'privacy';

export type LegalDocument = {
  key: LegalDocumentKey;
  title: string;
  version: string;
  body: string;
};

export const LEGAL_DOCUMENTS: Record<LegalDocumentKey, LegalDocument> = {
  terms: {
    key: 'terms',
    title: 'Terms of Service',
    version: TERMS_VERSION,
    body: TERMS_OF_SERVICE,
  },
  privacy: {
    key: 'privacy',
    title: 'Privacy Policy',
    version: PRIVACY_VERSION,
    body: PRIVACY_POLICY,
  },
};

/** Both documents a user must accept before the app is usable. */
export const REQUIRED_DOCUMENTS: LegalDocument[] = [
  LEGAL_DOCUMENTS.terms,
  LEGAL_DOCUMENTS.privacy,
];

export type LegalAcceptance = {
  id: string;
  user_id: string;
  document: LegalDocumentKey;
  version: string;
  accepted_at: string;
};

/**
 * Whether this user has accepted the CURRENT version of every required
 * document.
 *
 * Returns `unknown` rather than `false` when the check itself fails (offline,
 * or the phase21 migration hasn't been run). The caller must not block the app
 * on a failed check — that would lock every user out of a working app because
 * of a network blip.
 */
export async function fetchLegalStatus(
  userId: string
): Promise<{ status: 'accepted' | 'needs_acceptance' | 'unknown'; error?: string }> {
  const { data, error } = await supabase
    .from('legal_acceptances')
    .select('document, version')
    .eq('user_id', userId);

  if (error) {
    return { status: 'unknown', error: error.message };
  }

  const accepted = new Set((data ?? []).map((r) => `${r.document}:${r.version}`));
  const missing = REQUIRED_DOCUMENTS.some(
    (doc) => !accepted.has(`${doc.key}:${doc.version}`)
  );

  return { status: missing ? 'needs_acceptance' : 'accepted' };
}

/**
 * FIX-RUN B16: whether this user has EVER accepted the legal documents (any
 * version). Setup's server-side trace — see lib/setupState.ts setupStateFrom.
 * A failed read answers false: Setup shows, the safe direction.
 */
export async function hasAnyLegalAcceptance(userId: string): Promise<boolean> {
  try {
    const { data, error } = await supabase
      .from('legal_acceptances')
      .select('document')
      .eq('user_id', userId)
      .limit(1);
    return !error && (data ?? []).length > 0;
  } catch {
    return false;
  }
}

/**
 * Records acceptance of every current document in one call.
 *
 * Goes through an RPC rather than a plain insert so the accepted_at timestamp
 * is the database's own clock — a client-supplied time would make the audit
 * trail only as trustworthy as the device's clock settings.
 */
export async function acceptCurrentDocuments() {
  const { error } = await supabase.rpc('accept_legal_documents', {
    p_documents: REQUIRED_DOCUMENTS.map((doc) => ({
      document: doc.key,
      version: doc.version,
    })),
  });
  return { error };
}
