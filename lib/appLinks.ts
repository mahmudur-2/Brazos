/**
 * The public web addresses this app hands OUT.
 *
 * One place, because a URL that leaves the app in a share sheet is a URL
 * strangers will still be opening months later — it cannot be assembled at
 * three call sites with three opinions about the path.
 */

/**
 * PLACEHOLDER — CONFIRM BEFORE THIS SHIPS ANYWHERE REAL.
 *
 * No web domain is recorded anywhere in this repository: WEB_DEPLOYMENT.md
 * describes the release workflow without naming a host, and hosting/ carries
 * no origin. This value is the one the product name implies, and it is the
 * ONE LINE to change once the real domain is registered and pointed at the
 * `npm run build:web` output.
 *
 * Until then a shared profile link resolves to whatever that domain currently
 * serves, which is why the share text names the person as well as carrying the
 * URL: the message is still useful to its recipient even if the link is not.
 * HANDOFF.md carries this as an operator step.
 */
export const PROFILE_WEB_BASE_URL = 'https://brazos.app';

/**
 * The public, view-only page for one person.
 *
 * The path shape is shared with the web build's own /profile/{id} route, so
 * changing it here means changing it there — that coupling is the point of
 * this module existing rather than the string being inlined.
 */
export function profileUrl(userId: string): string {
  return `${PROFILE_WEB_BASE_URL}/profile/${encodeURIComponent(userId)}`;
}

/**
 * The published support contact.
 *
 * `docs/DECISIONS.md` 2026-09-05 entry (3): brazosmvp@gmail.com is the
 * contact, reached as a mailto link, because the app carries no help, support
 * or contact surface. No domain exists yet — `docs/BACKLOG.md` side backlog 7
 * buys it — so this is the ONE line to change once the domain's mailbox does.
 *
 * The address is spelled here and nowhere else in the app: screens import the
 * constant rather than retyping it, so moving the mailbox is one edit.
 */
export const SUPPORT_EMAIL = 'brazosmvp@gmail.com';

/** The mailto: URL for {@link SUPPORT_EMAIL}, assembled in one place. */
export function supportMailtoUrl(): string {
  return `mailto:${SUPPORT_EMAIL}`;
}
