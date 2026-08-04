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
import { AuthButton } from '../components/AuthButton';
import { MarkdownText } from '../components/MarkdownText';
import { useAuth } from '../hooks/useAuth';
import { alertAsync, confirmAsync } from '../lib/dialog';
import {
  acceptCurrentDocuments,
  LEGAL_DOCUMENTS,
  REQUIRED_DOCUMENTS,
  type LegalDocumentKey,
} from '../lib/legal';
import {
  authColors,
  authRadius,
  authShadows,
  authSizes,
  authSpacing,
  authType,
} from '../lib/authTheme';

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
 *
 * It renders on the emerald/ivory auth palette rather than the in-app cream
 * one because of where it sits: it is the last step of getting in, arrived at
 * directly from the auth stack, and the handover looked like two different
 * products. Nothing about the gate itself changed with that — the scroll
 * tracking, the checkbox, the versioned acceptance record and the sign-out
 * escape are the same behaviour on new paint.
 */
export function LegalGateScreen({ onAccepted }: LegalGateScreenProps) {
  const { logout } = useAuth();
  const [tab, setTab] = useState<LegalDocumentKey>('terms');
  const [agreed, setAgreed] = useState(false);
  const [saving, setSaving] = useState(false);

  // Which documents have been scrolled to the bottom. Not a hard gate — the
  // checkbox is — but it drives the status rows, so a user isn't left
  // wondering which one they still owe.
  const [seen, setSeen] = useState<Record<LegalDocumentKey, boolean>>({
    terms: false,
    privacy: false,
  });

  const scrollRef = useRef<ScrollView>(null);
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
    if (!agreed || saving) return;
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
  // The real gate. Detected from actual scroll position/content size (above),
  // never a timer — a user could read faster or slower than any fixed delay,
  // and a delay would let someone "accept" without the content ever having
  // reached the bottom of the viewport at all.
  const bothSeen = seen.terms && seen.privacy;
  const canCheck = bothSeen;

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom', 'left', 'right']}>
      <View style={styles.content}>
        <View style={styles.header}>
          <Text style={styles.eyebrow}>BEFORE YOU START</Text>
          <Text style={styles.title} maxFontSizeMultiplier={1.4}>
            Terms & Privacy
          </Text>
          <Text style={styles.subtitle}>
            Read both documents to the end, then confirm below.
          </Text>
        </View>

        {/*
          The status list doubles as the document switcher. Two jobs, one
          control: the row says whether that document is still outstanding,
          and tapping it opens it. The tick is a status indicator, not a
          switch — there is deliberately nothing here a user can turn on by
          hand, because the only thing that completes a row is reaching the
          bottom of that document.
        */}
        <View style={styles.statusCard}>
          {REQUIRED_DOCUMENTS.map((required, index) => {
            const done = seen[required.key];
            const active = tab === required.key;
            return (
              <Pressable
                key={required.key}
                onPress={() => switchTab(required.key)}
                style={[
                  styles.statusRow,
                  index > 0 && styles.statusRowDivider,
                  active && styles.statusRowActive,
                ]}
                accessibilityRole="button"
                accessibilityState={{ selected: active }}
                accessibilityLabel={`${required.title}. ${
                  done ? 'Read to the end.' : 'Not finished.'
                }`}
                accessibilityHint="Opens this document"
              >
                <View style={[styles.statusIcon, done && styles.statusIconDone]}>
                  <Ionicons
                    name={required.key === 'terms' ? 'document-text-outline' : 'lock-closed-outline'}
                    size={19}
                    color={done ? authColors.emerald : authColors.muted}
                  />
                </View>

                <View style={styles.statusText}>
                  <Text style={styles.statusTitle} numberOfLines={1}>
                    {required.title}
                  </Text>
                  {/* The state is spelled out, not only ticked — the tick's
                      colour must never be the only thing carrying it. */}
                  <Text style={styles.statusSubtitle} numberOfLines={1}>
                    {done ? 'Read to the end' : 'Scroll to the end to complete'}
                  </Text>
                </View>

                <Ionicons
                  name={done ? 'checkmark-circle' : 'ellipse-outline'}
                  size={24}
                  color={done ? authColors.emerald : authColors.line}
                />
              </Pressable>
            );
          })}
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
          <Pressable
            style={[styles.checkRow, !canCheck && styles.checkRowDisabled]}
            onPress={() => canCheck && setAgreed((v) => !v)}
            disabled={!canCheck}
            accessibilityRole="checkbox"
            accessibilityState={{ checked: agreed, disabled: !canCheck }}
            // react-native-web 0.21 does not map accessibilityState.checked,
            // so the box announced as a checkbox with no state at all. The
            // W3C-style prop is mapped, and native reads accessibilityState —
            // both are needed to cover both platforms.
            aria-checked={agreed}
            accessibilityHint={
              canCheck ? undefined : 'Available once both documents have been read to the end'
            }
          >
            <Ionicons
              name={agreed ? 'checkbox' : 'square-outline'}
              size={24}
              color={agreed ? authColors.forest : authColors.placeholder}
            />
            <Text style={styles.checkLabel}>
              I have read and agree to the Terms of Service and Privacy Policy.
            </Text>
          </Pressable>

          <AuthButton
            title="Agree and continue"
            onPress={handleContinue}
            disabled={!agreed || !bothSeen}
            loading={saving}
            accessibilityHint={
              bothSeen
                ? undefined
                : 'Read both documents to the end to enable this'
            }
          />

          <Pressable
            onPress={handleSignOut}
            hitSlop={8}
            disabled={saving}
            style={styles.signOutRow}
            accessibilityRole="button"
          >
            <Text style={styles.signOut}>Sign out</Text>
          </Pressable>
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: authColors.bg,
  },
  // The same centred column the auth screens use, so a wide web window shows
  // one composition rather than a stretched document.
  content: {
    flex: 1,
    width: '100%',
    maxWidth: authSizes.maxContentWidth,
    alignSelf: 'center',
    paddingHorizontal: authSpacing.gutter,
  },
  header: {
    paddingTop: authSpacing.lg,
    gap: authSpacing.xs,
  },
  eyebrow: {
    ...authType.eyebrow,
    color: authColors.emerald,
  },
  title: {
    ...authType.title,
    color: authColors.ink,
    marginTop: authSpacing.xs,
  },
  subtitle: {
    ...authType.body,
    color: authColors.muted,
  },
  statusCard: {
    marginTop: authSpacing.lg,
    borderRadius: authRadius.card,
    borderWidth: 1,
    borderColor: authColors.line,
    backgroundColor: authColors.surface,
    overflow: 'hidden',
    ...authShadows.card,
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: authSpacing.md,
    // Comfortably past the 44pt minimum, and identical for both rows so the
    // list reads as one block rather than two stacked controls.
    minHeight: 64,
    paddingHorizontal: authSpacing.lg - 2,
    paddingVertical: authSpacing.md,
  },
  statusRowDivider: {
    borderTopWidth: 1,
    borderTopColor: authColors.line,
  },
  statusRowActive: {
    backgroundColor: authColors.mint,
  },
  statusIcon: {
    width: 38,
    height: 38,
    borderRadius: authRadius.iconButton - 2,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: authColors.bg,
  },
  statusIconDone: {
    backgroundColor: authColors.mint2,
  },
  statusText: {
    // flex + numberOfLines on the children: a long document title truncates
    // instead of pushing the status indicator off the row.
    flex: 1,
    gap: 1,
  },
  statusTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: authColors.ink,
  },
  statusSubtitle: {
    ...authType.note,
    color: authColors.muted,
  },
  docScroll: {
    flex: 1,
    marginTop: authSpacing.lg,
    borderWidth: 1,
    borderColor: authColors.line,
    borderRadius: authRadius.card,
    backgroundColor: authColors.surface,
  },
  docContent: {
    padding: authSpacing.lg,
    paddingBottom: authSpacing.xl,
  },
  version: {
    marginTop: authSpacing.lg,
    fontSize: 11,
    color: authColors.placeholder,
  },
  footer: {
    paddingVertical: authSpacing.lg,
    gap: authSpacing.md,
  },
  checkRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: authSpacing.sm,
    // Keeps the tap target honest even though the label is only two lines.
    minHeight: 44,
  },
  checkRowDisabled: {
    opacity: 0.45,
  },
  checkLabel: {
    flex: 1,
    ...authType.note,
    color: authColors.ink,
  },
  signOutRow: {
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  signOut: {
    fontSize: 14,
    fontWeight: '600',
    color: authColors.muted,
    textAlign: 'center',
  },
});
