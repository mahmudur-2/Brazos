/**
 * The final Customer <-> Worker transition artwork and the geometry of the
 * gold line baked into each image, measured directly from the source pixels
 * (not guessed) so the animated shimmer in ModeTransitionOverlay lands
 * exactly on the printed line rather than floating near it.
 *
 * Both PNGs are 1192x1319 (measured via pngjs — not the ~1536x1700 initially
 * assumed). Kept as plain constants, not computed at runtime: reading a
 * bundled asset's intrinsic size on-device needs an async `Image.getSize`
 * round trip, and the source dimensions of a static design asset don't
 * change between builds.
 */

import type { ImageSourcePropType } from 'react-native';

export type ModeDestination = 'worker' | 'customer';

export const TRANSITION_IMAGES: Record<ModeDestination, ImageSourcePropType> = {
  worker: require('../assets/brand/transition-worker.png'),
  customer: require('../assets/brand/transition-customer.png'),
};

const SOURCE_WIDTH = 1192;
const SOURCE_HEIGHT = 1319;

/** height/width — multiply the on-screen panel width by this for its height. */
export const SOURCE_ASPECT_RATIO = SOURCE_HEIGHT / SOURCE_WIDTH;

type LineGeometry = {
  /** Vertical position of the line's row, as a % of panel height. */
  topPct: number;
  /** Horizontal midpoint of the line, as a % of panel width. */
  centerPct: number;
  /** The line's full measured width (its faint gradient tails included), as
   *  a % of panel width. The shimmer travels this whole span, edge to edge. */
  widthPct: number;
};

// Measured by scanning each PNG for the row with a sharp, isolated spike of
// gold-toned pixels below the label text (the actual line is a single ~2-4px
// row; scanning caught the text block instead until the search window was
// narrowed to y > 78% of the image). Left/right edges are the full extent of
// non-background pixels on that row, including the line's faded gradient
// tails, not just its brightest core.
export const LINE_GEOMETRY: Record<ModeDestination, LineGeometry> = {
  worker: { topPct: 84.99, centerPct: 49.92, widthPct: 60.4 },
  customer: { topPct: 82.94, centerPct: 50.25, widthPct: 57.55 },
};
