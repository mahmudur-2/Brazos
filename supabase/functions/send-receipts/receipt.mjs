// ============================================================================
// Brazos · send-receipts · receipt.mjs — THE TWO RECEIPTS, as drawn.
//
// docs/DECISIONS.md 2026-09-30 entry (4) (8) and the record's §3 (.shots/refresh/boards/
// full-list.html, demos M1 and M2): the customer's "Receipt" and the worker's "You've been paid" —
// the Brazos band with the job number, the amount, one line saying what happened to the money, the
// facts (the other person, how it was paid, category · area, hired), the What-happened timeline,
// the price lines, and under them only "Questions? Reply to this email and quote the job number."
// No link into the app, no provider receipt number, no explanation of the protection fee.
//
// Pure — no imports, no network, no clock — so the node tests execute it and the edge function
// (index.ts, Deno) imports the very same file. Every amount it prints arrives from
// receipt_details() (migration 20260930001100), which reads the ledger verbatim; nothing here adds,
// rounds or derives money. Every person-written string (a title, a name, an area) is escaped.
// ============================================================================

/** The market's clock: one neighbourhood, in New York (docs/SCOPE.md). */
export const TIME_ZONE = 'America/New_York';

/** lib/jobs.ts JOB_CATEGORY_LABELS, word for word (tests/receipts.test.mjs holds the two equal). */
export const CATEGORY_LABELS = {
  dog_walking: 'Dog walking',
  cleaning: 'Cleaning',
  moving: 'Moving',
  yard_work: 'Yard work',
  handyman: 'Handyman',
  errands: 'Errands',
  furniture_assembly: 'Furniture Assembly',
  tv_mounting: 'TV/Furniture Mounting',
  painting: 'Painting',
  packing: 'Packing/Unpacking',
  other: 'Other',
};

export const CLOSING_LINE = 'Questions? Reply to this email and quote the job number.';

/** "BZ-0186": the prefix and at least four digits; a longer number is never cut. */
export function jobNumberLabel(n) {
  const v = Number(n);
  if (!Number.isInteger(v) || v <= 0) return null;
  return `BZ-${String(v).padStart(4, '0')}`;
}

/** A receipt's money: always two decimals — "$86.00", "−$6.00". */
export function money(cents) {
  const sign = cents < 0 ? '−' : '';
  return `${sign}$${(Math.abs(cents) / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

/** The timeline's money, as the app writes a figure: "$86", "$107.50" (formatBudget()'s rule). */
export function moneyShort(cents) {
  const whole = cents % 100 === 0;
  return `$${(cents / 100).toLocaleString('en-US', { minimumFractionDigits: whole ? 0 : 2, maximumFractionDigits: 2 })}`;
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/**
 * The instant's calendar parts on the market's clock. Only the NUMBERS come from Intl; the words
 * are this file's own, so every runtime (Deno's, Node's, next year's ICU with "Sept") prints the same.
 */
function partsOf(iso) {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-US', {
      timeZone: TIME_ZONE,
      year: 'numeric',
      month: 'numeric',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    })
      .formatToParts(d)
      .map((p) => [p.type, p.value])
  );
  return {
    year: parts.year,
    month: MONTHS[Number(parts.month) - 1],
    day: String(Number(parts.day)),
    time: `${Number(parts.hour)}:${parts.minute} ${String(parts.dayPeriod).toUpperCase()}`,
  };
}

/** "29 Sep 2026" on the market's clock. */
export function dayLabel(iso) {
  const p = partsOf(iso);
  return p ? `${p.day} ${p.month} ${p.year}` : null;
}

/** "29 Sep". */
export function shortDay(iso) {
  const p = partsOf(iso);
  return p ? `${p.day} ${p.month}` : null;
}

/** "29 Sep, 8:50 AM". */
export function dayTime(iso) {
  const p = partsOf(iso);
  return p ? `${p.day} ${p.month}, ${p.time}` : null;
}

export function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** "Park Slope, Brooklyn, NY" → "Park Slope": the area, as the app's cards say it. */
export function areaOf(location) {
  const first = String(location ?? '').split(',')[0].trim();
  return first || null;
}

export function firstName(name) {
  const trimmed = String(name ?? '').trim();
  return trimmed.split(/\s+/)[0] || trimmed;
}

/** "Visa ···· 4242" from the provider's card brand and last four; null when either is unknown. */
export function cardLabel(brand, last4) {
  if (!brand || !/^\d{4}$/.test(String(last4 ?? ''))) return null;
  const names = { visa: 'Visa', mastercard: 'Mastercard', amex: 'American Express', discover: 'Discover', jcb: 'JCB', diners: 'Diners Club', unionpay: 'UnionPay' };
  const key = String(brand).toLowerCase();
  const name = names[key] ?? key.charAt(0).toUpperCase() + key.slice(1);
  return `${name} ···· ${last4}`;
}

/** "7.5%" from basis points. */
export function percentLabel(bps) {
  const v = Number(bps);
  if (!Number.isFinite(v) || v < 0) return null;
  return `${(v / 100).toLocaleString('en-US', { maximumFractionDigits: 2 })}%`;
}

function requireCents(details, key) {
  const v = details?.[key];
  if (!Number.isInteger(v)) throw new Error(`receipt: ${key} is missing`);
  return v;
}

/**
 * The receipt for one side of one released job payment. `details` is receipt_details()'s object;
 * `extras.card` the customer's "Visa ···· 4242" when the provider said so (never guessed). Returns
 * the subject, the HTML and the plain text. Throws when the ledger lacks what a receipt must say —
 * a receipt with a missing amount is never sent.
 */
export function buildReceipt(details, role, extras = {}) {
  if (role !== 'customer' && role !== 'worker') throw new Error('receipt: unknown side');
  const number = jobNumberLabel(details?.job_number);
  if (!number) throw new Error('receipt: job_number is missing');
  const title = String(details.title ?? '').trim() || 'Your job';
  const agreed = requireCents(details, 'agreed_cents');
  const customer = String(details.customer_name ?? '').trim() || 'The customer';
  const worker = String(details.worker_name ?? '').trim() || 'The worker';
  const auto = details.release_reason === 'auto_approved';
  const released = dayLabel(details.released_at);
  if (!released) throw new Error('receipt: released_at is missing');
  const category = CATEGORY_LABELS[details.category] ?? null;
  const area = areaOf(details.location);
  const categoryArea = [category, area].filter(Boolean).join(' · ') || null;
  const hired = dayLabel(details.hired_at);
  const charged = requireCents(details, 'charged_cents');

  let heading;
  let amount;
  let line;
  let facts;
  let timeline;
  let lines;
  if (role === 'customer') {
    const protection = requireCents(details, 'protection_fee_cents');
    heading = 'Receipt';
    amount = money(charged);
    line = auto
      ? `Released to ${worker} on ${released}, after the approval window closed.`
      : `Released to ${worker} on ${released}, after you approved the work.`;
    facts = [
      ['Worker', worker],
      extras.card ? ['Paid with', extras.card] : null,
      categoryArea ? ['Category · area', categoryArea] : null,
      hired ? ['Hired', hired] : null,
    ];
    timeline = [
      ['Posted', shortDay(details.posted_at)],
      [`Hired ${firstName(worker)} · ${moneyShort(charged)} held in protection`, shortDay(details.held_at ?? details.hired_at)],
      ['Work marked complete', dayTime(details.completed_at)],
      [auto ? `Approved automatically · released to ${firstName(worker)}` : `You approved · released to ${firstName(worker)}`, dayTime(details.released_at)],
    ];
    lines = [
      ['Agreed price', money(agreed)],
      ['Protection fee', money(protection)],
      details.tax_cents > 0 ? ['Tax', money(details.tax_cents)] : null,
      ['Amount charged', money(charged), true],
    ];
  } else {
    const fee = requireCents(details, 'worker_fee_cents');
    const paid = requireCents(details, 'paid_to_worker_cents');
    const pct = percentLabel(details.worker_fee_bps);
    heading = 'You’ve been paid';
    amount = money(paid);
    line = auto
      ? `Released to you on ${released}, after the approval window closed. It arrives with your next payout.`
      : `Released to you on ${released}, after ${firstName(customer)} approved the work. It arrives with your next payout.`;
    facts = [
      ['Customer', customer],
      categoryArea ? ['Category · area', categoryArea] : null,
      hired ? ['Hired', hired] : null,
    ];
    const offered = Number.isInteger(details.offer_cents) ? moneyShort(details.offer_cents) : moneyShort(agreed);
    // Who named the price: the worker's bid, or the customer's own offer; unknown, the step is left out.
    const byWorker = details.offer_by_worker;
    timeline = [
      [
        byWorker === false ? `${firstName(customer)} offered ${offered}` : `You bid ${offered}`,
        byWorker === true || byWorker === false ? shortDay(details.offered_at) : null,
      ],
      [`Hired · ${moneyShort(charged)} held in protection`, shortDay(details.held_at ?? details.hired_at)],
      ['You marked the work complete', dayTime(details.completed_at)],
      [auto ? 'Approved automatically · released to you' : `${firstName(customer)} approved · released to you`, dayTime(details.released_at)],
    ];
    lines = [
      ['Agreed price', money(agreed)],
      [pct ? `Brazos fee (${pct})` : 'Brazos fee', money(-fee)],
      ['Paid to you', money(paid), true],
    ];
  }

  facts = facts.filter(Boolean);
  // A step with no instant is not drawn: the timeline never invents a date.
  timeline = timeline.filter(([, when]) => Boolean(when));
  lines = lines.filter(Boolean);

  const subject = role === 'customer' ? `Receipt #${number} · ${title}` : `You’ve been paid · #${number} · ${title}`;
  return {
    subject,
    html: renderHtml({ heading, title, number, amount, line, facts, timeline, lines }),
    text: renderText({ heading, title, number, amount, line, facts, timeline, lines }),
  };
}

const INK = '#1A1F36';
const MUTED = '#697386';
const SUB = '#4F566B';
const RULE = '#E3E8EE';
const BAND = '#0E6B52';
const FONT = "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif";

function renderHtml({ heading, title, number, amount, line, facts, timeline, lines }) {
  const e = escapeHtml;
  const factRows = [];
  for (let i = 0; i < facts.length; i += 2) {
    const cell = (fact) =>
      fact
        ? `<td width="50%" valign="top" style="padding:4px 0;font-size:12px;color:${INK};"><div style="font-size:9.5px;letter-spacing:.8px;text-transform:uppercase;color:${MUTED};margin-bottom:2px;">${e(fact[0])}</div>${e(fact[1])}</td>`
        : '<td width="50%"></td>';
    factRows.push(`<tr>${cell(facts[i])}${cell(facts[i + 1])}</tr>`);
  }
  const steps = timeline
    .map(
      ([what, when]) =>
        `<tr><td width="18" valign="top" style="padding:3px 0 8px;"><div style="width:10px;height:10px;border-radius:5px;background:${BAND};"></div></td><td valign="top" style="padding:0 8px 8px 0;font-size:11.5px;color:${INK};">${e(what)}</td><td valign="top" align="right" style="padding:0 0 8px;font-size:11.5px;color:${MUTED};white-space:nowrap;">${e(when)}</td></tr>`
    )
    .join('');
  const priceRows = lines
    .map(([label, value, total]) =>
      total
        ? `<tr><td style="padding-top:6px;border-top:1px solid ${RULE};font-size:13px;font-weight:700;color:${INK};">${e(label)}</td><td align="right" style="padding-top:6px;border-top:1px solid ${RULE};font-size:13px;font-weight:700;color:${INK};">${e(value)}</td></tr>`
        : `<tr><td style="padding-bottom:6px;font-size:13px;color:${INK};">${e(label)}</td><td align="right" style="padding-bottom:6px;font-size:13px;color:${INK};">${e(value)}</td></tr>`
    )
    .join('');
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${e(heading)} #${e(number)}</title></head>
<body style="margin:0;padding:0;background:#F6F7F9;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#F6F7F9;"><tr><td align="center" style="padding:24px 12px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:480px;background:#FFFFFF;border:1px solid ${RULE};border-radius:16px;font-family:${FONT};color:${INK};">
<tr><td style="background:${BAND};color:#FFFFFF;padding:16px 18px;border-radius:16px 16px 0 0;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>
<td width="38" valign="middle"><div style="width:38px;height:38px;border-radius:10px;background:#FFFFFF;color:${BAND};font-weight:800;font-size:17px;line-height:38px;text-align:center;">B</div></td>
<td valign="middle" style="padding-left:12px;color:#FFFFFF;"><div style="font-size:15px;font-weight:700;">${e(heading)}</div><div style="font-size:12px;opacity:.85;">${e(title)}</div></td>
<td valign="middle" align="right" style="font-size:11px;color:#FFFFFF;opacity:.85;white-space:nowrap;">JOB<br><span style="font-size:14px;font-weight:700;letter-spacing:.3px;">#${e(number)}</span></td>
</tr></table>
</td></tr>
<tr><td style="padding:14px 18px 16px;">
<div style="font-size:30px;font-weight:800;letter-spacing:-.5px;color:${INK};">${e(amount)}</div>
<div style="font-size:12.5px;line-height:1.4;color:${SUB};margin-top:6px;">${e(line)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-top:12px;border-top:1px solid ${RULE};border-bottom:1px solid ${RULE};"><tr><td style="padding:6px 0;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">${factRows.join('')}</table></td></tr></table>
<div style="font-size:10.5px;letter-spacing:.8px;text-transform:uppercase;color:${MUTED};margin-top:12px;margin-bottom:6px;">What happened</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">${steps}</table>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-top:8px;">${priceRows}</table>
<div style="font-size:11.5px;line-height:1.45;color:${MUTED};margin-top:12px;">${e(CLOSING_LINE)}</div>
</td></tr>
</table>
</td></tr></table>
</body></html>`;
}

function renderText({ heading, title, number, amount, line, facts, timeline, lines }) {
  return [
    `${heading} · #${number}`,
    title,
    '',
    amount,
    line,
    '',
    ...facts.map(([k, v]) => `${k}: ${v}`),
    '',
    'What happened',
    ...timeline.map(([what, when]) => `- ${what} — ${when}`),
    '',
    ...lines.map(([k, v]) => `${k}: ${v}`),
    '',
    CLOSING_LINE,
  ].join('\n');
}
