/* THE REFRESH VIEWER'S SCREENS (2026-09-26) — every screen of the app, and the taps that reach it
   in the live app (bootstrap.js runs them). One entry per screen:
     id, group, name       what the list shows
     land                  'welcome' (signed out) | 'setup' (signed in, not set up) | 'legal' (the
                           terms not yet accepted) | 'app' (default: signed in, set up)
     mode                  'customer' (default) | 'worker'
     steps / afterSteps    the taps, in the harness's own vocabulary: press (accessibility label),
                           text (exact visible text), tab (a tab bar item), has (the smallest
                           pressable containing the text), fill (placeholder + value), scroll, wait;
                           afterSteps only where the refresh moved the way there
     before / after        what the notes under the phones say
     stand                 a line saying what a browser cannot show (the keyboard, Apple Maps, …) */
(function () {
  var W = { mode: 'worker' };
  var toSofa = [{ press: 'See all in My jobs' }, { has: 'Assemble a three-seat sofa' }];
  var toShelves = [{ press: 'See all in My jobs' }, { has: 'Mount three floating she' }];
  var toTv = [{ press: 'See all in My jobs' }, { tab: 'Review' }, { has: 'Mount a 65-inch TV abov' }];
  var toDresser = [{ press: 'See all in My jobs' }, { tab: 'Closed' }, { has: 'Help carry a dresser' }];
  var toJobs = [{ press: 'View all open jobs' }];
  var toWardrobe = [{ tab: 'My Jobs' }, { has: 'Assemble an IKEA PAX' }];
  var toMirror = [{ tab: 'My Jobs' }, { has: 'Hang a large mirror' }];
  var toChat = [{ tab: 'Inbox' }, { has: 'Mount three floating she' }];
  var postTyped = [
    { press: 'Post a job' },
    { fill: 'e.g. Walk my dog on weekday mornings', value: 'Assemble a bookcase and a desk' },
    { fill: 'Describe what you need done…', value: 'Two flat-pack pieces in the study, instructions in the boxes. Screwdriver needed.' },
    { press: 'Furniture Assembly' },
  ];
  var S = [
    // ---- sign-up and sign-in ----------------------------------------------------------------------
    { id: 'welcome', group: 'Sign-up & sign-in', name: 'Welcome', land: 'welcome', steps: [],
      before: ['The first screen: the art, the serif headline, phone first.', 'Press Replay to see the launch screen and the entrance again.'] },
    { id: 'signin-phone', group: 'Sign-up & sign-in', name: 'Sign in (phone)', land: 'welcome', steps: [{ press: 'I already have an account' }],
      stand: 'The phone keyboard is not shown: a browser has none, so Continue riding the keyboard can only be seen on the phone.' },
    { id: 'signin-email', group: 'Sign-up & sign-in', name: 'Sign in (email)', land: 'welcome', steps: [{ press: 'I already have an account' }, { press: 'Use Email Instead' }],
      stand: 'The phone keyboard is not shown: a browser has none.' },
    { id: 'create-phone', group: 'Sign-up & sign-in', name: 'Create account (phone)', land: 'welcome', steps: [{ press: 'Continue with phone' }],
      after: ['Phone stays first, as you ruled. "Use Email Instead" now carries your name, country and number over, so the email form arrives filled in.'] },
    { id: 'create-email', group: 'Sign-up & sign-in', name: 'Create account (email)', land: 'welcome', steps: [{ press: 'Continue with email' }] },
    { id: 'verify', group: 'Sign-up & sign-in', name: 'Verify phone', land: 'welcome',
      steps: [{ press: 'Continue with phone' }, { fill: 'Carlos Reyes', value: 'Mahmudur Rahman' }, { fill: '347 320 0610', value: '3473200610' }, { press: 'Create account' }],
      stand: 'Text-message sign-up is switched off, so the code screen never opens — this is what tapping Create account shows today.' },
    { id: 'legal', group: 'Sign-up & sign-in', name: 'Terms & Privacy (legal gate)', land: 'legal', steps: [] },
    { id: 'setup', group: 'Sign-up & sign-in', name: 'Setup', land: 'setup', steps: [] },

    // ---- customer -------------------------------------------------------------------------------------
    { id: 'home', group: 'Customer', name: 'Home', steps: [],
      before: ['The field says "Describe your task…" but its return key searches for workers — and so do the service tiles — while the pill under them starts a post: two products behind one card.', 'Notifications live only as a row deep in Profile, with no sign anything is waiting.'],
      after: ['Home is posting: the field’s return, "Post a job" and every tile start the same job draft — a tile with its category already picked.', 'Looking for a person instead is one quiet line under the pill: "Browse workers ›" carries what you typed into worker search.', 'A bell beside the greeting opens the notification feed, with a dot when something is unread.'] },
    { id: 'create-sheet', group: 'Customer', name: 'The [+] Create sheet', steps: [{ press: 'Create' }],
      after: ['"Switch to Worker" keeps the sheet up while it asks; say No and the sheet is still there, one tap from any other row.'] },
    { id: 'discover', group: 'Customer', name: 'Discover (find workers)', steps: [{ tab: 'Discover' }],
      before: ['The tab is "Discover" but the screen says "Find help" and draws a back arrow with nothing behind it.'],
      after: ['The tab root says "Discover" and has no back arrow. Pushed from Home’s "Browse workers" it is still "Find help", with its way back.'] },
    { id: 'discover-results', group: 'Customer', name: 'Discover · a category', steps: [{ tab: 'Discover' }, { press: 'Furniture Assembly' }] },
    { id: 'worker-profile', group: 'Customer', name: "A worker's public profile", steps: [{ tab: 'Discover' }, { press: 'Furniture Assembly' }, { has: 'Sam Okafor' }] },
    { id: 'post-what', group: 'Customer', name: 'Post a job · 1 What', steps: [{ press: 'Post a job' }],
      stand: 'Typing happens without the phone keyboard here.',
      before: ['The only way forward is the small "Media ›" link in the top-right corner; missing fields are reported by an alert after you tap it.', 'The back link reads "Home" wherever you came from.', '"Other" opens a second list of the same categories.'],
      after: ['Continue is a full-width button pinned to the bottom of every step, riding the keyboard. While it is disabled it says why, right above it: "Add a title to continue", then the description count, then "Pick a category to continue".', '"Required" sits beside Title, Description and Category; Category uses the same gold label as the fields above it.', '"Other" is an ordinary category — one tap, no second list.', 'The back arrow is a plain chevron. The "Media ›" link stays as a shortcut.', 'Backing out now keeps what you typed and uploaded: My jobs shows it as a draft with "Discard draft".'] },
    { id: 'post-media', group: 'Customer', name: 'Post a job · 2 Media', steps: postTyped.concat([{ press: 'Continue to Media' }]),
      after: ['The same pinned Continue as step 1; the "Add photos" tip sits directly above it.'] },
    { id: 'post-where', group: 'Customer', name: 'Post a job · 3 Where & when', steps: postTyped.concat([{ press: 'Continue to Media' }, { press: 'Continue to Location' }]),
      after: ['"Area or neighborhood" says Required, and Continue says "Add an area to continue" until it is filled.'] },
    { id: 'post-review', group: 'Customer', name: 'Post a job · 4 Review', steps: postTyped.concat([{ press: 'Continue to Media' }, { press: 'Continue to Location' }, { fill: 'e.g. Sheepshead Bay, Brooklyn', value: 'Park Slope, Brooklyn' }, { press: 'Continue to Review' }]),
      before: ['The review step opens with the budget; the job summary comes after it.'],
      after: ['Review opens with the review: the job summary first. Every row has a chevron and jumps straight back to the step that owns it.', 'Publish is the same pinned pill as Continue.'] },
    { id: 'post-price', group: 'Customer', name: 'Post a job · 4 Review · the price', steps: postTyped.concat([{ press: 'Continue to Media' }, { press: 'Continue to Location' }, { fill: 'e.g. Sheepshead Bay, Brooklyn', value: 'Park Slope, Brooklyn' }, { press: 'Continue to Review' }, { scroll: 'end' }]),
      before: ['Choosing between open bids and a set price happens inside the Edit budget dialog behind the pencil.'],
      after: ['"Ask for bids | Set a price" sits on the step, right above the amount — tap a side and the amount and the line under it follow.', 'The pencil still opens the amount editor; it no longer asks the question again.'] },
    { id: 'myjobs', group: 'Customer', name: 'My jobs', steps: [{ press: 'See all in My jobs' }],
      before: ['A hidden tab reached from Home and the [+] sheet — with no way back.'],
      after: ['A back chevron, the same as every pushed screen, returns you where you came from.'] },
    { id: 'myjobs-draft', group: 'Customer', name: 'My jobs · a draft in progress', draft: true, steps: [{ press: 'See all in My jobs' }],
      before: ['A draft only survives if the app was closed mid-post — backing out of the form deletes it.'],
      after: ['Backing out keeps the draft; this card resumes it, and "Discard draft" (with a confirm) is the one way to delete it, photos included.'] },
    { id: 'job-open', group: 'Customer', name: 'A job with bids', steps: toSofa },
    { id: 'job-bids', group: 'Customer', name: 'A job with bids · the bids', steps: toSofa.concat([{ scroll: 'end' }]) },
    { id: 'bid-detail', group: 'Customer', name: 'Bid detail', steps: toSofa.concat([{ scroll: 'end' }, { has: 'Full bid · counter or decline' }]) },
    { id: 'counter', group: 'Customer', name: 'Counteroffer', steps: toSofa.concat([{ scroll: 'end' }, { has: 'Full bid · counter or decline' }, { press: 'Counter' }]),
      stand: 'On the phone the keyboard covers the bottom half; the pinned Send rides above it.',
      after: ['"Send counter-offer" and the sentence saying what it does are pinned at the bottom, above the keyboard — no scrolling to find Send.'] },
    { id: 'accept', group: 'Customer', name: 'Accept a bid', steps: toSofa.concat([{ scroll: 'end' }, { has: 'Full bid · counter or decline' }, { has: 'Accept for $120' }]) },
    { id: 'job-assigned', group: 'Customer', name: 'A hired job', steps: toShelves },
    { id: 'job-assigned-pay', group: 'Customer', name: 'A hired job · payment', steps: toShelves.concat([{ scroll: 'end' }]) },
    { id: 'track', group: 'Customer', name: 'Track worker', steps: toShelves.concat([{ scroll: 'end' }, { press: 'Track worker' }]) },
    { id: 'job-done', group: 'Customer', name: 'A finished job', steps: toTv.concat([{ scroll: 'end' }]) },
    { id: 'approve', group: 'Customer', name: 'Approve or report', steps: toTv.concat([{ scroll: 'end' }, { press: 'Review & approve the work' }]), afterSteps: toTv.concat([{ has: 'Review & approve' }]) },
    { id: 'job-paid', group: 'Customer', name: 'A paid job', steps: toDresser.concat([{ scroll: 'end' }]) },

    // ---- worker ------------------------------------------------------------------------------------------
    { id: 'w-home', group: 'Worker', name: 'Worker Home', mode: 'worker', steps: [],
      before: ['Nothing on Home says what needs you — a hired job waiting for you to head out sits two tabs away.', '"AVAILABLE NOW · Online · Visible to customers" promises something the switch never did: it does not hide you.'],
      after: ['"Needs you" sits under the hero: the next move on each hired job (or a counteroffer to answer), two at a time, each opening straight to it.', 'The switch says what it is: TAKING NEW WORK · Open, "Shown as available on your profile" — or Paused, "Offers still reach you".', 'The same bell as the customer Home, beside "Switch to Customer".'] },
    { id: 'w-jobs', group: 'Worker', name: 'Available jobs', mode: 'worker', steps: toJobs,
      after: ['A "Filters" chip ends the distance row, mid-screen where the thumb is; the header icon stays as a duplicate.', 'A chosen chip shows a check as well as its colour.'] },
    { id: 'w-filters', group: 'Worker', name: 'Filters', mode: 'worker', steps: toJobs.concat([{ press: 'Filters' }]) },
    { id: 'w-map', group: 'Worker', name: 'Map', mode: 'worker', steps: [{ tab: 'Map' }],
      stand: 'The map tiles are the web map, not Apple Maps; the phone draws Apple Maps.' },
    { id: 'w-detail', group: 'Worker', name: 'Job detail (worker)', mode: 'worker', steps: toJobs.concat([{ has: 'Dog walking - twice this week' }]) },
    { id: 'w-detail-bid', group: 'Worker', name: 'Job detail · the bid', mode: 'worker', steps: toJobs.concat([{ has: 'Dog walking - twice this week' }, { scroll: 'end' }]) },
    { id: 'w-submit', group: 'Worker', name: 'Submit a bid', mode: 'worker', steps: toJobs.concat([{ has: 'Dog walking - twice this week' }, { press: 'Write a bid' }]),
      stand: 'On the phone the keyboard covers the bottom half; the pinned Send bid rides above it.',
      before: ['"Send bid" is the last thing on a long form — under the keyboard while you type.'],
      after: ['The sentence saying what sending does and "Send bid" are pinned at the bottom, above the keyboard. The fields scroll above them.'] },
    { id: 'w-myjobs', group: 'Worker', name: 'My jobs (worker)', mode: 'worker', steps: [{ tab: 'My Jobs' }] },
    { id: 'w-home-summary', group: 'Worker', name: 'Worker Home · the summary card', mode: 'worker', steps: [{ scroll: 600 }] },
    { id: 'w-job-hired', group: 'Worker', name: "The worker's job · hired, not started", mode: 'worker', steps: toMirror,
      stand: 'Tapping the address opens Apple Maps on the phone; a browser has no Maps app to open.',
      before: ['Two cards of equal weight — "Route & arrival / Work checklist" and "Ready to start?" — and the exact address is two screens away on Route & arrival.', 'The payment card sits above the work.'],
      after: ['GETTING THERE comes first: the exact address (tap for directions in Apple Maps), the arrival window, and Message Dana.', 'YOUR PROGRESS is one stepper — On my way → Arrived → Started → Finished — and the one pinned button is always the next step: I’m on my way, then I’ve arrived, then Start job, then Mark complete.', 'Declaring the trip stays optional: "Already there? Start the job" sits under the button.', 'Work checklist is one fixed row; the payment card drops below the work.'] },
    { id: 'w-route', group: 'Worker', name: 'Route & arrival', mode: 'worker', steps: toMirror.concat([{ press: 'Route & arrival' }]), afterSteps: toMirror.concat([{ press: 'Arrival details' }]),
      before: ['Reached from the "Route & arrival" button.'],
      after: ['Reached from the progress card. Once you’ve arrived, its last button is Start job itself, not "Back to the job".'] },
    { id: 'w-job', group: 'Worker', name: "The worker's job · working", mode: 'worker', steps: toWardrobe,
      after: ['The stepper shows On my way and Arrived done; the pinned button is Mark complete.'] },
    { id: 'w-job-end', group: 'Worker', name: "The worker's job · finish", mode: 'worker', steps: toWardrobe.concat([{ scroll: 'end' }]),
      after: ['Finish up keeps the photo rule word for word; its Mark complete moved to the pinned bar, so it is reachable from anywhere on the screen.'] },
    { id: 'w-checklist', group: 'Worker', name: 'Work checklist', mode: 'worker', steps: toWardrobe.concat([{ scroll: 'end' }, { press: 'Work checklist' }]) },
    { id: 'w-earnings', group: 'Worker', name: 'Earnings', mode: 'worker', steps: [{ tab: 'Profile' }, { scroll: 'end' }, { press: 'Earnings' }], afterSteps: [{ tab: 'Profile' }, { scroll: 'end' }, { press: 'Earnings & payouts' }],
      after: ['Titled "Earnings & payouts", the row that opened it.'] },
    { id: 'w-services', group: 'Worker', name: 'Services & availability', mode: 'worker', steps: [{ tab: 'Profile' }, { scroll: 'end' }, { press: 'Services & availability' }] },

    // ---- messages ------------------------------------------------------------------------------------------
    { id: 'inbox', group: 'Messages', name: 'Inbox', steps: [{ tab: 'Inbox' }],
      before: ['Mute, block, report and the rest hide behind a long press (or a swipe) that nothing on the row mentions.'],
      after: ['Every row carries a visible ⋯ at its trailing edge; the long press and the swipe stay as shortcuts.'] },
    { id: 'inbox-manage', group: 'Messages', name: 'Inbox · manage a conversation', steps: [{ tab: 'Inbox' }, { press: 'More' }], afterSteps: [{ tab: 'Inbox' }, { press: 'Manage conversation with Sam Okafor' }],
      before: ['Thirteen actions across three stacked sheets: Mute · Block · Report · More → a second sheet → a third for how long.'],
      after: ['ONE sheet: Mute, Mark as Unread, Archive (and Hide where the phone allows), then in red Block…, Report, Clear or delete chat….', 'Block… opens one chooser — Permanently first, then 1 hour / 24 hours / 7 days — and each confirms.'] },
    { id: 'chat', group: 'Messages', name: 'Chat', steps: toChat, stand: 'The phone keyboard is not shown: a browser has none.' },
    { id: 'chat-menu', group: 'Messages', name: 'Chat · the menu', steps: toChat.concat([{ press: 'More' }]),
      before: ['The ⋯ menu has profile rows and Mute — Block and Report are not in it at all.'],
      after: ['The same skeleton in both modes: View Profile · Rating / Reviews · Save / Hire again · Share Profile, then Mute · Block… · Report in red.'] },
    { id: 'chat-block', group: 'Messages', name: 'Chat · Block…', steps: toChat.concat([{ press: 'More' }]), afterSteps: toChat.concat([{ press: 'More' }, { press: 'Block…' }]),
      after: ['Block… from the conversation opens the same chooser the inbox uses: Permanently, or for 1 hour / 24 hours / 7 days.'] },
    { id: 'report', group: 'Messages', name: 'Report', steps: [{ tab: 'Inbox' }, { press: 'Report' }] },
    { id: 'feed', group: 'Messages', name: 'Notification feed', steps: [{ tab: 'Profile' }, { scroll: 'end' }, { press: 'Notification feed' }] },

    // ---- profile and settings -------------------------------------------------------------------------------
    { id: 'profile', group: 'Profile & settings', name: 'Profile', steps: [{ tab: 'Profile' }],
      before: ['The hub opens on a slogan card ("Past work & settings") with a ghost B — no name, no photo.', 'Nothing here says which mode you are in, or how to change it.', 'The header pencil opens the read-only details page, and a second Edit chip opens editing.'],
      after: ['"Your profile" opens on you: photo, name and rating (or "New"); tap it for Profile details.', 'Right under it, the one standing mode switch — "You’re in customer mode · Switch to Worker", confirms first, the same in both modes.', 'The header pencil goes straight to editing. No B mark anywhere but the Launch screen.'] },
    { id: 'profile-more', group: 'Profile & settings', name: 'Profile · settings', steps: [{ tab: 'Profile' }, { scroll: 'end' }],
      before: ['Account & safety is a small "Account" chip in the Settings card’s corner.', 'Rows read "Notifications" and "Notification feed" side by side, and "Earnings" never mentions payouts.'],
      after: ['The rows come in the mode’s order — a customer sees Saved & past workers first; a worker sees Earnings & payouts first.', '"Notification settings" and "Notification feed" are named apart, and "Earnings & payouts" says what is inside.', 'Account & safety is a full row at the bottom: payment, appearance, legal, log out.'] },
    { id: 'profile-worker', group: 'Profile & settings', name: 'Profile (worker mode)', mode: 'worker', steps: [{ tab: 'Profile' }, { scroll: 'end' }],
      after: ['The same hub, worker-first: Earnings & payouts and Services & availability lead, and the switch reads "Switch to Customer".'] },
    { id: 'details', group: 'Profile & settings', name: 'Profile details', steps: [{ tab: 'Profile' }, { press: 'Profile details' }], afterSteps: [{ tab: 'Profile' }, { press: 'View your profile' }],
      after: ['Reached by tapping your name card.'] },
    { id: 'edit', group: 'Profile & settings', name: 'Editing your profile', steps: [{ tab: 'Profile' }, { press: 'Edit your profile' }] },
    { id: 'safety', group: 'Profile & settings', name: 'Account & safety', steps: [{ tab: 'Profile' }, { scroll: 'end' }, { press: 'Account and safety' }],
      before: ['The page is titled "Profile".'],
      after: ['Titled "Account & safety", the row that opened it; the ghost B is gone.', 'The mode switch sits under "One identity, two modes" — the sentence that explains it.'] },
    { id: 'safety-more', group: 'Profile & settings', name: 'Account & safety · the switch', steps: [{ tab: 'Profile' }, { scroll: 'end' }, { press: 'Account and safety' }, { scroll: 'end' }] },
    { id: 'notif', group: 'Profile & settings', name: 'Notification settings', steps: [{ tab: 'Profile' }, { scroll: 'end' }, { press: 'Notifications' }], afterSteps: [{ tab: 'Profile' }, { scroll: 'end' }, { press: 'Notification settings' }],
      after: ['Titled "Notification settings", the row that opened it.'] },
    { id: 'appearance', group: 'Profile & settings', name: 'Appearance', steps: [{ tab: 'Profile' }, { scroll: 'end' }, { press: 'Account and safety' }, { press: 'Appearance' }] },
    { id: 'payment', group: 'Profile & settings', name: 'Payment methods', steps: [{ tab: 'Profile' }, { scroll: 'end' }, { press: 'Account and safety' }, { press: 'Payment methods' }] },
    { id: 'terms', group: 'Profile & settings', name: 'Terms of Service', steps: [{ tab: 'Profile' }, { scroll: 'end' }, { press: 'Account and safety' }, { press: 'Terms of Service' }] },
    { id: 'saved', group: 'Profile & settings', name: 'Saved & past workers', mode: 'worker', steps: [{ tab: 'Profile' }, { scroll: 'end' }, { press: 'Saved & past workers' }] },
    { id: 'delete', group: 'Profile & settings', name: 'Delete account', steps: [{ tab: 'Profile' }, { scroll: 'end' }, { press: 'Account and safety' }, { scroll: 'end' }, { has: 'Delete account' }],
      after: ['"Delete my account" is pinned at the bottom in red, disabled until DELETE is typed — reachable with the keyboard up.'] },
    { id: 'mode-switch', group: 'Profile & settings', name: 'Switching mode (the glass wipe)', steps: [{ press: 'Create' }, { press: 'Switch to Worker' }],
      before: ['Confirm the switch in the dialog to watch the glass wipe carry the capsule.'] },
  ];
  S.forEach(function (s) { if (s.mode === 'worker') Object.assign(s, W); });
  window.REFRESH_SCREENS = S;
})();
