import { useEffect, useRef, useState } from 'react';
import {
  AccessibilityInfo,
  Animated,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
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
import { useReducedMotion } from '../hooks/useReducedMotion';
import { confirmAsync } from '../lib/dialog';
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
import { USE_NATIVE_DRIVER } from '../lib/motion';

/** How long the "scroll to the end" hint stays up on its own. */
const GUIDANCE_MS = 1800;
const CHECK_MS = 200;
const UNLOCK_MS = 220;

type LegalGateScreenProps = {
  /** Called once acceptance has been recorded, so the app can continue. */
  onAccepted: () => void;
};

/**
 * The blocking acceptance step.
 *
 * One screen serves every case the product needs: a brand-new account reaches
 * it from Setup, and an existing account reaches it directly on next launch
 * because their recorded version no longer matches the current one. Gating on
 * "has this user accepted the current version" rather than on "is this a new
 * sign-up" means a future revision re-prompts everyone automatically.
 *
 * Signing out is deliberately the only way past it without accepting.
 *
 * It renders on the emerald/ivory auth palette rather than the in-app cream
 * one because of where it sits: it is the last step of getting in. Nothing
 * about the gate itself changed with that — the scroll tracking, the checkbox,
 * the versioned acceptance record and the sign-out escape are the same
 * behaviour on new paint.
 */
export function LegalGateScreen({ onAccepted }: LegalGateScreenProps) {
  const { logout } = useAuth();
  const reducedMotion = useReducedMotion();

  // Everything on this screen is fixed height except the reader, which takes
  // what is left — so on a short device the reader is what collapses. At
  // 568pt it fell to under a fifth of the screen, which is the "tiny window"
  // this layout exists to avoid. Below the threshold the chrome gives up its
  // decoration (the intro line, some type scale, some padding) so the
  // document keeps a usable height instead.
  const { height: windowHeight } = useWindowDimensions();
  const compact = windowHeight < 700;

  const [tab, setTab] = useState<LegalDocumentKey>('terms');
  const [agreed, setAgreed] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Which documents have been scrolled to the bottom. Not a hard gate — the
  // checkbox is — but it drives the status rows, so a user isn't left
  // wondering which one they still owe.
  const [seen, setSeen] = useState<Record<LegalDocumentKey, boolean>>({
    terms: false,
    privacy: false,
  });

  const scrollRef = useRef<ScrollView>(null);
  const viewportHeight = useRef(0);

  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  function markSeen(key: LegalDocumentKey) {
    // Announced rather than only ticked: a screen-reader user gets no benefit
    // from a checkmark appearing somewhere above the fold.
    AccessibilityInfo.announceForAccessibility(
      `${LEGAL_DOCUMENTS[key].title} review complete`
    );
    setSeen((prev) => ({ ...prev, [key]: true }));
  }

  function onScroll(event: NativeSyntheticEvent<NativeScrollEvent>) {
    // The hint has done its job the moment the user starts moving.
    setGuidanceDismissed(true);

    const { layoutMeasurement, contentOffset, contentSize } = event.nativeEvent;
    const atBottom =
      layoutMeasurement.height + contentOffset.y >= contentSize.height - 48;
    if (atBottom && !seen[tab]) markSeen(tab);
  }

  function onContentSizeChange(_w: number, h: number) {
    // A document short enough not to scroll counts as read on sight.
    if (viewportHeight.current > 0 && h <= viewportHeight.current && !seen[tab]) {
      markSeen(tab);
    }
  }

  function onLayout(event: LayoutChangeEvent) {
    viewportHeight.current = event.nativeEvent.layout.height;
  }

  function switchTab(next: LegalDocumentKey) {
    setTab(next);
    scrollRef.current?.scrollTo({ y: 0, animated: false });
  }

  // --- scroll guidance ----------------------------------------------------
  const [guidanceDismissed, setGuidanceDismissed] = useState(false);
  const guidance = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    setGuidanceDismissed(false);
    const timer = setTimeout(() => {
      if (mounted.current) setGuidanceDismissed(true);
    }, GUIDANCE_MS);
    return () => clearTimeout(timer);
  }, [tab]);

  const guidanceShown = !seen[tab] && !guidanceDismissed;

  useEffect(() => {
    Animated.timing(guidance, {
      toValue: guidanceShown ? 1 : 0,
      duration: 180,
      useNativeDriver: USE_NATIVE_DRIVER,
    }).start();
  }, [guidance, guidanceShown]);

  // --- agreement unlock ---------------------------------------------------
  const doc = LEGAL_DOCUMENTS[tab];
  // The real gate. Detected from actual scroll position/content size (above),
  // never a timer — a user could read faster or slower than any fixed delay,
  // and a delay would let someone "accept" without the content ever having
  // reached the bottom of the viewport at all.
  const bothSeen = seen.terms && seen.privacy;
  const canCheck = bothSeen;
  const nextDocument = REQUIRED_DOCUMENTS.find((d) => !seen[d.key]);

  const unlock = useRef(new Animated.Value(0)).current;
  const wasUnlocked = useRef(false);

  useEffect(() => {
    if (!bothSeen || wasUnlocked.current) return;
    wasUnlocked.current = true;

    AccessibilityInfo.announceForAccessibility(
      'Both documents reviewed. Agreement is now available.'
    );

    if (reducedMotion) {
      unlock.setValue(1);
      return;
    }
    Animated.timing(unlock, {
      toValue: 1,
      duration: UNLOCK_MS,
      useNativeDriver: USE_NATIVE_DRIVER,
    }).start();
  }, [bothSeen, reducedMotion, unlock]);

  const unlockStyle = {
    opacity: unlock.interpolate({ inputRange: [0, 1], outputRange: [0.45, 1] }),
    transform: [
      { translateY: unlock.interpolate({ inputRange: [0, 1], outputRange: [8, 0] }) },
    ],
  };

  // --- submit -------------------------------------------------------------
  async function handleContinue() {
    if (!agreed || !bothSeen || saving) return;
    setSaving(true);
    setError(null);

    const { error: acceptError } = await acceptCurrentDocuments();
    if (!mounted.current) return;
    setSaving(false);

    if (acceptError) {
      // Inline and retryable — every completed document and the ticked box
      // stay exactly as they were. The provider's message rarely ends in a
      // full stop, and two sentences run together read as one broken one.
      const detail = acceptError.message.replace(/\s*\.?\s*$/, '');
      setError(`${detail}. You need a connection to continue.`);
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

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom', 'left', 'right']}>
      <View style={styles.content}>
        <View style={styles.header}>
          <Text style={styles.eyebrow}>BEFORE YOU START</Text>
          <Text style={[styles.title, compact && styles.titleCompact]} maxFontSizeMultiplier={1.4}>
            Terms & Privacy
          </Text>
          {/* The rows below already say which document is outstanding, and the
              footer says what unlocks the agreement — so this line is the
              first thing to go when height is scarce. */}
          {compact ? null : (
            <Text style={styles.subtitle}>
              Read both documents to the end, then confirm below.
            </Text>
          )}
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
          {REQUIRED_DOCUMENTS.map((required, index) => (
            <DocumentStatusRow
              key={required.key}
              title={required.title}
              icon={required.key === 'terms' ? 'document-text-outline' : 'lock-closed-outline'}
              done={seen[required.key]}
              active={tab === required.key}
              isNext={nextDocument?.key === required.key}
              divider={index > 0}
              compact={compact}
              reducedMotion={reducedMotion === true}
              onPress={() => switchTab(required.key)}
            />
          ))}
        </View>

        <View style={styles.docWrapper}>
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

          {/* pointerEvents none: a hint must never be a thing you have to get
              past. It sits over the document and cannot take a touch. */}
          <Animated.View
            style={[styles.guidance, { opacity: guidance }]}
            pointerEvents="none"
            accessibilityElementsHidden
            importantForAccessibility="no-hide-descendants"
          >
            <Text style={styles.guidanceText}>Scroll to the end to continue</Text>
            <Ionicons name="chevron-down" size={15} color={authColors.forest} />
          </Animated.View>
        </View>

        <View style={[styles.footer, compact && styles.footerCompact]}>
          {/* When one document is done and the other isn't, the next step is
              named explicitly rather than left for the user to infer from a
              tick. Nothing moves them automatically. */}
          {!bothSeen && seen[tab] && nextDocument ? (
            <AuthButton
              title={`Review ${nextDocument.title}`}
              variant="ghost"
              onPress={() => switchTab(nextDocument.key)}
            />
          ) : null}

          {!bothSeen ? (
            <Text style={styles.helper}>Review both documents to enable agreement.</Text>
          ) : null}

          <Animated.View style={unlockStyle}>
            <Pressable
              style={styles.checkRow}
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
          </Animated.View>

          {error ? (
            <Text style={styles.error} accessibilityLiveRegion="assertive">
              {error}
            </Text>
          ) : null}

          <AuthButton
            title="Agree and continue"
            weight="semibold"
            onPress={handleContinue}
            disabled={!agreed || !bothSeen}
            loading={saving}
            accessibilityHint={
              bothSeen ? undefined : 'Read both documents to the end to enable this'
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

/**
 * One document's row. The tick scales in once, when that document is finished
 * — a small acknowledgement that something was completed, not an animation
 * that plays every render.
 */
function DocumentStatusRow({
  title,
  icon,
  done,
  active,
  isNext,
  divider,
  compact,
  reducedMotion,
  onPress,
}: {
  title: string;
  icon: 'document-text-outline' | 'lock-closed-outline';
  done: boolean;
  active: boolean;
  isNext: boolean;
  divider: boolean;
  compact: boolean;
  reducedMotion: boolean;
  onPress: () => void;
}) {
  const check = useRef(new Animated.Value(done ? 1 : 0)).current;
  const wasDone = useRef(done);

  useEffect(() => {
    if (done === wasDone.current) return;
    wasDone.current = done;
    if (!done) return;

    if (reducedMotion) {
      check.setValue(1);
      return;
    }
    Animated.timing(check, {
      toValue: 1,
      duration: CHECK_MS,
      useNativeDriver: USE_NATIVE_DRIVER,
    }).start();
  }, [check, done, reducedMotion]);

  return (
    <Pressable
      onPress={onPress}
      style={[
        styles.statusRow,
        compact && styles.statusRowCompact,
        divider && styles.statusRowDivider,
        active && styles.statusRowActive,
      ]}
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      accessibilityLabel={`${title}. ${done ? 'Read to the end.' : 'Not finished.'}`}
      accessibilityHint="Opens this document"
    >
      <View
        style={[styles.statusIcon, compact && styles.statusIconCompact, done && styles.statusIconDone]}
      >
        <Ionicons
          name={icon}
          size={compact ? 17 : 19}
          color={done ? authColors.emerald : authColors.muted}
        />
      </View>

      <View style={styles.statusText}>
        <Text style={styles.statusTitle} numberOfLines={1}>
          {title}
        </Text>
        {/* The state is spelled out, not only ticked — the tick's colour must
            never be the only thing carrying it. */}
        <Text style={styles.statusSubtitle} numberOfLines={1}>
          {done ? 'Read to the end' : isNext ? 'Read this next' : 'Not finished'}
        </Text>
      </View>

      {done ? (
        <Animated.View
          style={{
            opacity: check,
            transform: [
              { scale: check.interpolate({ inputRange: [0, 1], outputRange: [0.6, 1] }) },
            ],
          }}
        >
          <Ionicons name="checkmark-circle" size={24} color={authColors.emerald} />
        </Animated.View>
      ) : (
        <Ionicons name="ellipse-outline" size={24} color={authColors.line} />
      )}
    </Pressable>
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
  // Every value above the document is deliberately tight. This screen has one
  // job — let someone read two documents — and the intro competing with the
  // reader for height was the whole problem: the text got a third of the
  // screen while the chrome explaining it got the rest.
  header: {
    paddingTop: authSpacing.xs,
    gap: 2,
  },
  eyebrow: {
    ...authType.eyebrow,
    color: authColors.emerald,
  },
  title: {
    ...authType.title,
    color: authColors.ink,
    marginTop: 2,
  },
  titleCompact: {
    fontSize: 23,
    lineHeight: 27,
  },
  subtitle: {
    fontSize: 14,
    lineHeight: 19,
    color: authColors.muted,
  },
  statusCard: {
    marginTop: authSpacing.md - 2,
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
    gap: authSpacing.md - 2,
    // Still past the 44pt touch minimum, and identical for both rows so the
    // list reads as one block — but no taller than it has to be, because
    // every point here is a point the document does not get.
    minHeight: 48,
    paddingHorizontal: authSpacing.md + 2,
    paddingVertical: authSpacing.sm,
  },
  // Still a 44pt target — the floor, not a suggestion.
  statusRowCompact: {
    minHeight: 44,
    paddingVertical: 5,
  },
  statusRowDivider: {
    borderTopWidth: 1,
    borderTopColor: authColors.line,
  },
  statusRowActive: {
    backgroundColor: authColors.mint,
  },
  statusIcon: {
    width: 34,
    height: 34,
    borderRadius: authRadius.iconButton - 4,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: authColors.bg,
  },
  statusIconCompact: {
    width: 30,
    height: 30,
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
    fontSize: 12,
    lineHeight: 16,
    color: authColors.muted,
  },
  // flex:1 — the reader takes every point the fixed blocks above and below
  // do not, so tightening those is what makes it grow.
  docWrapper: {
    flex: 1,
    marginTop: authSpacing.md - 2,
  },
  docScroll: {
    flex: 1,
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
  guidance: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: authSpacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'center',
    justifyContent: 'center',
    gap: 4,
    paddingHorizontal: authSpacing.md,
    paddingVertical: 6,
    borderRadius: authRadius.chip,
    backgroundColor: authColors.mint,
  },
  guidanceText: {
    ...authType.note,
    fontWeight: '700',
    color: authColors.forest,
  },
  // Sits lower and less cramped than before: a wider gap above it separates
  // the controls from the reader, and a real inset underneath keeps Sign out
  // off the home indicator instead of hard against it.
  footer: {
    paddingTop: authSpacing.lg,
    paddingBottom: authSpacing.xl - 2,
    gap: authSpacing.md + 2,
  },
  footerCompact: {
    paddingTop: authSpacing.md,
    paddingBottom: authSpacing.md,
    gap: authSpacing.sm + 2,
  },
  helper: {
    ...authType.note,
    color: authColors.muted,
    textAlign: 'center',
  },
  error: {
    ...authType.note,
    color: authColors.danger,
    textAlign: 'center',
  },
  checkRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: authSpacing.sm,
    // Keeps the tap target honest even though the label is only two lines.
    minHeight: 44,
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
