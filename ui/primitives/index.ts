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

/**
 * lit(2) — beyond §I's enumerated 26, and deliberately NOT a 26th role: it is
 * the fill of a Card/Button that already exists, not a new component in the
 * vocabulary. Master 44 lights the promo card and the Post-a-job pill with a
 * diagonal wash the flat `backgroundColor` cannot express; this is the one
 * place that wash is written, for both platforms.
 */
export { LitSurface, litFill, litGradient } from './LitSurface';
export type { LitFill, LitSurfaceProps } from './LitSurface';

/**
 * RUN G1 (C1) — beyond §I's enumerated 26 and deliberately not a 26th role:
 * like LitSurface it is the FILL of surfaces that already exist. The emerald
 * glass system's one wearer — three materials as data in ui/tokens.ts,
 * rendered only through this component.
 */
export { Surface, SURFACE_GLOW_ALPHA } from './Surface';
export type { SurfaceProps } from './Surface';

/**
 * RUN T1 (C4) — beyond §I's enumerated 26 and deliberately not a 26th role:
 * like LitSurface and Surface it is a piece of DRAWING, not a component in the
 * vocabulary. Four surfaces each spelled the same hairline for themselves;
 * this is that hairline written once, with its dials.
 */
export { Divider } from './Divider';
export type { DividerProps } from './Divider';

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
 * §I "BottomNav". The tab bar's contract in one place — the tab lists, the press listener, the
 * screen options and what content keeps clear of the bar. The bar itself is the Melt-through
 * pill, components/MeltTabBar.tsx (2026-09-30).
 */
export {
  BOTTOM_NAV_TABS,
  bottomNavScreenOptions,
  CUSTOMER_BAR_TABS,
  CUSTOMER_CREATE_SLOT,
  HIDDEN_TAB_ITEM_OPTIONS,
  PINNED_FOOTER_BOTTOM_PADDING,
  useFloatingNavClearance,
  usePinnedFooterPadding,
  usePillReserve,
  useScrollClearance,
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
