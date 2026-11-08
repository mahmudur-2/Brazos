/**
 * The addresses this app hands OUT, in one place. (Lean D5 removed the public
 * profile link: its web page left with the web surface in D2.)
 */

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
