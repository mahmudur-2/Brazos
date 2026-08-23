/**
 * The handful of URLs the WEB build answers directly, parsed from a pathname.
 *
 * The app is a react-navigation app with no linking configuration: every other
 * path is the SPA shell and the navigator decides what is on screen. These are
 * the exceptions — addresses handed OUT into the world (see lib/appLinks.ts)
 * that a stranger may open cold, with no session and no app installed, and
 * that must therefore resolve before the navigator is reached at all.
 *
 * Pure, so the tests run it: a URL parser is exactly the kind of code that
 * looks obviously right and is off by one slash.
 */

export type WebRoute = { kind: 'profile'; userId: string };

/**
 * `/profile/{id}` and nothing else.
 *
 * STRICT ON PURPOSE. A too-permissive match here would swallow paths the
 * navigator should have had, and an id that still contains a slash is a
 * deeper path this route does not own. Percent-encoding is undone, because
 * lib/appLinks.ts encodes it on the way out.
 */
export function parseWebRoute(pathname: string): WebRoute | null {
  const match = /^\/profile\/([^/]+)\/?$/.exec(pathname);
  if (!match) return null;

  let userId: string;
  try {
    userId = decodeURIComponent(match[1]);
  } catch {
    // A malformed escape sequence is not an id.
    return null;
  }

  if (!userId.trim()) return null;
  return { kind: 'profile', userId };
}
