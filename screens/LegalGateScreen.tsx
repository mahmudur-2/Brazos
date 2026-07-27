import { useRef, useState } from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  type LayoutChangeEvent,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Button } from '../components/Button';
import { MarkdownText } from '../components/MarkdownText';
import { SegmentedControl } from '../components/SegmentedControl';
import { useAuth } from '../hooks/useAuth';
import { alertAsync, confirmAsync } from '../lib/dialog';
import {
  acceptCurrentDocuments,
  LEGAL_DOCUMENTS,
  type LegalDocumentKey,
} from '../lib/legal';
import { colors, radius, spacing } from '../lib/theme';

type LegalGateScreenProps = {
  /** Called once acceptance has been recorded, so the app can continue. */
  onAccepted: () => void;
};

/**
 * The blocking acceptance step.
 *
 * One screen serves both cases the product needs: a brand-new account reaches
 * it immediately after sign-up (before anything else is usable), and an
 * existing account reaches it on next launch because their recorded version no
 * longer matches the current one. Gating on "has this user accepted the
 * current version" rather than on "is this a new sign-up" means a future
 * revision of the documents re-prompts everyone automatically, with no
 * extra code.
 *
 * Signing out is deliberately the only way past it without accepting.
 */
export function LegalGateScreen({ onAccepted }: LegalGateScreenProps) {
  const { logout } = useAuth();
  const [tab, setTab] = useState<LegalDocumentKey>('terms');
  const [agreed, setAgreed] = useState(false);
  const [saving, setSaving] = useState(false);

  // Which documents have been scrolled to the bottom. Not a hard gate — the
  // checkbox is — but it drives the "scroll to read" nudge, so a user isn't
  // left wondering whether they've seen everything.
  const [seen, setSeen] = useState<Record<LegalDocumentKey, boolean>>({
    terms: false,
    privacy: false,
  });

  const scrollRef = useRef<ScrollView>(null);
  const contentHeight = useRef(0);
  const viewportHeight = useRef(0);

  function onScroll(event: NativeSyntheticEvent<NativeScrollEvent>) {
    const { layoutMeasurement, contentOffset, contentSize } = event.nativeEvent;
    const atBottom =
      layoutMeasurement.height + contentOffset.y >= contentSize.height - 48;
    if (atBottom && !seen[tab]) {
      setSeen((prev) => ({ ...prev, [tab]: true }));
    }
  }

  function onContentSizeChange(_w: number, h: number) {
    contentHeight.current = h;
    // A document short enough not to scroll counts as read on sight.
    if (viewportHeight.current > 0 && h <= viewportHeight.current && !seen[tab]) {
      setSeen((prev) => ({ ...prev, [tab]: true }));
    }
  }

  function onLayout(event: LayoutChangeEvent) {
    viewportHeight.current = event.nativeEvent.layout.height;
  }

  function switchTab(next: LegalDocumentKey) {
    setTab(next);
    scrollRef.current?.scrollTo({ y: 0, animated: false });
  }

  async function handleContinue() {
    if (!agreed) return;
    setSaving(true);
    const { error } = await acceptCurrentDocuments();
    setSaving(false);

    if (error) {
      await alertAsync(
        'Could not save your acceptance',
        `${error.message}\n\nYou need a connection to continue.`
      );
      return;
    }
    onAccepted();
  }

  async function handleSignOut() {
    const ok = await confirmAsync({
      title: 'Sign out?',
      message: 'You need to accept these before you can use Brazos.',
      confirmText: 'Sign out',
      cancelText: 'Back',
      destructive: true,
    });
    if (ok) await logout();
  }

  const doc = LEGAL_DOCUMENTS[tab];
  const bothSeen = seen.terms && seen.privacy;

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <View style={styles.header}>
        <Text style={styles.title}>Before you start</Text>
        <Text style={styles.subtitle}>
          Please read and accept both documents to use Brazos.
        </Text>
      </View>

      <View style={styles.tabs}>
        <SegmentedControl
          options={[
            { label: 'Terms of Service', value: 'terms' },
            { label: 'Privacy Policy', value: 'privacy' },
          ]}
          value={tab}
          onChange={(next) => switchTab(next as LegalDocumentKey)}
        />
      </View>

      <ScrollView
        ref={scrollRef}
        style={styles.docScroll}
        contentContainerStyle={styles.docContent}
        onScroll={onScroll}
        onContentSizeChange={onContentSizeChange}
        onLayout={onLayout}
        scrollEventThrottle={64}
      >
        <MarkdownText markdown={doc.body} />
        <Text style={styles.version}>Version {doc.version}</Text>
      </ScrollView>

      <View style={styles.footer}>
        {!bothSeen && (
          <Text style={styles.nudge}>
            {seen[tab]
              ? `Now read the ${tab === 'terms' ? 'Privacy Policy' : 'Terms of Service'}.`
              : 'Scroll to the end to read the whole document.'}
          </Text>
        )}

        <Pressable
          style={styles.checkRow}
          onPress={() => setAgreed((v) => !v)}
          accessibilityRole="checkbox"
          accessibilityState={{ checked: agreed }}
        >
          <Ionicons
            name={agreed ? 'checkbox' : 'square-outline'}
            size={24}
            color={agreed ? colors.primary : colors.textSubtle}
          />
          <Text style={styles.checkLabel}>
            I have read and agree to the Terms of Service and Privacy Policy.
          </Text>
        </Pressable>

        <Button
          title="Continue"
          onPress={handleContinue}
          disabled={!agreed}
          loading={saving}
        />
        <Pressable onPress={handleSignOut} hitSlop={8} disabled={saving}>
          <Text style={styles.signOut}>Sign out</Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: colors.background,
  },
  header: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    gap: spacing.xs,
  },
  title: {
    fontSize: 24,
    fontWeight: '800',
    color: colors.text,
  },
  subtitle: {
    fontSize: 14,
    color: colors.textMuted,
    lineHeight: 20,
  },
  tabs: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  docScroll: {
    flex: 1,
    marginHorizontal: spacing.lg,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
  },
  docContent: {
    padding: spacing.lg,
    paddingBottom: spacing.xl,
  },
  version: {
    marginTop: spacing.lg,
    fontSize: 11,
    color: colors.textSubtle,
  },
  footer: {
    padding: spacing.lg,
    gap: spacing.md,
  },
  nudge: {
    fontSize: 12,
    color: colors.textMuted,
    textAlign: 'center',
  },
  checkRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
  },
  checkLabel: {
    flex: 1,
    fontSize: 14,
    lineHeight: 20,
    color: colors.text,
  },
  signOut: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.textMuted,
    textAlign: 'center',
  },
});
