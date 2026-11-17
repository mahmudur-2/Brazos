/**
 * The addresses this app hands OUT, in one place. (Lean D5 removed the public
 * profile link: its web page left with the web surface in D2.)
 */
import { Linking } from 'react-native';
import { alertAsync } from './dialog';

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

/**
 * T3: the one way the app opens the support address (the Profile row, an unsettled deletion
 * blocker, the suspended screen). `Linking.openURL` is the house shape (see
 * screens/PayoutsScreen.tsx); expo-web-browser is not installed.
 *
 * `Linking.canOpenURL` is deliberately NOT called: on iOS it needs an `LSApplicationQueriesSchemes`
 * entry in app.config.ts that this app does not carry, so it would answer false on a device that
 * can in fact send mail. The direct call's own rejection is already the answer, and the failure
 * message names the address, through lib/dialog, so the contact is published even where no mail
 * app is configured.
 */
export async function openSupportMail(): Promise<void> {
  await openMail(SUPPORT_EMAIL);
}

/**
 * B7 (R4): a plain address: exactly one @, a local part of letters, digits and . _ + - only, and a
 * plain domain (dot-separated labels of letters, digits and inner hyphens, a top level of letters).
 * An address may legally hold ? & = % # , ; spaces or quotes, and a mail app reads those in a
 * mailto: URL as headers, more recipients or a body; such an address gets no link.
 */
const PLAIN_ADDRESS = /^[A-Za-z0-9._+-]+@(?:[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?\.)+[A-Za-z]{2,}$/;

/**
 * B6: a mailto: URL for an address the app shows (the owner writing to a customer or a worker), or
 * null when the address is not plain (B7 R4): the screen then shows it as text with no link.
 */
export function mailUrl(address: string): string | null {
  const trimmed = address.trim();
  return PLAIN_ADDRESS.test(trimmed) ? `mailto:${trimmed}` : null;
}

/** B6: a tel: URL; only the digits and a leading + go into it. */
export function phoneUrl(phone: string): string {
  return `tel:${phone.replace(/[^\d+]/g, '')}`;
}

/**
 * The mail app on an address, the house shape above: no canOpenURL, and a failure publishes the
 * address through lib/dialog. An address that is not plain (mailUrl null) opens nothing.
 */
export async function openMail(address: string): Promise<void> {
  const url = mailUrl(address);
  try {
    if (!url) throw new Error('not a plain address');
    await Linking.openURL(url);
  } catch {
    await alertAsync('Could not open your mail app', `Write to ${address}.`);
  }
}

/** The phone app on a number, the same shape (tel: needs no LSApplicationQueriesSchemes entry either). */
export async function openPhone(phone: string): Promise<void> {
  try {
    await Linking.openURL(phoneUrl(phone));
  } catch {
    await alertAsync('Could not open your phone app', `Call ${phone}.`);
  }
}
