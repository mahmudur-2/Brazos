/**
 * 2026-09-30 (the build run, idea 18) — WHERE DICTATED WORDS GO. Post a job's two mics fill their
 * field in place: what was said joins the end of what is already there, a space between, never
 * past the field's limit. Pure, so the tests execute it; the listening itself is the voice
 * boundary's (lib/voiceSearch — on-device only, one bounded session per tap).
 */
export function joinDictation(base: string, spoken: string, maxLength: number): string {
  const words = spoken.trim();
  if (!words) return base;
  const glue = base.length === 0 || /\s$/.test(base) ? '' : ' ';
  return `${base}${glue}${words}`.slice(0, maxLength);
}

/**
 * The description's mic with idea 23's answers line: that line stays the description's last, so
 * dictated words join the customer's own words above it. When the text does not end with the line
 * (none written, or the customer moved it), the words simply join the end.
 */
export function dictateBeforeLine(base: string, line: string, spoken: string, maxLength: number): string {
  if (!line || !base.endsWith(line)) return joinDictation(base, spoken, maxLength);
  const head = base.slice(0, base.length - line.length).replace(/\n$/, '');
  const room = maxLength - line.length - 1;
  if (room <= 0) return base;
  const joined = joinDictation(head, spoken, room);
  return joined ? `${joined}\n${line}` : line;
}
