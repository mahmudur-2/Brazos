# Motion inventory — what moves in the 120 Hz style, and what does not (2026-09-27)

Written for the Lux remake (`docs/dispatch/LUX-REMAKE.md`, ruling 14): every screen of the
practice copy (`.shots/refresh/practice`, the After) read for the motion it carries, from the
primitives its source names. The census script is `.shots/refresh/motion-census.mjs`
(scratch); this file is its reading, with what the remake added and what is noted for later.

## The three tiers

- **120 Hz style** — the motion boundary (`lib/motion120`): a Reanimated worklet on the UI
  thread where the binary has it, core `Animated` on the native driver where it does not, one
  shared choreography for both. The siblings: `PeekSheet` (the map's jobs pane), `SwipeableRow`
  (the inbox row), `DropMenu` (the chat's overflow), `KeyboardRisingColumn` (Chat's composer,
  the sign-in footers), `SuccessMark` (the published-job mark), `ModeTransitionOverlay` (the
  glass wipe), `RimLight` (Welcome's glint).
- **Native driver** — core `Animated` on transform and opacity only, no worklet: the entrance
  staggers (`hooks/useEntrance`), the press spring (`hooks/usePressFeedback`, now on every
  `Card`), the Setup / legal gate / Welcome / Verify entrances and pulses, the wizard's success
  overlay, and the crossfades this run added.
- **Nothing** — a state change that snaps: a chip's colour on select, the system switch, a
  Button's opacity dip (a colour, not a spring), a list's rows appearing, a sheet's arrival (the
  Modal's own slide) — noted per screen below.

## Added by the remake (the cheap ones, ruling 14)

- **"Your job is live" — the check draws itself.** `components/SuccessMark.*`: the glyph is two
  strokes of the disc's ink, the short leg then the long, each a rounded bar grown from its own
  start point by a transform (a scaleX about the left end) over the mark's one 950 ms progress
  (0.36–0.56 and 0.56–0.90 of it). Reanimated where present; a NEW native-driver fallback
  (`SuccessMarkAnimated`) where not; the still for reduced motion. Under a second, once.
- **Press scale on cards.** `components/Card.tsx` takes the shared press spring
  (`usePressFeedback`, 0.97 in, spring back, one haptic) on every pressable card — the hub
  cards, the rows on Profile, Account & safety, Appearance, the job cards.
- **The wizard's progress bar.** `screens/PostJobScreen.tsx`: each segment's fill crossfades in
  over 220 ms on the native driver as the step advances (`segmentFills`), instead of snapping;
  reduced motion jumps.
- **The worker's stepper.** `screens/WorkerJobScreen.tsx`: the done fill of each dot and
  connector crossfades in over 220 ms (`stageFills`) as the job moves on; reduced motion jumps.
- **The chip selection transition** — NOT added: a chip's fill and rim are colours, which the
  native driver cannot animate, and a JS-driven colour tween is the frame-dropping kind the 120
  Hz rule exists to keep out. Noted for a later pass as an opacity crossfade between two layers
  (the idle chip and the chosen one), the way the stepper does it.

## Screen by screen

`—` in the "does not move" column means everything on the screen that changes state already
moves in one of the two moving tiers.

| Screen | Moves today | Does not move (noted) |
|-|-|-|
| Welcome | RimLight glint (120 Hz); the entrance stagger (native driver) | — |
| Sign in (phone) | the footer rides the keyboard (120 Hz); the card's press spring | the field's focus ring is a colour tween (JS) |
| Sign in (email) | same; the eye toggles | same |
| Create account (phone / email) | the field focus tween (JS) | the buttons: opacity dip; no entrance |
| Verify phone | its own entrance and code-cell pulses (native driver) | — |
| Setup | the entrance stagger and the completion pulse (native driver) | the choice tiles' select crossfade is opacity (native driver) — moves |
| The legal gate | the unlock and the check (native driver) | the status rows' active fill snaps |
| Launch | the mark's timing (native driver) | — |
| Customer Home | the three-section entrance (native driver); hub cards' press spring; the bell | the tiles: no press scale (a Pressable with opacity); the service row snaps between tiles (a ScrollView snap, native) |
| The [+] sheet | the Modal's slide | the rows: opacity press |
| Discover | cards' press spring; the search button press | the tiles and chips snap; the results list appears without an entrance |
| A worker's profile | cards' press spring | the Save toggle snaps |
| Post a job · 1–4 | the step-pane entrances (native driver); the progress bar crossfade (added); the SuccessMark (120 Hz) | the category chips snap on select (see above); the day / window chips snap |
| Your job is live | the check draws itself (added); the mark's entrance (120 Hz) | — |
| My jobs (customer / worker) | hub cards' press spring | the segmented tabs snap; the lists appear without an entrance |
| The client's job detail | cards' press spring; Buttons' opacity dip | the offer cards' actions: opacity; the progress row snaps |
| Compare bids | — | the rows: opacity press |
| Bid detail | Buttons' opacity dip | the pinned bar: no rise |
| Counteroffer | the composer field (JS focus tween) | Send: opacity |
| Checkout | Buttons' opacity dip | the key-value rows: static |
| Job confirmed | — | no entrance (the template's mark is the glyph, not the SuccessMark) |
| Track worker | Buttons' opacity dip | the timeline's dots snap |
| Approve or report | Buttons' opacity dip | the photo grid: static |
| Review and tip | Buttons' opacity dip | the stars snap; the presets snap |
| Map (worker / customer) | PeekSheet's pull (120 Hz); the keyboard ride; the search pill's press | untouched by ruling 2 |
| The Filters sheet and popups | the Sheet's Modal slide; the popover's entrance (DropMenu constants) | untouched by ruling 2 |
| Available jobs | chips snap on select | the cards: opacity press (WorkerJobCard); no entrance |
| Job detail (worker) | cards' press spring; Buttons' opacity dip | the pinned bid bar: no rise |
| Submit a bid | Buttons' opacity dip; the field focus tween | the availability chips snap; the pinned Send: no rise |
| Bid sent | — | no entrance |
| The worker's job | the stepper crossfade (added); cards' press spring; Buttons' opacity dip | the pinned next-step button: no rise |
| Work checklist | — | the checkboxes snap; the pinned Add step: no rise |
| Route and arrival | Buttons' opacity dip | the two declarations snap |
| Worker Home | the toggle (system switch) | the Needs-you strip and the cards appear without an entrance; no press spring on WorkerJobCard |
| Earnings / Payouts | Buttons' opacity dip | the buckets: static |
| Services & availability | the toggle (system switch) | the category chips snap; the price-mode segment snaps |
| Inbox | SwipeableRow (120 Hz); the manage sheet's Modal slide | the filter pills snap |
| Chat | the composer rides the keyboard (120 Hz); DropMenu (120 Hz) | the bubbles appear without an entrance; the reaction picker: Modal |
| Hidden chats | — | — |
| Notification feed | — | the rows: static; Mark all read: opacity |
| Report dialog | the Modal's fade | the reasons' radios snap |
| Profile hub | cards' press spring; Buttons' opacity dip | the mode-switch row: opacity |
| Profile details / editing | cards' press spring | the field focus tween (JS) |
| Account & safety | cards' press spring | — |
| Notification settings | cards' press spring; the toggles (system switch) | the radius segment snaps |
| Appearance | cards' press spring | the theme radios snap |
| Payment methods / Terms / Saved workers | — | the rows: opacity press |
| Delete account | the pinned red button (FormScreen): opacity | the DELETE field focus tween (JS) |
| Switching mode | the glass wipe carrying the capsule (120 Hz) | — |

## What a later pass would do, in order of what is seen most

1. A shared press spring on `components/Button.tsx` (today an opacity dip): the one control
   pressed most often. Not done here because the Pressable's `style` is a function of `pressed`
   and the spring needs an `Animated.View` wrapper, which changes the control's flex layout in
   every row it sits in — a layout change, not a motion one.
2. The chip selection crossfade (above).
3. An entrance stagger on the list screens (Available jobs, My jobs, Inbox, the feed), the way
   Home's three sections arrive.
4. The pinned bars (Send a bid, Send, Add step, the next-step button) riding the keyboard through
   `KeyboardRisingColumn`, as the sign-in footers and Chat's composer do.
