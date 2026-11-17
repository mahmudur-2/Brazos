// Apple-style Title Case for a label built at run time (a map lookup or a label with data in it).
// A label written in the source is written in Title Case there; never run this on a sentence.

// Short words that stay lower case inside a label (articles, coordinating conjunctions, prepositions of four or fewer letters).
const MINOR = new Set(['a', 'an', 'and', 'as', 'at', 'but', 'by', 'for', 'from', 'in', 'into', 'nor', 'of', 'on', 'onto', 'or', 'per', 'the', 'to', 'via', 'vs', 'with']);
// After these verbs the next short word is part of the verb and gets a capital: "Sign In", "Set Up".
const PHRASAL = new Set(['sign', 'log', 'set', 'turn', 'check', 'opt', 'top', 'pick', 'fill', 'cash']);
// Units after a number stay as written: "15 min", "5 mi".
const UNITS = new Set(['min', 'mins', 'h', 'hr', 'hrs', 'sec', 's', 'km', 'mi', 'ft', 'am', 'pm', 'x']);
// An article is never part of a phrasal verb: "Pick a Day".
const ARTICLES = new Set(['a', 'an', 'the']);

function capWord(seg: string, force: boolean, prev: string, afterNumber: boolean): string {
  const m = /^([^A-Za-z]*)([A-Za-z][A-Za-z']*)(.*)$/.exec(seg);
  if (!m) return seg;
  const [, pre, word, post] = m;
  if (/\d$/.test(pre)) return seg;
  if (afterNumber && pre === '' && UNITS.has(word.toLowerCase())) return seg;
  if (/[A-Z]/.test(word.slice(1))) return seg;
  const lower = word.toLowerCase();
  if (!force && MINOR.has(lower) && !(PHRASAL.has(prev) && !ARTICLES.has(lower))) return pre + lower + post;
  return pre + word[0].toUpperCase() + word.slice(1) + post;
}

export function titleCase(label: string): string {
  // A full sentence keeps its own letters.
  if (/[?!.]["'”’)]*\s*$/.test(label)) return label;
  const parts = label.split(/(\s+)/);
  const count = parts.filter((p) => p.trim() !== '').length;
  let index = 0;
  let prev = '';
  let prevRaw = '';
  return parts
    .map((part) => {
      if (part.trim() === '') return part;
      const force = index === 0 || index === count - 1;
      index += 1;
      const out = part
        .split('-')
        .map((seg, i) => capWord(seg, force || i > 0, prev, i === 0 && /\d$/.test(prevRaw)))
        .join('-');
      prev = part.toLowerCase().replace(/[^a-z]/g, '');
      prevRaw = part;
      return out;
    })
    .join('');
}
