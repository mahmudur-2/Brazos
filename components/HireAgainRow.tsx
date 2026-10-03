import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { PressScale } from './PressScale';
import { Ionicons } from '@expo/vector-icons';
import { Avatar } from './Avatar';
import { firstNameOf } from '../lib/liveJobStatus';
import type { RebookStripItem } from '../lib/rebook';
import { spacing, themedStyles, useThemeColors, type ColorPalette } from '../lib/theme';
import { Sheet } from '../ui/primitives/Sheet';

/** refs/home-tucked-in.html `.stack span`: a 34pt face inside a 2pt ring. */
const FACE = 34;
const RING = 2;
const FACES_SHOWN = 3;

/** "Sam", "Sam and Priya", "Sam, Priya and Dana", "Sam, Priya, Dana and 1 more". */
export function hireAgainNames(items: readonly Pick<RebookStripItem, 'name'>[]): string {
  const firsts = items.map((item) => firstNameOf(item.name) ?? 'Worker');
  if (firsts.length <= 1) return firsts[0] ?? '';
  if (firsts.length === 2) return `${firsts[0]} and ${firsts[1]}`;
  if (firsts.length === 3) return `${firsts[0]}, ${firsts[1]} and ${firsts[2]}`;
  return `${firsts.slice(0, FACES_SHOWN).join(', ')} and ${firsts.length - FACES_SHOWN} more`;
}

/**
 * 2026-09-28 (LUX-LIST-64 #62, option B "Tucked in") — HIRE AGAIN, inside the
 * customer Home's task card under "Post a job": a hairline, three overlapping
 * faces (34pt, each in a 2pt ring of the card's own colour so they separate),
 * "Hire again" and "Sam, Priya, Dana and 1 more", and a chevron.
 *
 * The people are the ONE rebook list Discover's strip reads
 * (hooks/useRebookWorkers.ts — saved first, then everyone who has worked for
 * this customer, deleted accounts left out), so the two can never disagree about
 * who can be hired again. Tapping picks one in the shared sheet and starts the
 * direct-offer flow with them (PostJob's hireWorkerId); with a single person
 * there is nothing to pick, so the tap goes straight there. No one to rehire,
 * no row — it is a shortcut, never the card's content.
 */
export function HireAgainRow({
  items,
  ringColor,
  onHire,
}: {
  items: readonly RebookStripItem[];
  /** The card the row sits in, so each face's ring cuts it from the next. */
  ringColor: string;
  onHire: (item: RebookStripItem) => void;
}) {
  const { palette: colors } = useThemeColors();
  const styles = stylesFor(colors);
  const [open, setOpen] = useState(false);
  if (items.length === 0) return null;
  const names = hireAgainNames(items);

  function pick(item: RebookStripItem) {
    setOpen(false);
    onHire(item);
  }

  return (
    <>
      <PressScale
        haptic={false}
        onPress={() => (items.length === 1 ? onHire(items[0]) : setOpen(true))}
        style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
        accessibilityRole="button"
        accessibilityLabel={`Hire again: ${names}`}
      >
        <View style={styles.faces}>
          {items.slice(0, FACES_SHOWN).map((item, index) => (
            <View
              key={item.id}
              style={[styles.face, index > 0 && styles.faceOverlap, { borderColor: ringColor, backgroundColor: ringColor }]}
            >
              <Avatar name={item.name} uri={item.avatarUrl} size={FACE - RING * 2} />
            </View>
          ))}
        </View>
        <View style={styles.copy}>
          <Text style={styles.title}>Hire again</Text>
          <Text style={styles.names} numberOfLines={1}>
            {names}
          </Text>
        </View>
        <Ionicons name="chevron-forward" size={18} color={colors.textSubtle} />
      </PressScale>

      <Sheet visible={open} onClose={() => setOpen(false)} title="Hire again">
        <Text style={styles.sheetLead}>Pick someone to send a new job to.</Text>
        <View>
          {items.map((item, index) => {
            const name = item.name?.trim() || 'Worker';
            return (
              <PressScale
                haptic={false}
                key={item.id}
                onPress={() => pick(item)}
                style={({ pressed }) => [styles.person, index > 0 && styles.personDivided, pressed && styles.rowPressed]}
                accessibilityRole="button"
                accessibilityLabel={`Send ${name} a new job`}
              >
                <Avatar name={name} uri={item.avatarUrl} size={44} />
                <View style={styles.copy}>
                  <Text style={styles.personName} numberOfLines={1}>
                    {name}
                  </Text>
                  <Text style={styles.personMeta} numberOfLines={1}>
                    {item.saved ? 'Saved' : 'Worked for you'}
                  </Text>
                </View>
                <Ionicons name="chevron-forward" size={17} color={colors.textSubtle} />
              </PressScale>
            );
          })}
        </View>
      </Sheet>
    </>
  );
}

const stylesFor = themedStyles((colors: ColorPalette) =>
  StyleSheet.create({
    // `.hirerow`: 14 over a hairline, 2 more above it, a 12 gap.
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.md,
      minHeight: 44,
      paddingTop: 14,
      marginTop: 2,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: colors.border,
    },
    rowPressed: { opacity: 0.72 },
    faces: {
      flexDirection: 'row',
    },
    face: {
      width: FACE,
      height: FACE,
      borderRadius: FACE / 2,
      borderWidth: RING,
      alignItems: 'center',
      justifyContent: 'center',
      overflow: 'hidden',
    },
    faceOverlap: {
      marginLeft: -9,
    },
    copy: {
      flex: 1,
      minWidth: 0,
      gap: 1,
    },
    title: {
      fontSize: 15,
      lineHeight: 20,
      fontWeight: '700',
      color: colors.ink,
    },
    names: {
      fontSize: 12.5,
      lineHeight: 17,
      color: colors.textMuted,
    },
    sheetLead: {
      fontSize: 14,
      lineHeight: 19,
      color: colors.textMuted,
    },
    person: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.md,
      minHeight: 60,
      paddingVertical: spacing.sm,
    },
    personDivided: {
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: colors.border,
    },
    personName: {
      fontSize: 16,
      fontWeight: '600',
      color: colors.ink,
    },
    personMeta: {
      fontSize: 13,
      color: colors.textMuted,
    },
  })
);
