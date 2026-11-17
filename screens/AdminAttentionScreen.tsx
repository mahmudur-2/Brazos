import { useCallback, useRef, useState } from 'react';
import { FlatList, Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { DropdownBody, DropdownChevron } from '../components/DropdownReveal';
import {
  ATTENTION_EMPTY,
  attentionCard,
  decideIssue,
  decisionGuard,
  fetchAttention,
  runDecision,
  type AttentionDecision,
  type DecisionGuard,
  type AttentionLine,
} from '../lib/adminAttention';
import { mailUrl, openMail, openPhone } from '../lib/appLinks';
import { alertAsync, confirmAsync } from '../lib/dialog';
import { goBackOrHome } from '../lib/navigationRef';
import { controls, screenGround, spacing, textScale, themedStyles, useThemeColors, type ColorPalette } from '../lib/theme';
import { Button, Card, EmptyState, TopBar, useScrollClearance } from '../ui/primitives';
import { SPINNER_STATE, ScreenStateView } from '../ui/templates';

/**
 * B6 (production-36h) — "NEEDS ATTENTION": the owner's list of what waits on someone, the lines of
 * rpc('admin_attention') in the server's order and the server's own words (lib/adminAttention.ts).
 * Reached from the second admin row in Account & Safety and from the "Brazos needs you" notice.
 * Where the owner can decide, the card shows the facts and the buttons the line's `decisions` name;
 * nothing else on the card acts.
 */
export function AdminAttentionScreen() {
  const { palette: colors, isDark } = useThemeColors();
  const styles = stylesFor(colors);
  const navClearance = useScrollClearance();
  const [lines, setLines] = useState<AttentionLine[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [busy, setBusy] = useState<ReadonlySet<string>>(new Set());

  // The newest read wins: a focus read and a pull-to-refresh can overlap (AdminReportsScreen's guard).
  const requestIdRef = useRef(0);
  const load = useCallback(async () => {
    const requestId = ++requestIdRef.current;
    const { data, error } = await fetchAttention();
    if (requestId !== requestIdRef.current) return;
    setLoadError(error);
    if (!error) setLines(data);
  }, []);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load])
  );

  async function onRefresh() {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }

  const markBusy = useCallback((key: string, on: boolean) => {
    setBusy((previous) => {
      const next = new Set(previous);
      if (on) next.add(key);
      else next.delete(key);
      return next;
    });
  }, []);

  // B7 (R2): one decision per card, from the tap until the list was read again (lib/adminAttention.ts).
  const guardRef = useRef<DecisionGuard | null>(null);
  if (guardRef.current === null) guardRef.current = decisionGuard(markBusy);
  const guard = guardRef.current;

  function decide(line: AttentionLine, side: AttentionDecision) {
    void runDecision(line, side, { confirm: confirmAsync, decide: decideIssue, alert: alertAsync, reload: load, guard });
  }

  return (
    <SafeAreaView style={[styles.safe, screenGround(colors, isDark)]} edges={['top']}>
      <TopBar title="Needs Attention" onBack={goBackOrHome} />
      {loadError ? (
        <ScreenStateView state={{ kind: 'error', message: loadError, onRetry: () => void load() }} />
      ) : lines === null ? (
        <ScreenStateView state={SPINNER_STATE} />
      ) : (
        <FlatList
          data={lines}
          keyExtractor={(line) => line.key}
          // A card's buttons turn off and on with its decision: the rows draw again when `busy` changes.
          extraData={busy}
          contentContainerStyle={[lines.length === 0 ? styles.emptyContainer : styles.listContent, { paddingBottom: navClearance }]}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void onRefresh()} />}
          showsVerticalScrollIndicator={false}
          renderItem={({ item }) => <AttentionCard line={item} busy={busy.has(item.key)} onDecide={decide} />}
          ListEmptyComponent={<EmptyState icon="checkmark-done-outline" title={ATTENTION_EMPTY.title} body={ATTENTION_EMPTY.body} />}
        />
      )}
    </SafeAreaView>
  );
}

function AttentionCard({
  line,
  busy,
  onDecide,
}: {
  line: AttentionLine;
  busy: boolean;
  onDecide: (line: AttentionLine, side: AttentionDecision) => void;
}) {
  const { palette: colors } = useThemeColors();
  const styles = stylesFor(colors);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const card = attentionCard(line);

  return (
    <Card>
      <View style={styles.headerRow}>
        <Text style={styles.label}>{card.label}</Text>
        {card.overdue ? <Text style={styles.overdue}>Overdue</Text> : null}
      </View>
      <Text style={styles.reason}>{card.reason}</Text>
      {card.facts.map((fact) => (
        <Text key={fact} style={styles.fact}>
          {fact}
        </Text>
      ))}

      {card.people
        ? card.people.map((person) => (
            <View key={person.role} style={styles.block}>
              <Text style={styles.blockTitle}>{person.name ? `${person.role}: ${person.name}` : person.role}</Text>
              {person.phone ? (
                <ContactRow icon="call-outline" text={person.phone} hint={`Call ${person.phone}`} onPress={() => void openPhone(person.phone as string)} />
              ) : null}
              {person.email && mailUrl(person.email) ? (
                <ContactRow icon="mail-outline" text={person.email} hint={`Email ${person.email}`} onPress={() => void openMail(person.email as string)} />
              ) : person.email ? (
                // B7 (R4): an address that is not plain is shown, never linked (lib/appLinks.ts mailUrl).
                <View style={styles.contactRow}>
                  <Ionicons name="mail-outline" size={16} color={colors.textSubtle} />
                  <Text selectable style={styles.plainContact}>
                    {person.email}
                  </Text>
                </View>
              ) : null}
            </View>
          ))
        : null}

      {card.report ? (
        <View style={styles.block}>
          <Text style={styles.blockTitle}>{card.report.label ? `Report: ${card.report.label}` : 'Report'}</Text>
          {card.report.details ? (
            <Card level="well" style={styles.quote}>
              <Text style={styles.quoteText}>“{card.report.details}”</Text>
            </Card>
          ) : null}
          {card.report.at ? <Text style={styles.fact}>{`Reported ${card.report.at}`}</Text> : null}
        </View>
      ) : null}

      {card.times ? (
        <View style={styles.block}>
          {card.times.map((time) => (
            <Text key={time.label} style={styles.fact}>
              {`${time.label}: ${time.value}`}
            </Text>
          ))}
        </View>
      ) : null}

      {card.note ? <Text style={styles.note}>{card.note}</Text> : null}

      {card.buttons.length > 0 ? (
        <View style={styles.actions}>
          {card.buttons.map((button) => (
            <Button
              key={button.side}
              title={button.label}
              variant="secondary"
              onPress={() => onDecide(line, button.side)}
              disabled={busy}
            />
          ))}
        </View>
      ) : null}

      {card.details ? (
        <View style={styles.block}>
          <Pressable
            onPress={() => setDetailsOpen((open) => !open)}
            style={styles.detailsRow}
            accessibilityRole="button"
            accessibilityLabel="Details"
            accessibilityState={{ expanded: detailsOpen }}
          >
            <Text style={styles.detailsLabel}>Details</Text>
            <DropdownChevron open={detailsOpen}>
              <Ionicons name="chevron-down" size={16} color={colors.textSubtle} />
            </DropdownChevron>
          </Pressable>
          <DropdownBody open={detailsOpen}>
            <Card level="well" style={styles.quote}>
              <Text selectable style={styles.detailText}>
                {card.details.detail}
              </Text>
              <Text selectable style={styles.detailText}>
                {card.details.code}
              </Text>
            </Card>
          </DropdownBody>
        </View>
      ) : null}
    </Card>
  );
}

/** A phone number or an address that opens its app (lib/appLinks.ts). */
function ContactRow({
  icon,
  text,
  hint,
  onPress,
}: {
  icon: 'call-outline' | 'mail-outline';
  text: string;
  hint: string;
  onPress: () => void;
}) {
  const { palette: colors } = useThemeColors();
  const styles = stylesFor(colors);
  return (
    <Pressable onPress={onPress} style={styles.contactRow} accessibilityRole="link" accessibilityLabel={hint}>
      <Ionicons name={icon} size={16} color={colors.primary} />
      <Text style={styles.contactText}>{text}</Text>
    </Pressable>
  );
}

const stylesFor = themedStyles((colors: ColorPalette) =>
  StyleSheet.create({
    safe: {
      flex: 1,
      backgroundColor: colors.background,
    },
    listContent: {
      padding: spacing.lg,
      gap: spacing.md,
    },
    emptyContainer: {
      flexGrow: 1,
      justifyContent: 'center',
      padding: spacing.xl,
    },
    headerRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: spacing.sm,
    },
    label: {
      ...textScale.label,
      color: colors.textMuted,
    },
    overdue: {
      ...textScale.footnote,
      fontWeight: '700',
      color: colors.danger,
    },
    reason: {
      ...textScale.headline,
      color: colors.text,
      marginTop: spacing.xs,
    },
    fact: {
      ...textScale.label,
      fontWeight: '400',
      color: colors.textMuted,
      marginTop: spacing.xs,
    },
    block: {
      marginTop: spacing.md,
    },
    blockTitle: {
      ...textScale.label,
      color: colors.primary,
    },
    contactRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
      minHeight: controls.minTouchTarget,
    },
    contactText: {
      ...textScale.body,
      color: colors.primary,
      flexShrink: 1,
    },
    plainContact: {
      ...textScale.body,
      color: colors.text,
      flexShrink: 1,
    },
    quote: {
      marginTop: spacing.sm,
      padding: spacing.md,
    },
    quoteText: {
      ...textScale.body,
      color: colors.text,
      fontStyle: 'italic',
    },
    note: {
      ...textScale.footnote,
      color: colors.textMuted,
      marginTop: spacing.md,
    },
    // One full-width button per line: side by side, "Refund Customer" breaks in two on a phone.
    actions: {
      gap: spacing.sm,
      marginTop: spacing.md,
    },
    detailsRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      minHeight: controls.minTouchTarget,
    },
    detailsLabel: {
      ...textScale.label,
      color: colors.textMuted,
    },
    detailText: {
      ...textScale.footnote,
      color: colors.text,
    },
  })
);
