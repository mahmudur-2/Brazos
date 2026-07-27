import { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { colors, spacing } from '../lib/theme';

type Block =
  | { kind: 'h1' | 'h2' | 'h3' | 'p'; text: string }
  | { kind: 'li'; text: string };

/**
 * Minimal markdown renderer for the legal documents.
 *
 * Deliberately not a dependency: the documents in lib/legal only ever use
 * headings, paragraphs and bullets, and a markdown library would pull in a
 * parser plus an HTML/React renderer to handle syntax this app never emits.
 * Keeping the source as real markdown means the text can still be handed to a
 * lawyer or published to a website unchanged.
 *
 * Supported: `#`/`##`/`###` headings, `- ` bullets, blank-line-separated
 * paragraphs with soft-wrapped lines joined back together.
 */
function parse(markdown: string): Block[] {
  const blocks: Block[] = [];
  let paragraph: string[] = [];

  const flush = () => {
    if (paragraph.length > 0) {
      blocks.push({ kind: 'p', text: paragraph.join(' ') });
      paragraph = [];
    }
  };

  for (const rawLine of markdown.split(/\r?\n/)) {
    const line = rawLine.trim();

    if (line === '') {
      flush();
      continue;
    }
    if (line.startsWith('### ')) {
      flush();
      blocks.push({ kind: 'h3', text: line.slice(4) });
      continue;
    }
    if (line.startsWith('## ')) {
      flush();
      blocks.push({ kind: 'h2', text: line.slice(3) });
      continue;
    }
    if (line.startsWith('# ')) {
      flush();
      blocks.push({ kind: 'h1', text: line.slice(2) });
      continue;
    }
    if (line.startsWith('- ')) {
      flush();
      blocks.push({ kind: 'li', text: line.slice(2) });
      continue;
    }
    // A wrapped continuation of a bullet, rather than a new paragraph.
    const previous = blocks[blocks.length - 1];
    if (paragraph.length === 0 && previous?.kind === 'li' && rawLine.startsWith('  ')) {
      previous.text += ' ' + line;
      continue;
    }
    paragraph.push(line);
  }
  flush();

  return blocks;
}

export function MarkdownText({ markdown }: { markdown: string }) {
  const blocks = useMemo(() => parse(markdown), [markdown]);

  return (
    <View style={styles.container}>
      {blocks.map((block, index) => {
        if (block.kind === 'li') {
          return (
            <View key={index} style={styles.bulletRow}>
              <Text style={styles.bulletDot}>•</Text>
              <Text style={styles.bulletText}>{block.text}</Text>
            </View>
          );
        }
        return (
          <Text key={index} style={styles[block.kind]}>
            {block.text}
          </Text>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: spacing.sm,
  },
  h1: {
    fontSize: 22,
    fontWeight: '800',
    color: colors.text,
    marginTop: spacing.sm,
  },
  h2: {
    fontSize: 17,
    fontWeight: '800',
    color: colors.text,
    marginTop: spacing.lg,
  },
  h3: {
    fontSize: 15,
    fontWeight: '700',
    color: colors.text,
    marginTop: spacing.md,
  },
  p: {
    fontSize: 14,
    lineHeight: 21,
    color: colors.text,
  },
  bulletRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    paddingLeft: spacing.xs,
  },
  bulletDot: {
    fontSize: 14,
    lineHeight: 21,
    color: colors.textMuted,
  },
  bulletText: {
    flex: 1,
    fontSize: 14,
    lineHeight: 21,
    color: colors.text,
  },
});
