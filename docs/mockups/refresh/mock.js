/* THE REFRESH VIEWER'S SAMPLE WORLD (2026-09-26) — every request the app makes to its fake
   project (bootstrap.js routes them here) answered from one small, coherent world held in memory,
   so every screen of the real app can be reached and used without any server.

   HONESTY. Sample data by the operator's ruling ("Sample data on my PC"), and it lives ONLY in
   this viewer: the app, its repository data and its users never see it. No rating, review score,
   completion rate, response time or job count is invented — every worker reads "New worker", and
   the counts the app shows are computed from the rows below. Photos are the app's own art.

   THE WORLD. You are Mahmudur Rahman (one account, both modes). Customer side: a sofa job open
   with two sealed bids (Sam $120, Priya $135); a shelves job funded and Sam on his way ($110 →
   $118.25 charged → $101.75 to Sam, the 7.5 % + 7.5 % fee schedule); a TV job Sam has finished,
   waiting for your approval; a dresser job Priya finished and was paid for, ready for a review.
   Worker side: four open jobs posted by Dana Whitfield (the harness's own four rows), your pending
   bid on one of them, a wardrobe job of Dana's you are working on now, and a paid door repair.
   Writes change the world, so a flow can be walked: a bid, an accept, a message, a status step. */
(function () {
  'use strict';
  var R = window.__REFRESH__ || {};
  var HOST = 'https://harness.supabase.co';
  var H = 3600e3, D = 24 * H, NOW = Date.now();
  var ago = function (ms) { return new Date(NOW - ms).toISOString(); };
  var ahead = function (ms) { return new Date(NOW + ms).toISOString(); };
  var today = function (offsetDays) { var d = new Date(NOW + (offsetDays || 0) * D); return d.toISOString().slice(0, 10); };
  var uuid = function (n) { return '00000000-0000-4000-8000-' + String(n).padStart(12, '0'); };
  var seq = 5000;
  var newId = function () { return uuid(++seq); };
  var clone = function (v) { return v == null ? v : JSON.parse(JSON.stringify(v)); };
  var LEGAL = window.__REFRESH_LEGAL__ || { terms: '2026-07-26-draft1', privacy: '2026-07-26-draft1' };

  var ME = uuid(1), DANA = uuid(2), SAM = uuid(3), PRIYA = uuid(4);
  var photo = function (name) { return HOST + '/storage/v1/object/public/job-photos/samples/' + name; };
  var chatPhoto = function (name) { return 'storage://chat-photos/samples/' + name; };

  // ---- people ------------------------------------------------------------------------------
  var profile = function (id, name, extra) {
    return Object.assign({
      id: id, full_name: name, avatar_url: null, role: 'client', bio: null, language: 'en', categories: [],
      completion_rate: null, on_time_pct: null, response_time: null, accepting_work: false, availability_note: null,
      phone: null, is_admin: false, banned: false, active_mode: null, deleted_at: null, created_at: ago(60 * D),
    }, extra || {});
  };
  var db = {
    profiles: [
      profile(ME, 'Mahmudur Rahman', { phone: '+13473200610', categories: ['furniture_assembly', 'handyman'], accepting_work: R.mode === 'worker', availability_note: 'Evenings and weekends.', bio: 'I help out with assembly and small fixes around Brooklyn.' }),
      profile(DANA, 'Dana Whitfield'),
      profile(SAM, 'Sam Okafor', { role: 'worker', bio: 'Flat-pack and wall-mounting work most evenings and weekends. I bring my own tools and clear the packaging away.', categories: ['furniture_assembly', 'tv_mounting', 'handyman'], accepting_work: true, availability_note: 'Evenings and weekends.' }),
      profile(PRIYA, 'Priya Natarajan', { role: 'worker', bio: 'Moving help and careful furniture handling. Stairs are no problem.', categories: ['moving', 'packing', 'furniture_assembly'], accepting_work: true, availability_note: 'Weekday mornings.' }),
    ],
  };

  // ---- jobs --------------------------------------------------------------------------------
  var job = function (n, client, title, category, location, extra) {
    return Object.assign({
      id: uuid(n), client_id: client, title: title, description: title, category: category, location: location,
      budget_cents: null, budget_min_cents: null, budget_max_cents: null, pricing_mode: 'open_bids',
      scheduled_date: null, arrival_start_hour: null, arrival_end_hour: null, status: 'open', created_at: ago(2 * H),
      photos: [], videos: [], assigned_worker_id: null, final_amount_cents: null, completion_photo_url: null,
      completion_photos: [], completion_videos: [], en_route_at: null, arrived_at: null, completed_at: null, series_id: null,
      visibility: 'open_market', accepted_bid_id: null, accepted_offer_id: null, scheduled_for: null,
      location_text: null, property_id: null, area_code: null, updated_at: ago(H),
    }, extra || {});
  };
  var J = { sofa: uuid(201), shelves: uuid(202), tv: uuid(203), dresser: uuid(204), wardrobe: uuid(205), door: uuid(206), mirror: uuid(207) };
  db.jobs = [
    // the customer side (you post)
    job(201, ME, 'Assemble a three-seat sofa and an armchair', 'furniture_assembly', 'Park Slope, Brooklyn, NY', {
      description: 'Both pieces are boxed in the living room. The sofa has a chaise section; instructions are in the boxes.',
      budget_min_cents: 10000, budget_max_cents: 14000, budget_cents: 14000, scheduled_date: today(2), arrival_start_hour: 17, arrival_end_hour: 20,
      photos: [photo('armchair.webp')], created_at: ago(3 * H),
    }),
    job(202, ME, 'Mount three floating shelves in the hallway', 'handyman', 'Park Slope, Brooklyn, NY', {
      description: 'Three 36-inch oak shelves, drywall, anchors needed. I would like them level and evenly spaced.',
      budget_cents: 11000, status: 'assigned', assigned_worker_id: SAM, final_amount_cents: 11000, accepted_offer_id: uuid(303),
      scheduled_date: today(0), arrival_start_hour: 18, arrival_end_hour: 20, en_route_at: ago(12 * 60e3), created_at: ago(2 * D),
      series_id: uuid(801), // idea 14: repeats every 2 weeks with Sam
    }),
    job(203, ME, 'Mount a 65-inch TV above the fireplace', 'tv_mounting', 'Park Slope, Brooklyn, NY', {
      description: 'Brick above the fireplace, bracket is here. Cables should run down the side.',
      budget_cents: 14000, status: 'completed', assigned_worker_id: SAM, final_amount_cents: 14000, accepted_offer_id: uuid(304),
      en_route_at: ago(6 * H), arrived_at: ago(5.6 * H), completed_at: ago(5 * H), completion_photos: [photo('room.webp')], created_at: ago(4 * D),
    }),
    job(204, ME, 'Help carry a dresser down two flights', 'moving', 'Park Slope, Brooklyn, NY', {
      budget_cents: 8000, status: 'completed', assigned_worker_id: PRIYA, final_amount_cents: 8000, accepted_offer_id: uuid(305),
      en_route_at: ago(3.2 * D), arrived_at: ago(3.1 * D), completed_at: ago(3 * D), created_at: ago(6 * D),
    }),
    // the worker side (Dana posts; you work)
    job(101, DANA, 'Dog walking - twice this week', 'dog_walking', 'East Flatbush, Brooklyn, NY', { budget_cents: 7500, created_at: ago(2 * H), needed_today: true }), // idea 12: posted needed today
    job(102, DANA, 'Mount a 55-inch TV in the living room', 'tv_mounting', 'Bed-Stuy, Brooklyn, NY', { budget_min_cents: 9000, budget_max_cents: 12000, budget_cents: 12000, created_at: ago(6 * H) }),
    job(103, DANA, 'Help moving boxes into a third-floor walk-up', 'packing', 'Crown Heights, Brooklyn, NY', { budget_min_cents: 14000, budget_max_cents: 18000, budget_cents: 18000, created_at: ago(24 * H) }),
    job(104, DANA, 'Paint one bedroom, walls only', 'painting', 'Prospect Heights, Brooklyn, NY', { budget_min_cents: 20000, budget_max_cents: 26000, budget_cents: 26000, created_at: ago(72 * H) }),
    job(205, DANA, 'Assemble an IKEA PAX wardrobe', 'furniture_assembly', 'Prospect Heights, Brooklyn, NY', {
      description: 'Two-door PAX with hinges and one drawer set. Boxes are in the bedroom.',
      budget_cents: 9000, status: 'in_progress', assigned_worker_id: ME, final_amount_cents: 9000, accepted_offer_id: uuid(306),
      scheduled_date: today(0), en_route_at: ago(70 * 60e3), arrived_at: ago(50 * 60e3), created_at: ago(3 * D),
    }),
    job(206, DANA, 'Fix a squeaky bedroom door', 'handyman', 'Prospect Heights, Brooklyn, NY', {
      budget_cents: 6000, status: 'completed', assigned_worker_id: ME, final_amount_cents: 6000, accepted_offer_id: uuid(307),
      en_route_at: ago(9.1 * D), arrived_at: ago(9.05 * D), completed_at: ago(9 * D), created_at: ago(11 * D),
    }),
    job(207, DANA, 'Hang a large mirror in the hallway', 'handyman', 'Prospect Heights, Brooklyn, NY', {
      description: 'A 40 kg mirror, about 90 x 120 cm, on a plaster wall. The cleat is in the box.',
      budget_cents: 7000, status: 'assigned', assigned_worker_id: ME, final_amount_cents: 7000, accepted_offer_id: uuid(309),
      scheduled_date: today(0), arrival_start_hour: 16, arrival_end_hour: 18, created_at: ago(1.5 * D),
      series_id: uuid(802), // idea 14: Dana's weekly repeat; you get each visit first
    }),
  ];
  db.job_locations = [
    { job_id: J.sofa, lat: 40.6715, lng: -73.9777, address_line: '214 5th Ave, Apt 3B, Brooklyn, NY 11215' },
    { job_id: J.shelves, lat: 40.6715, lng: -73.9777, address_line: '214 5th Ave, Apt 3B, Brooklyn, NY 11215' },
    { job_id: J.tv, lat: 40.6715, lng: -73.9777, address_line: '214 5th Ave, Apt 3B, Brooklyn, NY 11215' },
    { job_id: J.dresser, lat: 40.6715, lng: -73.9777, address_line: '214 5th Ave, Apt 3B, Brooklyn, NY 11215' },
    { job_id: J.wardrobe, lat: 40.6773, lng: -73.9645, address_line: '88 Lincoln Pl, Apt 2, Brooklyn, NY 11217' },
    { job_id: J.door, lat: 40.6773, lng: -73.9645, address_line: '88 Lincoln Pl, Apt 2, Brooklyn, NY 11217' },
    { job_id: J.mirror, lat: 40.6773, lng: -73.9645, address_line: '88 Lincoln Pl, Apt 2, Brooklyn, NY 11217' },
  ];

  // ---- repeating jobs (idea 14, migration 20260930001000) -----------------------------------
  var series = function (n, client, originJob, cadence, nextDate, worker, price) {
    return {
      id: uuid(n), client_id: client, origin_job_id: originJob, cadence: cadence, anchor_date: today(0), next_visit_no: 1,
      next_visit_date: nextDate, worker_id: worker, price_cents: price, pending_job_id: null, dropped_worker_id: null,
      status: 'active', stopped_at: null, last_error: null, created_at: ago(2 * D), updated_at: ago(H),
    };
  };
  db.job_series = [
    series(801, ME, J.shelves, 'biweekly', today(14), SAM, 11000),
    series(802, DANA, J.mirror, 'weekly', today(7), ME, 7000),
  ];

  // ---- offers (sealed bids) -----------------------------------------------------------------
  var offer = function (n, jobId, worker, amount, status, extra) {
    var j = db.jobs.find(function (x) { return x.id === jobId; });
    return Object.assign({
      id: uuid(n), job_id: jobId, offer_type: 'marketplace_bid', parent_offer_id: null, root_offer_id: uuid(n),
      customer_id: j.client_id, worker_id: worker, author_id: worker, awaiting_id: status === 'pending' ? j.client_id : null,
      amount_cents: amount, message: null, status: status, expires_at: ahead(2 * D), created_at: ago(2 * H), updated_at: ago(2 * H),
    }, extra || {});
  };
  db.job_offers = [
    offer(301, J.sofa, SAM, 12000, 'pending', { message: 'I can do both pieces on Thursday evening. I bring my own tools and take the packaging away.', created_at: ago(2.5 * H), updated_at: ago(2.5 * H) }),
    offer(302, J.sofa, PRIYA, 13500, 'pending', { message: 'Happy to help. I have assembled this sofa model before.', created_at: ago(1.2 * H), updated_at: ago(1.2 * H) }),
    offer(303, J.shelves, SAM, 11000, 'accepted', { message: 'I have anchors for drywall and a laser level.', created_at: ago(2 * D), updated_at: ago(1.5 * D) }),
    offer(304, J.tv, SAM, 14000, 'accepted', { created_at: ago(4 * D), updated_at: ago(3.5 * D) }),
    offer(305, J.dresser, PRIYA, 8000, 'accepted', { created_at: ago(6 * D), updated_at: ago(5.5 * D) }),
    offer(306, J.wardrobe, ME, 9000, 'accepted', { created_at: ago(3 * D), updated_at: ago(2.5 * D) }),
    offer(307, J.door, ME, 6000, 'accepted', { created_at: ago(11 * D), updated_at: ago(10 * D) }),
    offer(309, J.mirror, ME, 7000, 'accepted', { created_at: ago(1.5 * D), updated_at: ago(1.2 * D) }),
    offer(308, uuid(102), ME, 10500, 'pending', { message: 'I can mount it this weekend with the cables hidden in a raceway.', created_at: ago(4 * H), updated_at: ago(4 * H) }),
  ];

  // ---- money: the 7.5 % + 7.5 % schedule, integer cents ---------------------------------------
  var fee = function (cents) { return Math.round(cents * 0.075); };
  var payment = function (n, jobId, offerId, payer, payee, amount, status, extra) {
    return Object.assign({
      id: uuid(n), job_id: jobId, offer_id: offerId, payer_id: payer, payee_id: payee, kind: 'job_payment',
      amount_cents: amount, platform_fee_cents: fee(amount), provider: 'sandbox', provider_ref: 'sandbox_' + n, status: status,
      authorized_at: ago(2 * D), held_at: ago(2 * D), released_at: null, release_reason: null, paid_out_at: null,
      created_at: ago(2 * D), updated_at: ago(2 * D), charge_amount_cents: amount + fee(amount), customer_fee_cents: fee(amount),
      tax_cents: 0, funding_due_at: null, release_requested_at: null, transfer_cents: amount - fee(amount), refund_cents: null,
      refund_reason: null, transfer_attempts: 0, transfer_ref: null,
    }, extra || {});
  };
  db.payments = [
    payment(401, J.shelves, uuid(303), ME, SAM, 11000, 'held', { held_at: ago(1.5 * D) }),
    payment(402, J.tv, uuid(304), ME, SAM, 14000, 'held', { held_at: ago(3.5 * D) }),
    payment(403, J.dresser, uuid(305), ME, PRIYA, 8000, 'released', { held_at: ago(5.5 * D), release_requested_at: ago(3 * D), released_at: ago(2.9 * D), release_reason: 'approved', updated_at: ago(2.9 * D) }),
    payment(404, J.wardrobe, uuid(306), DANA, ME, 9000, 'held', { held_at: ago(2.5 * D) }),
    payment(406, J.mirror, uuid(309), DANA, ME, 7000, 'held', { held_at: ago(1.2 * D) }),
    payment(405, J.door, uuid(307), DANA, ME, 6000, 'released', { held_at: ago(10 * D), release_requested_at: ago(9 * D), released_at: ago(8.9 * D), release_reason: 'approved', updated_at: ago(8.9 * D) }),
  ];

  // ---- messages (unlocked by assignment only) --------------------------------------------------
  var msg = function (n, jobId, sender, content, at, extra) {
    return Object.assign({
      id: uuid(n), job_id: jobId, direct_thread_id: null, sender_id: sender, content: content, image_url: null, audio_url: null,
      audio_duration_ms: null, document_url: null, document_name: null, document_size_bytes: null, reply_to_id: null,
      job_request_id: null, job_offer_id: null, request_event: null, request_amount_cents: null, unsent_at: null, created_at: at,
    }, extra || {});
  };
  db.messages = [
    msg(501, J.shelves, SAM, 'Hi Mahmudur, thanks for choosing me. I will bring drywall anchors and a laser level.', ago(1.4 * D)),
    msg(502, J.shelves, ME, 'Great. The shelves are in the hallway, still in their boxes.', ago(1.39 * D)),
    msg(503, J.shelves, SAM, 'Here is the level I use, so the three line up exactly.', ago(1.3 * D), { image_url: chatPhoto('toolbox.webp') }),
    msg(504, J.shelves, SAM, 'On my way now, about 15 minutes.', ago(12 * 60e3)),
    msg(511, J.tv, SAM, 'All done. The cables run down the right side in a paintable raceway.', ago(5 * H)),
    msg(512, J.tv, SAM, 'Photos are in the app. Let me know if anything needs adjusting.', ago(4.9 * H)),
    msg(521, J.dresser, PRIYA, 'The dresser is down and the stairs are clear. Thanks!', ago(3 * D)),
    msg(531, J.wardrobe, DANA, 'The boxes are in the bedroom on the left. The buzzer code is 2B.', ago(2 * H)),
    msg(532, J.wardrobe, ME, 'Thanks Dana, I am here and starting now.', ago(48 * 60e3)),
    msg(541, J.door, DANA, 'The door is silent now, thank you.', ago(9 * D)),
  ];
  db.message_reads = [
    { job_id: J.shelves, user_id: ME, last_read_at: ago(1.3 * D) },
    { job_id: J.tv, user_id: ME, last_read_at: ago(4.8 * H) },
    { job_id: J.dresser, user_id: ME, last_read_at: ago(2.9 * D) },
    { job_id: J.wardrobe, user_id: ME, last_read_at: ago(47 * 60e3) },
    { job_id: J.door, user_id: ME, last_read_at: ago(8 * D) },
    { job_id: J.shelves, user_id: SAM, last_read_at: ago(1.35 * D) },
    { job_id: J.wardrobe, user_id: DANA, last_read_at: ago(47 * 60e3) },
  ];
  db.message_reactions = [];
  db.conversation_states = [];
  db.direct_threads = [];
  db.live_location_shares = [];

  // ---- everything else ------------------------------------------------------------------------
  var note = function (n, category, type, title, body, data, at, read) {
    return { id: uuid(n), recipient_id: ME, category: category, type: type, title: title, body: body, data: data, read_at: read ? at : null, created_at: at };
  };
  db.notification_outbox = [
    note(601, 'messages', 'message', 'Sam Okafor', 'On my way now, about 15 minutes.', { job_id: J.shelves }, ago(12 * 60e3), false),
    note(602, 'bids', 'bid_received', 'New bid on Assemble a three-seat sofa and an armchair', 'Priya Natarajan bid $135.00', { screen: 'ClientJobDetail', jobId: J.sofa }, ago(1.2 * H), false),
    note(603, 'bids', 'bid_received', 'New bid on Assemble a three-seat sofa and an armchair', 'Sam Okafor bid $120.00', { screen: 'ClientJobDetail', jobId: J.sofa }, ago(2.5 * H), false),
    note(604, 'job_updates', 'job_completed', 'Work marked complete', 'Review and approve Mount a 65-inch TV above the fireplace.', { job_id: J.tv }, ago(5 * H), true),
    note(605, 'messages', 'message', 'Dana Whitfield', 'The boxes are in the bedroom on the left. The buzzer code is 2B.', { job_id: J.wardrobe }, ago(2 * H), true),
    note(606, 'job_updates', 'payment_released', 'Payment released', '$55.50 for Fix a squeaky bedroom door is on its way to your payouts.', { job_id: J.door }, ago(8.9 * D), true),
  ];
  db.notification_prefs = [{ user_id: ME, messages: true, bids: true, job_updates: true, hire_requests: true, nearby_jobs: true, nearby_radius_miles: 5, home_lat: 40.6715, home_lng: -73.9777 }];
  var service = function (n, worker, title, description, category, price, unit, position) {
    return { id: uuid(n), worker_id: worker, title: title, description: description, category: category, price_cents: price, price_unit: unit, published: true, position: position, created_at: ago(30 * D), updated_at: ago(30 * D) };
  };
  db.worker_services = [
    service(701, SAM, 'Flat-pack furniture assembly', 'Beds, wardrobes, desks and shelving, any brand.', 'furniture_assembly', 6000, 'flat', 0),
    service(702, SAM, 'TV mounting', 'Bracket supplied on request; cables tidied.', 'tv_mounting', 4500, 'hour', 1),
    service(703, SAM, 'Shelves and pictures', 'Level, anchored and evenly spaced.', 'handyman', 4000, 'hour', 2),
    service(704, ME, 'Furniture assembly', 'Flat-pack of any size, packaging taken away.', 'furniture_assembly', 5500, 'flat', 0),
    service(705, ME, 'Small repairs', 'Squeaks, hinges, loose handles and shelves.', 'handyman', 3500, 'hour', 1),
  ];
  db.portfolio_items = [
    { id: uuid(801), worker_id: SAM, source_job_id: null, photo_url: photo('armchair.webp'), category: 'furniture_assembly', caption: 'Armchair and side table, assembled', display_order: 0, created_at: ago(20 * D) },
    { id: uuid(802), worker_id: SAM, source_job_id: null, photo_url: photo('toolbox.webp'), category: 'handyman', caption: 'Tool kit I bring to every job', display_order: 1, created_at: ago(18 * D) },
    { id: uuid(803), worker_id: ME, source_job_id: J.door, photo_url: photo('room.webp'), category: 'handyman', caption: 'Bedroom door, rehung and quiet', display_order: 0, created_at: ago(8 * D) },
  ];
  db.saved_workers = [{ user_id: ME, worker_id: SAM, created_at: ago(1.5 * D) }];
  db.job_checklist_items = [
    { id: uuid(901), job_id: J.wardrobe, position: 0, label: 'Unbox and sort the panels', done: true, done_at: ago(40 * 60e3), created_at: ago(50 * 60e3) },
    { id: uuid(902), job_id: J.wardrobe, position: 1, label: 'Build the frame', done: true, done_at: ago(15 * 60e3), created_at: ago(50 * 60e3) },
    { id: uuid(903), job_id: J.wardrobe, position: 2, label: 'Hang the doors and level them', done: false, done_at: null, created_at: ago(50 * 60e3) },
    { id: uuid(904), job_id: J.wardrobe, position: 3, label: 'Clear away the packaging', done: false, done_at: null, created_at: ago(50 * 60e3) },
  ];
  db.job_disputes = [];
  db.reviews = [];
  db.blocks = [];
  db.mutes = [];
  db.reports = [];
  db.push_tokens = [];
  db.legal_acceptances = [{ user_id: ME, document: 'terms', version: LEGAL.terms }, { user_id: ME, document: 'privacy', version: LEGAL.privacy }];
  db.app_config = [];
  if (R.land === 'welcome' || R.land === 'legal') db.legal_acceptances = [];
  // A NEW CUSTOMER (&fresh=1, 2026-09-28, LUX-LIST-64 #16): the same world without one job of
  // yours in it — nothing posted, nobody hired, no one to hire again — so the Home shows its
  // first-run card. Dana's jobs and the worker side are untouched.
  if (R.fresh) {
    var mine = db.jobs.filter(function (j) { return j.client_id === ME; }).map(function (j) { return j.id; });
    var notMine = function (row) { return mine.indexOf(row.job_id) < 0; };
    db.jobs = db.jobs.filter(function (j) { return j.client_id !== ME; });
    db.job_offers = db.job_offers.filter(notMine);
    db.payments = db.payments.filter(notMine);
    db.job_locations = db.job_locations.filter(notMine);
    db.job_series = db.job_series.filter(function (s) { return s.client_id !== ME; });
    db.messages = db.messages.filter(function (m) { return !m.job_id || mine.indexOf(m.job_id) < 0; });
    db.saved_workers = [];
  }

  // the conversations view: one row per job thread with at least one message, from either side
  function conversationsFor(uid) {
    var threads = {};
    db.messages.forEach(function (m) { if (m.job_id) (threads[m.job_id] = threads[m.job_id] || []).push(m); });
    return Object.keys(threads).map(function (jobId) {
      var j = db.jobs.find(function (x) { return x.id === jobId; });
      if (!j || (j.client_id !== uid && j.assigned_worker_id !== uid)) return null;
      var list = threads[jobId].slice().sort(function (a, b) { return a.created_at < b.created_at ? -1 : 1; });
      var last = list[list.length - 1];
      var read = db.message_reads.find(function (r) { return r.job_id === jobId && r.user_id === uid; });
      return {
        job_id: jobId, direct_thread_id: null, job_title: j.title, client_id: j.client_id, assigned_worker_id: j.assigned_worker_id,
        last_message_id: last.id, last_message_sender_id: last.sender_id, last_message_content: last.content,
        last_message_image_url: last.image_url, last_message_audio_url: last.audio_url, last_message_document_url: last.document_url,
        last_message_document_name: last.document_name, last_message_unsent_at: last.unsent_at, last_message_at: last.created_at,
        my_read_at: read ? read.last_read_at : null,
      };
    }).filter(Boolean);
  }

  // ---- a PostgREST of our own ------------------------------------------------------------------
  function splitTop(s, sep) {
    var out = [], depth = 0, cur = '', q = false;
    for (var i = 0; i < s.length; i++) {
      var c = s[i];
      if (c === '"') q = !q;
      if (!q && c === '(') depth++;
      if (!q && c === ')') depth--;
      if (!q && depth === 0 && c === sep) { out.push(cur); cur = ''; continue; }
      cur += c;
    }
    if (cur) out.push(cur);
    return out;
  }
  function literal(v) {
    if (v === 'null') return null;
    if (v === 'true') return true;
    if (v === 'false') return false;
    if (/^".*"$/.test(v)) return v.slice(1, -1);
    return v;
  }
  function eq(a, b) { if (a == null || b == null) return a == b; return String(a) === String(b); }
  function cmp(a, b) { var na = Number(a), nb = Number(b); if (!isNaN(na) && !isNaN(nb) && a !== '' && b !== '') return na - nb; return String(a) < String(b) ? -1 : String(a) > String(b) ? 1 : 0; }
  function test(row, col, op, val) {
    var neg = false;
    if (op === 'not') { var i = val.indexOf('.'); op = val.slice(0, i); val = val.slice(i + 1); neg = true; }
    var v = row[col], ok;
    switch (op) {
      case 'eq': ok = eq(v, literal(val)); break;
      case 'neq': ok = !eq(v, literal(val)); break;
      case 'gt': ok = v != null && cmp(v, val) > 0; break;
      case 'gte': ok = v != null && cmp(v, val) >= 0; break;
      case 'lt': ok = v != null && cmp(v, val) < 0; break;
      case 'lte': ok = v != null && cmp(v, val) <= 0; break;
      case 'is': ok = val === 'null' ? v == null : val === 'true' ? v === true : val === 'false' ? v === false : v == null; break;
      case 'in': { var list = splitTop(val.replace(/^\(|\)$/g, ''), ',').map(literal); ok = list.some(function (x) { return eq(v, x); }); break; }
      case 'like': case 'ilike': { var re = new RegExp('^' + String(val).replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*').replace(/%/g, '.*') + '$', op === 'ilike' ? 'i' : ''); ok = v != null && re.test(String(v)); break; }
      case 'cs': { var want = String(val).replace(/^\{|\}$/g, '').split(',').filter(Boolean); ok = Array.isArray(v) && want.every(function (w) { return v.indexOf(literal(w)) >= 0; }); break; }
      case 'ov': { var any = String(val).replace(/^\{|\}$/g, '').split(',').filter(Boolean); ok = Array.isArray(v) && any.some(function (w) { return v.indexOf(literal(w)) >= 0; }); break; }
      default: ok = true;
    }
    return neg ? !ok : ok;
  }
  function logical(row, expr, isAnd) {
    var parts = splitTop(expr.replace(/^\(|\)$/g, ''), ',');
    var results = parts.map(function (p) {
      var m = /^(not\.)?(and|or)\((.*)\)$/.exec(p);
      if (m) { var r = logical(row, '(' + m[3] + ')', m[2] === 'and'); return m[1] ? !r : r; }
      var a = p.indexOf('.'), b = p.indexOf('.', a + 1);
      var col = p.slice(0, a), op = p.slice(a + 1, b), val = p.slice(b + 1);
      if (op === 'not') { var c = val.indexOf('.'); return !test(row, col, val.slice(0, c), val.slice(c + 1)); }
      return test(row, col, op, val);
    });
    return isAnd ? results.every(Boolean) : results.some(Boolean);
  }
  function filterRows(rows, query) {
    var out = rows;
    query.forEach(function (value, key) {
      if (['select', 'order', 'limit', 'offset', 'on_conflict', 'columns'].indexOf(key) >= 0) return;
      if (key === 'or' || key === 'and') { out = out.filter(function (r) { return logical(r, value, key === 'and'); }); return; }
      var i = value.indexOf('.');
      var op = value.slice(0, i), val = value.slice(i + 1);
      out = out.filter(function (r) { return test(r, key, op, val); });
    });
    return out;
  }
  function order(rows, spec) {
    if (!spec) return rows;
    var keys = spec.split(',').map(function (s) { var p = s.split('.'); return { col: p[0], desc: p.indexOf('desc') > 0, nullsFirst: p.indexOf('nullsfirst') > 0 }; });
    return rows.slice().sort(function (a, b) {
      for (var i = 0; i < keys.length; i++) {
        var k = keys[i], x = a[k.col], y = b[k.col];
        if (x == null && y == null) continue;
        if (x == null) return k.nullsFirst ? -1 : 1;
        if (y == null) return k.nullsFirst ? 1 : -1;
        var c = cmp(x, y);
        if (c) return k.desc ? -c : c;
      }
      return 0;
    });
  }
  function project(table, row, select) {
    if (!select || select === '*') return clone(row);
    var out = {};
    splitTop(select, ',').forEach(function (raw) {
      var s = raw.trim();
      if (!s) return;
      if (s === '*') { Object.assign(out, clone(row)); return; }
      var embed = /^(?:(\w+):)?(\w+)(?:!([\w]+))?\((.*)\)$/.exec(s);
      if (embed) {
        var alias = embed[1] || embed[2], target = embed[2], inner = embed[4];
        if (target === 'job_offers' && inner.trim() === 'count') {
          out[alias] = [{ count: db.job_offers.filter(function (o) { return o.job_id === row.id && o.offer_type === 'marketplace_bid'; }).length }];
        } else if (target === 'profiles') {
          var p = db.profiles.find(function (x) { return x.id === (row.worker_id || row.user_id); });
          out[alias] = p ? project('profiles', p, inner) : null;
        }
        return;
      }
      var name = s.replace(/::\w+$/, '');
      var al = /^(\w+):(\w+)$/.exec(name);
      if (al) out[al[1]] = clone(row[al[2]]); else out[name] = clone(row[name] !== undefined ? row[name] : null);
    });
    return out;
  }
  function rowsOf(table) {
    if (table === 'conversations') return conversationsFor(ME);
    if (!db[table]) db[table] = [];
    return db[table];
  }
  var DEFAULTS = {
    jobs: function (r) { return Object.assign(job(0, ME, '', 'other', ''), { id: newId() }, r); },
    messages: function (r) { return Object.assign(msg(0, null, ME, '', new Date().toISOString()), { id: newId() }, r); },
  };
  function insertRows(table, body, upsertCols) {
    var list = Array.isArray(body) ? body : [body];
    var target = rowsOf(table);
    return list.map(function (r) {
      if (upsertCols) {
        var keys = upsertCols.split(',');
        var hit = target.find(function (x) { return keys.every(function (k) { return eq(x[k], r[k]); }); });
        if (hit) { Object.assign(hit, r); return hit; }
      }
      var row = DEFAULTS[table] ? DEFAULTS[table](r) : Object.assign({ id: newId(), created_at: new Date().toISOString() }, r);
      if (!row.id) row.id = newId();
      if (!row.created_at) row.created_at = new Date().toISOString();
      target.push(row);
      return row;
    });
  }
  function rest(method, table, query, headers, body) {
    var single = /vnd\.pgrst\.object/.test(headers.accept || headers.Accept || '');
    var prefer = String(headers.prefer || headers.Prefer || '');
    var rows;
    if (method === 'GET' || method === 'HEAD') {
      rows = order(filterRows(rowsOf(table), query), query.get('order'));
      var total = rows.length;
      var off = Number(query.get('offset') || 0), lim = query.get('limit');
      rows = rows.slice(off, lim != null ? off + Number(lim) : undefined).map(function (r) { return project(table, r, query.get('select')); });
      var h = { 'Content-Range': (rows.length ? off + '-' + (off + rows.length - 1) : '*') + '/' + (/count=/.test(prefer) ? total : '*') };
      if (method === 'HEAD') return { status: 200, body: null, headers: h };
      return shape(rows, single, h);
    }
    if (method === 'POST') {
      var conflict = query.get('on_conflict') || (/resolution=merge-duplicates/.test(prefer) ? 'id' : null);
      if (/resolution=ignore-duplicates/.test(prefer) && conflict) {
        var keys = conflict.split(','); var list = Array.isArray(body) ? body : [body];
        body = list.filter(function (r) { return !rowsOf(table).some(function (x) { return keys.every(function (k) { return eq(x[k], r[k]); }); }); });
      }
      rows = insertRows(table, body || [], conflict).map(function (r) { return project(table, r, query.get('select')); });
      return /return=representation/.test(prefer) || query.get('select') ? shape(rows, single, {}, 201) : { status: 201, body: null };
    }
    if (method === 'PATCH') {
      rows = filterRows(rowsOf(table), query);
      rows.forEach(function (r) { Object.assign(r, body || {}); });
      rows = rows.map(function (r) { return project(table, r, query.get('select')); });
      return /return=representation/.test(prefer) || query.get('select') ? shape(rows, single) : { status: 204, body: null };
    }
    if (method === 'DELETE') {
      var gone = filterRows(rowsOf(table), query);
      db[table] = rowsOf(table).filter(function (r) { return gone.indexOf(r) < 0; });
      return /return=representation/.test(prefer) ? shape(gone.map(clone), single) : { status: 204, body: null };
    }
    return { status: 405, body: { message: 'method' } };
  }
  function shape(rows, single, headers, status) {
    if (!single) return { status: status || 200, body: rows, headers: headers };
    if (rows.length === 1) return { status: status || 200, body: rows[0], headers: headers };
    return { status: 406, body: { code: 'PGRST116', details: 'The result contains ' + rows.length + ' rows', hint: null, message: 'JSON object requested, multiple (or no) rows returned' } };
  }

  // ---- the functions the app calls ----------------------------------------------------------------
  var jobById = function (id) { return db.jobs.find(function (x) { return x.id === id; }); };
  var profileById = function (id) { return db.profiles.find(function (x) { return x.id === id; }); };
  var quote = function (cents) { var f = fee(cents); return { job_price_cents: cents, customer_fee_cents: f, tax_cents: 0, total_cents: cents + f, worker_fee_cents: f, worker_receives_cents: cents - f }; };
  var openJobs = function () { return db.jobs.filter(function (x) { return x.status === 'open'; }); };
  var CELL = [[40.6545, -73.9302, 101], [40.6862, -73.9425, 102], [40.6694, -73.9422, 103], [40.6775, -73.9692, 104], [40.6715, -73.9777, 201]];
  var RPC = {
    get_my_profile: function () { return clone(profileById(ME)); },
    get_my_active_mode: function () { return R.mode || 'customer'; },
    set_active_mode: function (a) { profileById(ME).active_mode = a.p_mode; return null; },
    current_user_is_banned: function () { return false; },
    is_profile_active: function () { return true; },
    update_my_profile: function (a) { Object.assign(profileById(ME), a.p_patch || {}); return clone(profileById(ME)); },
    client_job_stats: function (a) {
      var mine = db.jobs.filter(function (x) { return x.client_id === a.p_client_id; });
      return [{ posted: mine.length, completed: mine.filter(function (x) { return x.status === 'completed'; }).length, cancelled: mine.filter(function (x) { return x.status === 'cancelled'; }).length }];
    },
    worker_job_stats: function (a) {
      var done = db.jobs.filter(function (x) { return x.assigned_worker_id === a.p_worker && x.status === 'completed'; });
      var by = {}; done.forEach(function (x) { by[x.category] = (by[x.category] || 0) + 1; });
      return Object.keys(by).map(function (c) { return { category: c, job_count: by[c] }; });
    },
    job_offer_count: function (a) { return db.job_offers.filter(function (o) { return o.job_id === a.p_job_id && o.status === 'pending'; }).length; },
    job_offer_counts: function (a) {
      return (a.p_job_ids || []).map(function (id) { return { job_id: id, offer_count: db.job_offers.filter(function (o) { return o.job_id === id && o.offer_type === 'marketplace_bid' && o.status !== 'withdrawn'; }).length }; }).filter(function (r) { return r.offer_count > 0; });
    },
    my_pending_offers: function () {
      return db.job_offers.filter(function (o) { return o.status === 'pending' && (o.customer_id === ME || o.worker_id === ME); }).map(function (o) {
        return { id: o.id, job_id: o.job_id, offer_type: o.offer_type, thread_job_id: null, direct_thread_id: null, customer_id: o.customer_id, worker_id: o.worker_id, amount_cents: o.amount_cents, status: o.status, updated_at: o.updated_at };
      });
    },
    create_offer: function (a) {
      if (a.p_worker_id) { // a customer's direct offer to a worker: a job for them alone
        var dj = insertRows('jobs', { client_id: ME, title: a.p_title, description: a.p_description, category: a.p_category, location: a.p_location, budget_cents: a.p_amount_cents, visibility: 'direct', photos: a.p_photos || [] })[0];
        var direct = insertRows('job_offers', { job_id: dj.id, offer_type: 'direct_offer', customer_id: ME, worker_id: a.p_worker_id, author_id: ME, awaiting_id: a.p_worker_id, amount_cents: a.p_amount_cents, message: a.p_message || null, status: 'pending', expires_at: ahead(2 * D), updated_at: new Date().toISOString() })[0];
        direct.root_offer_id = direct.id;
        return direct.id;
      }
      var j = jobById(a.p_job_id);
      var o = insertRows('job_offers', { job_id: a.p_job_id, offer_type: 'marketplace_bid', customer_id: j.client_id, worker_id: ME, author_id: ME, awaiting_id: j.client_id, amount_cents: a.p_amount_cents, message: a.p_message || null, status: 'pending', expires_at: ahead(2 * D), updated_at: new Date().toISOString() })[0];
      o.root_offer_id = o.id;
      return o.id;
    },
    counter_offer: function (a) {
      var p = db.job_offers.find(function (o) { return o.id === a.p_offer_id; });
      p.status = 'superseded';
      var next = insertRows('job_offers', Object.assign({}, p, { id: newId(), parent_offer_id: p.id, root_offer_id: p.root_offer_id, author_id: ME, awaiting_id: p.author_id === ME ? p.customer_id : p.author_id, amount_cents: a.p_amount_cents, message: a.p_message || null, status: 'pending', created_at: new Date().toISOString(), updated_at: new Date().toISOString() }))[0];
      return next.id;
    },
    decline_offer: function (a) { var o = db.job_offers.find(function (x) { return x.id === a.p_offer_id; }); if (o) { o.status = 'declined'; o.awaiting_id = null; } return null; },
    withdraw_offer: function (a) { var o = db.job_offers.find(function (x) { return x.id === a.p_offer_id; }); if (o) { o.status = 'withdrawn'; o.awaiting_id = null; } return null; },
    accept_offer: function (a) {
      var o = db.job_offers.find(function (x) { return x.id === a.p_offer_id; });
      var j = jobById(o.job_id);
      db.job_offers.forEach(function (x) { if (x.job_id === j.id && x.status === 'pending') { x.status = x.id === o.id ? 'accepted' : 'declined'; x.awaiting_id = null; } });
      Object.assign(j, { status: 'assigned', assigned_worker_id: o.worker_id, final_amount_cents: o.amount_cents, accepted_offer_id: o.id, updated_at: new Date().toISOString() });
      insertRows('payments', payment(++seq, j.id, o.id, j.client_id, o.worker_id, o.amount_cents, 'held', { held_at: new Date().toISOString() }));
      return j.id;
    },
    transition_job_status: function (a) {
      var j = jobById(a.p_job_id);
      j.status = a.p_status;
      if (a.p_status === 'completed') { j.completed_at = new Date().toISOString(); if (a.p_completion_photos) j.completion_photos = a.p_completion_photos; if (a.p_completion_videos) j.completion_videos = a.p_completion_videos; }
      return null;
    },
    // Idea 14: repeat jobs (migration 20260930001000) — start from a posted job, stop, drop.
    start_job_series: function (a) {
      var j = jobById(a.p_job_id);
      if (j.series_id) return clone(db.job_series.find(function (s) { return s.id === j.series_id; }));
      var row = insertRows('job_series', {
        client_id: ME, origin_job_id: j.id, cadence: a.p_cadence, anchor_date: j.scheduled_date, next_visit_no: 1,
        next_visit_date: null, worker_id: j.assigned_worker_id, price_cents: j.final_amount_cents, pending_job_id: null,
        dropped_worker_id: null, status: 'active', stopped_at: null, last_error: null,
      })[0];
      j.series_id = row.id;
      return clone(row);
    },
    stop_job_series: function (a) {
      var s = db.job_series.find(function (x) { return x.id === a.p_series_id; });
      s.status = 'stopped';
      s.stopped_at = new Date().toISOString();
      s.pending_job_id = null;
      return clone(s);
    },
    drop_series_worker: function (a) {
      var s = db.job_series.find(function (x) { return x.id === a.p_series_id; });
      s.dropped_worker_id = s.worker_id;
      s.worker_id = null;
      s.price_cents = null;
      return null;
    },
    // Idea 5: the hired worker's running-late tap (migration 20260930000700) — the latest tap wins.
    report_running_late: function (a) {
      var j = jobById(a.p_job_id);
      j.late_minutes = a.p_minutes;
      j.late_reported_at = new Date().toISOString();
      return clone(j);
    },
    mark_worker_arrival: function (a) {
      var j = jobById(a.p_job_id);
      if (a.p_step === 'en_route') j.en_route_at = new Date().toISOString();
      if (a.p_step === 'arrived') j.arrived_at = new Date().toISOString();
      return clone(j);
    },
    job_payment_state: function (a) {
      var p = db.payments.filter(function (x) { return x.job_id === a.p_job_id && x.kind === 'job_payment'; }).pop();
      return p ? clone(p) : null;
    },
    release_job_payment: function (a) {
      var p = db.payments.filter(function (x) { return x.job_id === a.p_job_id && x.kind === 'job_payment'; }).pop();
      if (p) Object.assign(p, { release_requested_at: new Date().toISOString(), updated_at: new Date().toISOString() });
      return clone(p);
    },
    quote_job_price: function (a) { return [quote(a.p_amount_cents || 0)]; },
    create_job: function (a) {
      var row = insertRows('jobs', {
        client_id: ME, title: a.p_title, description: a.p_description, category: a.p_category, location: a.p_location,
        budget_cents: a.p_budget_max_cents || a.p_budget_min_cents || a.p_budget_cents || null, budget_min_cents: a.p_budget_min_cents || null,
        budget_max_cents: a.p_budget_max_cents || null, pricing_mode: a.p_pricing_mode || 'open_bids', scheduled_date: a.p_scheduled_date || null,
        arrival_start_hour: a.p_arrival_start_hour == null ? null : a.p_arrival_start_hour, arrival_end_hour: a.p_arrival_end_hour == null ? null : a.p_arrival_end_hour,
        photos: a.p_photos || [], videos: a.p_videos || [], status: 'open',
      })[0];
      if (a.p_address_line || a.p_lat) db.job_locations.push({ job_id: row.id, lat: a.p_lat || 40.6715, lng: a.p_lng || -73.9777, address_line: a.p_address_line || null });
      return clone(row);
    },
    update_job_details: function (a) { var j = jobById(a.p_job_id); Object.assign(j, { title: a.p_title, description: a.p_description, category: a.p_category, location: a.p_location, budget_cents: a.p_budget_cents, photos: a.p_photos || j.photos }); return clone(j); },
    create_review: function (a) { return insertRows('reviews', { job_id: a.p_job_id, reviewer_id: ME, reviewee_id: a.p_reviewee_id, rating: a.p_rating, comment: a.p_comment, photos: a.p_photos || [], would_again: a.p_would_again })[0]; },
    profile_reviews: function () { return []; },
    profile_review_summary: function () { return [{ total: 0, average: null, shown_average: null, revealed: 0, pending: 0 }]; },
    profile_review_summaries: function () { return []; },
    messaging_unlocked: function (a) { var j = a.p_job_id && jobById(a.p_job_id); return !!(j && j.assigned_worker_id && (j.client_id === ME || j.assigned_worker_id === ME)); },
    mark_direct_thread_read: function () { return null; },
    set_direct_thread_read_at: function () { return null; },
    set_conversation_state: function (a) {
      var s = db.conversation_states.find(function (x) { return x.job_id === a.p_job_id && x.direct_thread_id === a.p_direct_thread_id; });
      if (!s) { s = { user_id: ME, job_id: a.p_job_id, direct_thread_id: a.p_direct_thread_id, hidden: false, archived: false, cleared_before: null, deleted: false }; db.conversation_states.push(s); }
      if (a.p_hidden != null) s.hidden = a.p_hidden;
      if (a.p_archived != null) s.archived = a.p_archived;
      if (a.p_clear) s.cleared_before = new Date().toISOString();
      if (a.p_delete) s.deleted = true;
      return null;
    },
    set_block: function (a) { db.blocks.push({ blocker_id: ME, blocked_id: a.p_blocked, expires_at: a.p_expires_at || null }); return null; },
    unsend_message: function (a) { var m = db.messages.find(function (x) { return x.id === a.p_message_id; }); if (m) m.unsent_at = new Date().toISOString(); return null; },
    open_job_dispute: function (a) { return insertRows('job_disputes', { job_id: a.p_job_id, payment_id: null, opened_by: ME, reason: a.p_reason, details: a.p_details, status: 'open', resolved_at: null, resolution_note: null })[0]; },
    withdraw_job_dispute: function (a) { var d = db.job_disputes.find(function (x) { return x.id === a.p_dispute_id; }); if (d) d.status = 'withdrawn'; return clone(d); },
    account_deletion_blockers: function () {
      return db.jobs.filter(function (x) { return ['assigned', 'in_progress'].indexOf(x.status) >= 0 && (x.client_id === ME || x.assigned_worker_id === ME); })
        .map(function (x) { return { kind: 'active_job', ref_id: x.id, label: x.title, detail: x.status === 'assigned' ? 'Assigned, not finished' : 'In progress' }; });
    },
    delete_my_account: function () { return null; },
    register_push_token: function () { return null; },
    accept_legal_documents: function (a) { (a.p_documents || []).forEach(function (d) { db.legal_acceptances.push({ user_id: ME, document: d.document, version: d.version }); }); return null; },
    start_live_location: function (a) { return insertRows('live_location_shares', { sharer_id: ME, job_id: a.p_job_id || null, direct_thread_id: a.p_direct_thread_id || null, lat: a.p_lat, lng: a.p_lng, started_at: new Date().toISOString(), updated_at: new Date().toISOString(), expires_at: a.p_expires_at })[0].id; },
    update_live_location: function () { return null; },
    stop_live_location: function () { db.live_location_shares = []; return null; },
    sandbox_tip_worker: function (a) { var j = jobById(a.p_job_id); return insertRows('payments', payment(++seq, j.id, null, ME, j.assigned_worker_id, a.p_amount_cents, 'released', { kind: 'tip', released_at: new Date().toISOString() }))[0]; },
    sandbox_cash_out: function () { return []; },
    my_payouts_status: function () { return 'none'; },
    admin_open_reports: function () { return []; },
    ban_user: function () { return null; },
    unban_user: function () { return null; },
    job_hotspots: function () {
      return CELL.filter(function (c) { var j = jobById(uuid(c[2])); return j && j.status === 'open'; }).map(function (c) {
        var j = jobById(uuid(c[2])), cats = {}; cats[j.category] = 1;
        return { ilat: Math.round(c[0] / 0.004), ilng: Math.round(c[1] / 0.004), cell_lat: c[0], cell_lng: c[1], job_count: 1, categories: cats };
      });
    },
    jobs_in_cell: function (a) {
      var hit = CELL.find(function (c) { return Math.round(c[0] / 0.004) === a.p_ilat && Math.round(c[1] / 0.004) === a.p_ilng; });
      return hit ? [clone(jobById(uuid(hit[2])))] : [];
    },
    jobs_within_radius: function () { return openJobs().filter(function (x) { return x.client_id !== ME; }).map(function (x, i) { return Object.assign(clone(x), { distance_miles: [0.6, 1.4, 2.1, 3.2][i % 4] }); }); },
  };

  // the ranking the worker-search function would return: workers whose categories meet the ask,
  // with their completed counts COUNTED from the jobs above — never a number made up for them
  function workerSearch(body) {
    var want = (body && body.categories) || [];
    return db.profiles.filter(function (p) { return p.id !== ME && p.role === 'worker' && p.accepting_work; }).map(function (p) {
      var matched = p.categories.filter(function (c) { return !want.length || want.indexOf(c) >= 0; });
      var done = db.jobs.filter(function (j) { return j.assigned_worker_id === p.id && j.status === 'completed'; });
      return {
        workerId: p.id, fullName: p.full_name, avatarUrl: null, categories: p.categories, matchedCategories: matched,
        evidenceCategories: done.map(function (j) { return j.category; }), completedTotal: done.length,
        relatedCompleted: done.filter(function (j) { return !want.length || want.indexOf(j.category) >= 0; }).length,
        relevance: matched.length ? 0.9 : 0.4, score: matched.length ? 0.9 : 0.4, reason: null,
      };
    }).filter(function (r) { return r.matchedCategories.length || !want.length; });
  }
  var FUNCTIONS = {
    'worker-search': function (body) { return { status: 200, body: { results: workerSearch(body) } }; },
    'create-payment': function () { return { status: 400, body: { error: 'Payments run in sandbox in this preview.' } }; },
    'connect-onboarding': function () { return { status: 200, body: { status: 'none', url: 'https://connect.stripe.com/setup/preview' } }; },
    'connect-status': function () { return { status: 200, body: { status: 'none', url: 'https://connect.stripe.com/setup/preview' } }; },
  };

  // ---- auth and storage ------------------------------------------------------------------------------
  function session() {
    var now = Math.floor(Date.now() / 1000);
    return { access_token: 'harness', token_type: 'bearer', expires_in: 360000, expires_at: now + 360000, refresh_token: 'harness', user: userJson() };
  }
  function userJson() { return { id: ME, aud: 'authenticated', role: 'authenticated', email: 'mahmudur@example.com', phone: '', app_metadata: { provider: 'email' }, user_metadata: { full_name: 'Mahmudur Rahman' }, created_at: '2026-08-01T12:00:00.000Z' }; }
  function auth(method, path, query) {
    if (/\/token$/.test(path)) return { status: 200, body: session() };
    if (/\/signup$/.test(path)) return { status: 200, body: Object.assign(session(), { user: userJson() }) };
    if (/\/user$/.test(path)) return { status: 200, body: userJson() };
    if (/\/logout$/.test(path)) return { status: 204, body: null };
    if (/\/(recover|otp|resend)$/.test(path)) return { status: 200, body: {} };
    if (/\/verify$/.test(path)) return { status: 200, body: session() };
    return { status: 200, body: {} };
  }
  var uploads = {};
  function storage(method, path, body) {
    var m = /\/storage\/v1\/object\/sign\/([^/]+)\/(.+)$/.exec(path);
    if (m) return { status: 200, body: { signedURL: '/object/sign/' + m[1] + '/' + m[2] + '?token=preview' } };
    m = /\/storage\/v1\/object\/([^/]+)\/(.+)$/.exec(path);
    if (m && (method === 'POST' || method === 'PUT')) {
      try { uploads[m[1] + '/' + m[2]] = URL.createObjectURL(body instanceof Blob ? body : new Blob([body])); } catch (e) { /* a preview without it */ }
      return { status: 200, body: { Key: m[1] + '/' + m[2], Id: newId() } };
    }
    if (method === 'DELETE') return { status: 200, body: [] };
    return { status: 200, body: [] };
  }
  var SAMPLES = { 'armchair.webp': 1, 'toolbox.webp': 1, 'room.webp': 1 };
  var sampleUrl = function (name) { return new URL('../shared/sample/' + name, location.href).href; };
  // the local picture for a storage URL of the fake project — an upload made in this session, or a sample
  function media(url) {
    var m = /\/storage\/v1\/object\/(?:public|sign|authenticated)\/([^/?]+)\/([^?]+)/.exec(String(url));
    if (!m) return null;
    var key = m[1] + '/' + decodeURIComponent(m[2]);
    if (uploads[key]) return uploads[key];
    var file = key.split('/').pop();
    return sampleUrl(SAMPLES[file] ? file : 'room.webp');
  }

  // ---- the front door ----------------------------------------------------------------------------------
  function respond(r) {
    var headers = Object.assign({ 'Content-Type': 'application/json' }, r.headers || {});
    var text = r.body == null ? '' : JSON.stringify(r.body);
    return new Response(r.status === 204 || r.status === 205 ? null : text, { status: r.status, headers: headers });
  }
  function readBody(init, input) {
    var b = init.body !== undefined ? init.body : input && input.body;
    if (b == null) return Promise.resolve(null);
    if (typeof b === 'string') { try { return Promise.resolve(JSON.parse(b)); } catch (e) { return Promise.resolve(b); } }
    return Promise.resolve(b);
  }
  function headersOf(init, input) {
    var out = {};
    var h = init.headers || (input && input.headers);
    if (!h) return out;
    if (typeof h.forEach === 'function' && !Array.isArray(h)) h.forEach(function (v, k) { out[k.toLowerCase()] = v; });
    else if (Array.isArray(h)) h.forEach(function (p) { out[String(p[0]).toLowerCase()] = p[1]; });
    else Object.keys(h).forEach(function (k) { out[k.toLowerCase()] = h[k]; });
    return out;
  }
  var log = [];
  window.__REFRESH_MOCK__ = {
    db: db, log: log, media: media,
    fetch: function (url, init, input) {
      var method = String(init.method || (input && input.method) || 'GET').toUpperCase();
      var u = new URL(url);
      var headers = headersOf(init, input);
      return readBody(init, input).then(function (body) {
        var r;
        try {
          if (u.pathname.indexOf('/rest/v1/rpc/') === 0) {
            var fn = u.pathname.slice('/rest/v1/rpc/'.length);
            var args = body && typeof body === 'object' ? body : Object.fromEntries(u.searchParams);
            var single = /vnd\.pgrst\.object/.test(headers.accept || '');
            if (!RPC[fn]) { r = { status: 404, body: { code: 'PGRST202', message: 'Could not find the function public.' + fn } }; }
            else {
              var value = RPC[fn](args || {});
              if (single && Array.isArray(value)) r = value.length === 1 ? { status: 200, body: value[0] } : shape(value, true);
              else r = { status: 200, body: value === undefined ? null : value };
            }
          } else if (u.pathname.indexOf('/rest/v1/') === 0) {
            r = rest(method, u.pathname.slice('/rest/v1/'.length), u.searchParams, headers, body);
          } else if (u.pathname.indexOf('/auth/v1/') === 0) {
            r = auth(method, u.pathname, u.searchParams);
          } else if (u.pathname.indexOf('/storage/v1/') === 0) {
            r = storage(method, u.pathname, init.body);
          } else if (u.pathname.indexOf('/functions/v1/') === 0) {
            var f = FUNCTIONS[u.pathname.slice('/functions/v1/'.length)];
            r = f ? f(body) : { status: 404, body: { error: 'no such function in the preview' } };
          } else {
            r = { status: 404, body: {} };
          }
        } catch (e) {
          console.error('[refresh mock]', method, u.pathname, e);
          r = { status: 500, body: { message: String(e && e.message || e) } };
        }
        log.push({ t: Date.now(), method: method, path: u.pathname + u.search, status: r.status });
        if (log.length > 400) log.shift();
        return respond(r);
      });
    },
  };
})();
