// 2026-09-30 (the build run, idea 23) — CATEGORY TILES, THEN THE USUAL QUESTIONS: Post a job's
// category picker is Home's tile row; choosing a tile opens two to four questions in the page, and
// each answer joins ONE line at the end of the description.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { ANSWER_JOIN, POST_QUESTIONS, answerLine, withAnswerLine } from '../lib/postQuestions.ts';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (path) => readFileSync(join(root, path), 'utf8');
const flat = (source) => source.replace(/\s+/g, ' ');

const CATEGORIES = [...read('lib/jobs.ts').match(/export const JOB_CATEGORIES = \[([\s\S]*?)\] as const;/)[1].matchAll(/'([a-z_]+)'/g)].map(
  (m) => m[1]
);

test('[executed] every category has two to four questions, each a real choice, none asking what another step asks', () => {
  assert.deepEqual(Object.keys(POST_QUESTIONS).sort(), [...CATEGORIES].sort(), 'one list per job category');
  for (const [category, questions] of Object.entries(POST_QUESTIONS)) {
    assert.ok(questions.length >= 2 && questions.length <= 4, `${category}: ${questions.length} questions`);
    const ids = questions.map((q) => q.id);
    assert.equal(new Set(ids).size, ids.length, `${category}: question ids are unique`);
    for (const question of questions) {
      assert.ok(question.options.length >= 2, `${category}/${question.id}: at least two answers`);
      for (const option of question.options) {
        assert.ok(option.label.trim() && option.line.trim(), `${category}/${question.id}: every answer has words`);
        assert.ok(!option.line.includes(ANSWER_JOIN.trim()), 'an answer never carries the separator');
      }
      // The schedule, the address and the price have their own steps: no answer may contradict them.
      assert.doesNotMatch(question.ask, /\bwhen\b|\bdate\b|\btime\b|\bprice\b|\bbudget\b|\baddress\b|\$/i, `${category}: "${question.ask}"`);
    }
  }
});

test('[executed] the answers make one line, in question order', () => {
  assert.equal(answerLine(null, { pieces: 1 }), '');
  assert.equal(answerLine('furniture_assembly', {}), '');
  assert.equal(answerLine('furniture_assembly', { tools: 1, pieces: 1 }), '2 pieces · Bring tools');
  assert.equal(answerLine('furniture_assembly', { stairs: 1, pieces: 0 }), '1 piece · 1 floor of stairs');
  assert.equal(answerLine('furniture_assembly', { pieces: 9 }), '', 'an index off the list reads as unanswered');
});

test('[executed] the line is written in place, never duplicated, and never past the limit', () => {
  // Into an empty description, and onto its own line after the customer's words.
  assert.deepEqual(withAnswerLine('', '', '2 pieces', 500), { text: '2 pieces', line: '2 pieces' });
  assert.deepEqual(withAnswerLine('Two bookcases.  \n', '', '2 pieces', 500), { text: 'Two bookcases.\n2 pieces', line: '2 pieces' });
  // The next answer rewrites the line where it stands; words after it stay after it.
  assert.deepEqual(
    withAnswerLine('Two bookcases.\n2 pieces\nThe study.', '2 pieces', '2 pieces · Bring tools', 500),
    { text: 'Two bookcases.\n2 pieces · Bring tools\nThe study.', line: '2 pieces · Bring tools' }
  );
  // Unpicking the last answer takes the line and its own line break away.
  assert.deepEqual(withAnswerLine('Two bookcases.\n2 pieces', '2 pieces', '', 500), { text: 'Two bookcases.', line: '' });
  assert.deepEqual(withAnswerLine('2 pieces\nTwo bookcases.', '2 pieces', '', 500), { text: 'Two bookcases.', line: '' });
  // A line the customer edited is theirs: the new one starts on a line of its own.
  assert.deepEqual(withAnswerLine('Two bookcases.\n2 big pieces', '2 pieces', '2 pieces · Bring tools', 500), {
    text: 'Two bookcases.\n2 big pieces\n2 pieces · Bring tools',
    line: '2 pieces · Bring tools',
  });
  // Past the limit nothing is written, and the line the text still holds is reported.
  const full = 'x'.repeat(495);
  assert.deepEqual(withAnswerLine(full, '', '2 pieces', 500), { text: full, line: '' });
  assert.deepEqual(withAnswerLine(`${'x'.repeat(480)}\n1 piece`, '1 piece', '3 or more pieces · Bring tools', 500), {
    text: `${'x'.repeat(480)}\n1 piece`,
    line: '1 piece',
  });
});

test('[static] the tiles are Home\'s: the same measured square, glyph and corner; the chosen one widens for its check', () => {
  const row = read('components/CategoryTileRow.tsx');
  assert.match(row, /import \{ TILE_FLOOR, TILE_ICON_SIZE, tileSizeFor \} from '\.\/ServiceTileRow';/);
  assert.match(row, /const tile = rowWidth === null \? TILE_FLOOR : tileSizeFor\(rowWidth, gap\);/);
  assert.match(row, /const gap = inset;/);
  assert.match(row, /borderRadius: emeraldRadius\.lg,/);
  assert.match(row, /<CategoryGlyph name=\{tileIcon\(category\)\} size=\{TILE_ICON_SIZE\} color=\{colors\.emerald\} \/>/);
  assert.match(row, /return skillCategoryIcon\(category\) \?\? JOB_CATEGORY_ICONS\[category\];/, "Home's own glyph for the category");
  assert.match(row, /<TileCheck shown=\{chosen\} fill=\{colors\.primary\} ink=\{colors\.onPrimary\} \/>/);
  assert.match(row, /accessibilityState=\{\{ expanded: open \}\}/, 'the arrow says whether the questions are open');
  const tokens = read('ui/tokens.ts');
  assert.match(tokens, /export const postTiles = \{[\s\S]*?slot: 25,/, 'the tile grows by about 25');
});

test('[static] the questions open in the page as plain rows, and the page brings them into view', () => {
  const questions = flat(read('components/PostQuestions.tsx'));
  assert.match(questions, /<DropdownBody open=\{open\} style=\{styles\.drop\}>/, 'the Profile rows\' in-place opening');
  assert.match(questions, /<EntranceView key=\{`\$\{category\}-\$\{question\.id\}`\} index=\{index \+ 1\}/, 'the rows lift in one after another');
  assert.match(questions, /<Chip key=\{option\.label\} label=\{option\.label\} variant="filter"/, "the app's own choice chips");
  assert.match(questions, /accessibilityLabel="Skip the questions"/);
  assert.doesNotMatch(questions, /litCardStyle|BlurLayer|<(?:Sheet|SheetCard|PeekSheet|ActionSheet)\b/, 'look 2: no card, no pane, no sheet');

  const screen = flat(read('screens/PostJobScreen.tsx'));
  assert.match(screen, /<PostQuestions category=\{category\} open=\{questionsOpen\} answers=\{answers\} onAnswer=\{answerQuestion\} onSkip=\{\(\) => setQuestionsOpen\(false\)\} onShown=\{revealQuestions\} \/>/);
  // Leaving a category takes its answers' line out of the description with it.
  assert.match(screen, /if \(answersLine\) setDescription\(withAnswerLine\(description, answersLine, '', MAX_DESCRIPTION_LENGTH\)\.text\);/);
  // An answer that would not fit is not taken.
  assert.match(screen, /if \(written\.line !== line\) return;/);
  // The page scrolls itself so every question shows above the floating tab bar — a frame, not a timer.
  assert.match(screen, /const overflow = top \+ height - \(bottom - navClearance - spacing\.md\);/);
  assert.match(screen, /revealFrameRef\.current = requestAnimationFrame\(/);
  // The draft keeps the answers and their line, so a resumed post rewrites the line, never adds one.
  assert.match(screen, /setAnswers\(draft\.answers\); setAnswersLine\(draft\.answersLine\);/);
  assert.match(read('lib/postJobDraft.ts'), /answersLine: typeof parsed\.answersLine === 'string' \? parsed\.answersLine : '',/);
});
