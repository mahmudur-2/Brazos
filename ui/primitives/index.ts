/**
 * The BRAZOS primitive set (BRAZOS_MASTER_PLAN.md §I).
 *
 * This barrel is the canonical import path for every shared primitive. New
 * screens import from here and nowhere else, so there is one name per role.
 *
 * CONSOLIDATION, NOT DUPLICATION
 * Where a working component already existed, this file re-exports it under
 * §I's name rather than reimplementing it. There is still exactly one
 * implementation of each — `Button` here IS components/Button.tsx, not a V2
 * copy of it. Existing screens keep importing their old paths and keep
 * rendering identically (which is what keeps LOCKED screens 01-07/48 safe);
 * new screens get the §I vocabulary. Later phases can move the file itself
 * without touching a single consumer, because the import path is stable.
 *
 * §I's cap: "~25 — hard cap; adding a 26th requires a justification line in
 * BUILD_STATE". §I's own enumerated list is 26 items; the justification line
 * is recorded in BRAZOS_BUILD_STATE.md. Of those 26, 20 are available here —
 * Phase 1 shipped 17, Phase 2 added the two blocked on ModeContext (BottomNav,
 * JobCard), and Phase 4 added MediaUploader (blocked on the post-a-job
 * wizard). The remaining 6 are deliberately still unbuilt: each is blocked on
 * a later phase's context, and building a speculative shape now is how you
 * get a primitive nobody can use. See the DEFERRED block at the bottom.
 */

// --- Re-exported existing implementations (consolidated, not duplicated) ---

/** §I "Button". Variants/sizes live on the component; ui/tokens.ts's
 *  `buttonVariants` + `controls` carry §I's canonical values for new work. */
export { Button } from '../../components/Button';

/** §I "Card". */
export { Card } from '../../components/Card';

/** §I "Chip". Already carries the Emerald variants (DECISIONS.md D6). */
export { Chip } from '../../components/Chip';

/** §I "Avatar". */
export { Avatar } from '../../components/Avatar';

/** §I "Skeleton". */
export { Skeleton } from '../../components/Skeleton';

/** §I "SegmentedTabs" — the existing SegmentedControl fills this role. */
export { SegmentedControl as SegmentedTabs } from '../../components/SegmentedControl';

/** §I "TopBar" — the existing ScreenHeader fills this role. */
export { ScreenHeader as TopBar } from '../../components/ScreenHeader';

/** §I "RatingStars" — the existing StarRating fills this role. */
export { StarRating as RatingStars } from '../../components/StarRating';

/**
 * §I "Input (text/phone/currency/textarea)". Text and textarea are the same
 * component (`multiline`); phone has its own E.164-aware implementation.
 * The currency variant is deliberately absent until Phase 5's OfferComposer
 * actually needs it — a money input with no money system to validate against
 * would be guesswork.
 */
export { TextField as Input } from '../../components/TextField';
export { PhoneNumberInput } from '../../components/PhoneNumberInput';

// --- Built in Phase 1 (no prior equivalent existed) ------------------------

/** Prestige 0c — beyond §I's enumerated 26, justified on the record (the
 *  PRESTIGE_RUN_REPORT): pre-made decision 7 specifies a rimmed toggle RN's
 *  native Switch cannot draw, and three Switch call sites each carried their
 *  own colours. One drawn control replaces all three. */
export { Toggle } from './Toggle';

export { StatusPill } from './StatusPill';
export type { JobStatus, OfferStatus, PaymentStatus } from './StatusPill';
export { MoneyText } from './MoneyText';
export { EmptyState } from './EmptyState';
export { ListRow } from './ListRow';
export { SearchBar } from './SearchBar';
export { Sheet } from './Sheet';
export { StepHeader } from './StepHeader';
export { MediaGrid } from './MediaGrid';
export type { MediaItem } from './MediaGrid';

// --- Built in Phase 4 (the one Phase 1 deferred on the post-a-job wizard) --

/** §I "MediaUploader". Failure-safe: `items` only grows from a URL a real
 *  upload already returned; a failed pick/upload changes nothing. Bucket-
 *  agnostic — callers supply `onUpload`/`onDelete` bound to their own
 *  `lib/storage.ts` function. */
export { MediaUploader } from './MediaUploader';
export type { MediaUploaderKind, MediaUploaderProps } from './MediaUploader';

// --- Built in Phase 2 (the two Phase 1 deferred on ModeContext) -----------

/**
 * §I "BottomNav". The tab bar's whole visual language in one place, consumed by
 * both navigator trees and by the dev catalog. React Navigation still draws the
 * real bar — see the file header for why that is deliberate rather than a
 * shortcut.
 */
export {
  BOTTOM_NAV_TABS,
  BottomNavItem,
  BottomNavPreview,
  bottomNavHeight,
  bottomNavScreenOptions,
  CenterCreateButton,
  CUSTOMER_BAR_TABS,
  CUSTOMER_CREATE_SLOT,
  HIDDEN_TAB_ITEM_OPTIONS,
  PINNED_FOOTER_BOTTOM_PADDING,
  TAB_BAR_CONTENT_HEIGHT,
  TAB_BAR_FLOAT_MARGIN,
  useFloatingNavClearance,
  WORKER_BAR_TABS,
  type BottomNavTabKey,
} from './BottomNav';

/** §I "JobCard (mode-aware)". Perspective comes from ModeContext; there is no
 *  prop for it, by design. */
export { JobCard } from './JobCard';
export type { JobCardProps } from './JobCard';

// --- DEFERRED, with the phase each is genuinely blocked on ----------------
//
// Not oversights. Each of these needs context Phase 1 does not have, and §L
// forbids implementing future business logic to complete a primitive.
//
//  WorkerCard      Phase 5/9. components/OfferCard.tsx already fills both
//  BidCard         roles for today's screens; splitting or renaming it now
//                  would churn a working component with no new consumer.
//  ChecklistCard   Phase 6. No checklist schema exists.
//  EvidenceGallery Phase 6. Evidence display exists inline on the job screens;
//                  extracting it belongs with the phase that reworks them.
//  ServiceCard     Phase 9. No services/pricing schema exists.
//  LiveJobMap      Phase 6/8. The map technology decision (hotspot abstraction
//                  vs. real pins) is explicitly still open per Phase 0.
