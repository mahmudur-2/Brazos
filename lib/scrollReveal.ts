/**
 * PART 5b T1: how far a scroll page moves so that a block that just opened in place shows from its
 * heading down to its field, inside the page's visible band (the band is the scroller's frame less
 * what covers its foot: the tab bar, or nothing once the keyboard is up, because the keyboard-avoiding
 * view already ends the frame at the keyboard).
 *
 * All values are window coordinates in points. The page moves only down the content (a positive
 * shift), only as far as the field needs, and never so far that the heading leaves the top of the
 * band: when both cannot fit, the heading wins. Zero means the page stays where it is.
 */
export function revealShift({
  visibleTop,
  visibleBottom,
  headingTop,
  fieldBottom,
  margin,
}: {
  visibleTop: number;
  visibleBottom: number;
  headingTop: number;
  fieldBottom: number;
  margin: number;
}): number {
  const fieldBelow = fieldBottom + margin - visibleBottom;
  if (!(fieldBelow > 0)) return 0;
  const headingRoom = headingTop - margin - visibleTop;
  return Math.max(0, Math.min(fieldBelow, headingRoom));
}
