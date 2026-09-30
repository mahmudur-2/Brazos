/**
 * 2026-09-30 (the build run, idea 23) — THE USUAL QUESTIONS, per category.
 *
 * On Post a job, choosing a category tile opens two to four short questions under the tile row,
 * each answered with one tap on a chip. Every answer becomes part of ONE line at the end of the
 * description ("2 pieces · Bring tools · 1 floor of stairs"), so a worker reads what to expect
 * before bidding and nothing new is stored: the description is the only place the answers live.
 * The operator ruled that the run writes the questions (LUX-LIST-3.md §7) and may change any of
 * them after seeing them on the phone.
 *
 * Nothing here asks what another step already asks — no date, no time, no address, no price —
 * so an answer can never contradict the schedule or the budget the customer sets later.
 */
import type { JobCategory } from './jobs';

export type PostQuestionOption = {
  /** The chip's words. */
  label: string;
  /** What the answer adds to the description line. */
  line: string;
};

export type PostQuestion = {
  id: string;
  ask: string;
  options: readonly PostQuestionOption[];
};

/** Which option each question has, by question id; an unanswered question is absent. */
export type PostAnswers = Readonly<Record<string, number>>;

/** Between two answers on the description line. */
export const ANSWER_JOIN = ' · ';

const STAIRS: PostQuestion = {
  id: 'stairs',
  ask: 'Stairs to carry things up?',
  options: [
    { label: 'None', line: 'No stairs' },
    { label: '1 floor', line: '1 floor of stairs' },
    { label: '2 or more', line: '2+ floors of stairs' },
    { label: 'Elevator', line: 'Elevator' },
  ],
};

export const POST_QUESTIONS: Readonly<Record<JobCategory, readonly PostQuestion[]>> = {
  furniture_assembly: [
    {
      id: 'pieces',
      ask: 'How many pieces?',
      options: [
        { label: '1', line: '1 piece' },
        { label: '2', line: '2 pieces' },
        { label: '3+', line: '3 or more pieces' },
      ],
    },
    {
      id: 'tools',
      ask: 'Do you have the tools?',
      options: [
        { label: 'I have them', line: 'I have tools' },
        { label: 'Bring tools', line: 'Bring tools' },
      ],
    },
    STAIRS,
  ],
  moving: [
    {
      id: 'size',
      ask: 'How much is moving?',
      options: [
        { label: 'A few items', line: 'A few items' },
        { label: 'One room', line: 'One room' },
        { label: 'Whole home', line: 'A whole home' },
      ],
    },
    STAIRS,
    {
      id: 'vehicle',
      ask: 'Need a vehicle?',
      options: [
        { label: 'I have one', line: 'I have a vehicle' },
        { label: 'Bring a van', line: 'Bring a van or truck' },
      ],
    },
    {
      id: 'heavy',
      ask: 'Anything very heavy?',
      options: [
        { label: 'No', line: 'Nothing very heavy' },
        { label: 'Yes', line: 'Some very heavy items' },
      ],
    },
  ],
  cleaning: [
    {
      id: 'size',
      ask: 'How big is the place?',
      options: [
        { label: 'Studio', line: 'Studio' },
        { label: '1 bed', line: '1 bedroom' },
        { label: '2 beds', line: '2 bedrooms' },
        { label: '3+ beds', line: '3+ bedrooms' },
      ],
    },
    {
      id: 'kind',
      ask: 'What kind of clean?',
      options: [
        { label: 'Regular', line: 'Regular clean' },
        { label: 'Deep', line: 'Deep clean' },
        { label: 'Move-out', line: 'Move-out clean' },
      ],
    },
    {
      id: 'supplies',
      ask: 'Do you have supplies?',
      options: [
        { label: 'I have them', line: 'I have supplies' },
        { label: 'Bring them', line: 'Bring supplies' },
      ],
    },
    {
      id: 'pets',
      ask: 'Pets at home?',
      options: [
        { label: 'No', line: 'No pets' },
        { label: 'Yes', line: 'Pets at home' },
      ],
    },
  ],
  tv_mounting: [
    {
      id: 'what',
      ask: 'What is going up?',
      options: [
        { label: 'A TV', line: 'Mounting a TV' },
        { label: 'Shelves', line: 'Mounting shelves' },
        { label: 'Art or mirror', line: 'Hanging art or a mirror' },
      ],
    },
    {
      id: 'wall',
      ask: 'What is the wall?',
      options: [
        { label: 'Drywall', line: 'Drywall' },
        { label: 'Brick or concrete', line: 'Brick or concrete wall' },
        { label: 'Not sure', line: 'Not sure of the wall' },
      ],
    },
    {
      id: 'hardware',
      ask: 'Mount and hardware?',
      options: [
        { label: 'I have them', line: 'I have the mount and hardware' },
        { label: 'Bring them', line: 'Bring the mount and hardware' },
      ],
    },
  ],
  handyman: [
    {
      id: 'count',
      ask: 'How many fixes?',
      options: [
        { label: '1', line: '1 fix' },
        { label: '2–3', line: '2–3 fixes' },
        { label: '4+', line: '4 or more fixes' },
      ],
    },
    {
      id: 'parts',
      ask: 'Parts and materials?',
      options: [
        { label: 'I have them', line: 'I have the parts' },
        { label: 'Bring them', line: 'Bring parts' },
        { label: 'Not sure', line: 'Not sure what parts are needed' },
      ],
    },
    {
      id: 'ladder',
      ask: 'Is a ladder needed?',
      options: [
        { label: 'No', line: 'No ladder needed' },
        { label: 'Yes', line: 'Needs a ladder' },
      ],
    },
  ],
  yard_work: [
    {
      id: 'size',
      ask: 'How big is the yard?',
      options: [
        { label: 'Small', line: 'Small yard' },
        { label: 'Medium', line: 'Medium yard' },
        { label: 'Large', line: 'Large yard' },
      ],
    },
    {
      id: 'task',
      ask: 'What is the main job?',
      options: [
        { label: 'Mowing', line: 'Mowing' },
        { label: 'Weeding', line: 'Weeding' },
        { label: 'Leaves', line: 'Leaf clearing' },
        { label: 'Hedges', line: 'Hedge trimming' },
      ],
    },
    {
      id: 'tools',
      ask: 'Do you have the tools?',
      options: [
        { label: 'I have them', line: 'I have tools' },
        { label: 'Bring tools', line: 'Bring tools' },
      ],
    },
    {
      id: 'waste',
      ask: 'Take the green waste away?',
      options: [
        { label: 'No', line: 'Leave the waste bagged' },
        { label: 'Yes', line: 'Take the waste away' },
      ],
    },
  ],
  painting: [
    {
      id: 'size',
      ask: 'How much painting?',
      options: [
        { label: 'Touch-ups', line: 'Touch-ups' },
        { label: 'One wall', line: 'One wall' },
        { label: 'One room', line: 'One room' },
        { label: 'More', line: 'More than one room' },
      ],
    },
    {
      id: 'paint',
      ask: 'Do you have the paint?',
      options: [
        { label: 'I have it', line: 'I have paint' },
        { label: 'Bring it', line: 'Bring paint' },
      ],
    },
    {
      id: 'ceilings',
      ask: 'Ceilings too?',
      options: [
        { label: 'No', line: 'Walls only' },
        { label: 'Yes', line: 'Ceilings too' },
      ],
    },
  ],
  packing: [
    {
      id: 'which',
      ask: 'Packing or unpacking?',
      options: [
        { label: 'Packing', line: 'Packing' },
        { label: 'Unpacking', line: 'Unpacking' },
        { label: 'Both', line: 'Packing and unpacking' },
      ],
    },
    {
      id: 'size',
      ask: 'How much?',
      options: [
        { label: 'A few boxes', line: 'A few boxes' },
        { label: 'One room', line: 'One room' },
        { label: 'Whole home', line: 'A whole home' },
      ],
    },
    {
      id: 'boxes',
      ask: 'Boxes and tape?',
      options: [
        { label: 'I have them', line: 'I have boxes and tape' },
        { label: 'Bring them', line: 'Bring boxes and tape' },
      ],
    },
  ],
  dog_walking: [
    {
      id: 'pet',
      ask: 'Which pet?',
      options: [
        { label: 'Dog', line: 'Dog' },
        { label: 'Cat', line: 'Cat' },
        { label: 'Other', line: 'Another pet' },
      ],
    },
    {
      id: 'count',
      ask: 'How many?',
      options: [
        { label: '1', line: '1 pet' },
        { label: '2', line: '2 pets' },
        { label: '3+', line: '3 or more pets' },
      ],
    },
    {
      id: 'length',
      ask: 'How long?',
      options: [
        { label: '30 min', line: '30 minutes' },
        { label: '1 hour', line: '1 hour' },
        { label: 'Longer', line: 'Over an hour' },
      ],
    },
  ],
  errands: [
    {
      id: 'kind',
      ask: 'What kind of errand?',
      options: [
        { label: 'Pick-up', line: 'A pick-up' },
        { label: 'Drop-off', line: 'A drop-off' },
        { label: 'Shopping', line: 'Shopping' },
        { label: 'Waiting in line', line: 'Waiting in line' },
      ],
    },
    {
      id: 'car',
      ask: 'Is a car needed?',
      options: [
        { label: 'No', line: 'No car needed' },
        { label: 'Yes', line: 'Needs a car' },
      ],
    },
    {
      id: 'distance',
      ask: 'How far?',
      options: [
        { label: 'Nearby', line: 'Nearby' },
        { label: 'Across town', line: 'Across town' },
      ],
    },
  ],
  other: [
    {
      id: 'length',
      ask: 'How long might it take?',
      options: [
        { label: 'Under an hour', line: 'Under an hour' },
        { label: '1–3 hours', line: '1–3 hours' },
        { label: 'Half a day+', line: 'Half a day or more' },
      ],
    },
    {
      id: 'tools',
      ask: 'Tools or supplies?',
      options: [
        { label: 'I have them', line: 'I have what is needed' },
        { label: 'Bring them', line: 'Bring tools or supplies' },
        { label: 'None needed', line: 'No tools needed' },
      ],
    },
  ],
};

/**
 * Where `line` stands as a WHOLE line of `text` — from a line's start to its end — the last such
 * place, or -1. A short answer ("Dog") inside the customer's own sentence ("Please walk my Dog") is
 * theirs, never the answers' line (group 2's review).
 */
function lastWholeLine(text: string, line: string): number {
  let from = text.length;
  while (from >= 0) {
    const at = text.lastIndexOf(line, from);
    if (at < 0) return -1;
    const startsLine = at === 0 || text[at - 1] === '\n';
    const end = at + line.length;
    const endsLine = end === text.length || text[end] === '\n';
    if (startsLine && endsLine) return at;
    from = at - 1;
  }
  return -1;
}

/** The description line a category's answers make, in question order; '' when nothing is answered. */
export function answerLine(category: JobCategory | null, answers: PostAnswers): string {
  if (!category) return '';
  return POST_QUESTIONS[category]
    .map((question) => {
      const index = answers[question.id];
      return index == null ? null : question.options[index]?.line ?? null;
    })
    .filter((line): line is string => !!line)
    .join(ANSWER_JOIN);
}

/**
 * Puts the answers' line into the description. The line written last time (`previous`) is found
 * and replaced where it stands, so the customer's own words around it never move; if they have
 * edited it, their edit stays and the new line starts on a line of its own at the end. An emptied
 * line takes its own line break with it. A line that would push the description past its limit is
 * not written — the text stays exactly as it was — and `line` says which line the text now holds.
 */
export function withAnswerLine(
  description: string,
  previous: string,
  next: string,
  maxLength: number
): { text: string; line: string } {
  let text = description;
  const at = previous ? lastWholeLine(text, previous) : -1;
  if (at >= 0) {
    if (next) {
      text = text.slice(0, at) + next + text.slice(at + previous.length);
    } else {
      let start = at;
      let end = at + previous.length;
      if (start > 0 && text[start - 1] === '\n') start -= 1;
      else if (text[end] === '\n') end += 1;
      text = text.slice(0, start) + text.slice(end);
    }
  } else if (next) {
    const base = text.replace(/\s+$/, '');
    text = base ? `${base}\n${next}` : next;
  }
  if (text.length > maxLength) {
    return { text: description, line: at >= 0 ? previous : '' };
  }
  return { text, line: next };
}
