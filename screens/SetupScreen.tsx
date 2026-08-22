import { useCallback, useEffect, useRef, useState } from 'react';
import {
  AccessibilityInfo,
  ActivityIndicator,
  Animated,
  Pressable,
  StyleSheet,
  Switch,
  Text,
  View,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { AuthButton } from '../components/AuthButton';
import { AuthScaffold } from '../components/AuthScaffold';
import { SetupChoiceCard } from '../components/SetupChoiceCard';
import { SetupRow } from '../components/SetupRow';
import { useAuth } from '../hooks/useAuth';
import { useReducedMotion } from '../hooks/useReducedMotion';
import { useSetupPermissions, type PermissionRow } from '../hooks/useSetupPermissions';
import { authColors, authRadius, authShadows, authSpacing, authType } from '../lib/authTheme';
import type { OnboardingStackNavigation } from '../lib/navigation';
import { setPendingLanding } from '../lib/setupLanding';
import { writeSetupRecord } from '../lib/setupStorage';
import { DEFAULT_LANDING, type LandingPreference } from '../lib/setupState';
import { USE_NATIVE_DRIVER } from '../lib/motion';

const ENTER_MS = 340;
const COMPLETE_PULSE_MS = 300;

type SetupScreenProps = {
  /** From the existing legal system — never re-derived here. */
  legalComplete: boolean;
  /** Called once completion has actually been written to storage. */
  onFinished: (landing: LandingPreference) => void;
};

/**
 * The final setup step, shown once between authentication and the app.
 *
 * It owns three things and delegates everything else: two OS permissions
 * (read through hooks/useSetupPermissions, never requested on render), the
 * legal review (which is the existing LegalGateScreen, pushed as a route —
 * this screen only reflects its result), and a landing preference.
 *
 * That last one is a *preference*, not a role. Choosing "Find work" changes
 * which screen opens next and nothing else — not identity, not authorisation,
 * not what any query may read. The repository's marketplace invariant is that
 * one account both hires and works, and this screen does not bend it.
 *
 * There is no back button because there is nothing behind this screen: it is
 * the root of its own stack, and a chevron here would be a dead control. The
 * escape is the same one the legal gate has always offered — sign out.
 */
export function SetupScreen({ legalComplete, onFinished }: SetupScreenProps) {
  const navigation = useNavigation<OnboardingStackNavigation>();
  const { user, logout } = useAuth();
  const permissions = useSetupPermissions();
  const reducedMotion = useReducedMotion();

  const [landing, setLanding] = useState<LandingPreference>(DEFAULT_LANDING);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  // --- motion -------------------------------------------------------------
  // One value drives the whole entrance; each block reads a different slice of
  // it. A single native-driven animation instead of five staggered ones, and
  // nothing is ever non-interactive while it runs.
  const enter = useRef(new Animated.Value(0)).current;
  const entered = useRef(false);

  useEffect(() => {
    if (reducedMotion === null || entered.current) return;
    entered.current = true;
    if (reducedMotion) {
      enter.setValue(1);
      return;
    }
    Animated.timing(enter, {
      toValue: 1,
      duration: ENTER_MS,
      useNativeDriver: USE_NATIVE_DRIVER,
    }).start();
  }, [enter, reducedMotion]);

  const stagger = (from: number, to: number) => ({
    opacity: enter.interpolate({ inputRange: [from, to], outputRange: [0, 1], extrapolate: 'clamp' }),
    transform: [
      {
        translateY: enter.interpolate({
          inputRange: [from, to],
          outputRange: [10, 0],
          extrapolate: 'clamp',
        }),
      },
    ],
  });

  // A single pulse when the legal row flips to complete. Never on mount: a
  // user who already accepted should not watch it animate on arrival.
  const pulse = useRef(new Animated.Value(0)).current;
  const wasLegalComplete = useRef(legalComplete);

  useEffect(() => {
    if (legalComplete === wasLegalComplete.current) return;
    wasLegalComplete.current = legalComplete;
    if (!legalComplete) return;

    AccessibilityInfo.announceForAccessibility(
      'Terms and Privacy complete. Finish setup is now available.'
    );

    if (reducedMotion) return;
    Animated.sequence([
      Animated.timing(pulse, {
        toValue: 1,
        duration: COMPLETE_PULSE_MS / 2,
        useNativeDriver: USE_NATIVE_DRIVER,
      }),
      Animated.timing(pulse, {
        toValue: 0,
        duration: COMPLETE_PULSE_MS / 2,
        useNativeDriver: USE_NATIVE_DRIVER,
      }),
    ]).start();
  }, [legalComplete, pulse, reducedMotion]);

  // Opacity on a mint underlay rather than an interpolated backgroundColor:
  // an animated colour stops being applied across the re-render that the
  // state change itself causes, so the pulse would simply never appear. See
  // the note in components/SetupChoiceCard.tsx.
  const pulseStyle = { opacity: pulse };

  // --- actions ------------------------------------------------------------
  const openLegal = useCallback(() => {
    // React Navigation ignores a second push to the same route while the first
    // is still transitioning, but the guard makes the intent explicit rather
    // than relying on that.
    if (navigation.isFocused()) navigation.navigate('LegalGate');
  }, [navigation]);

  async function handleFinish() {
    if (!legalComplete || saving || !user) return;

    setSaving(true);
    setError(null);

    const { error: writeError } = await writeSetupRecord(user.id, {
      completed: true,
      landing,
    });

    if (!mounted.current) return;

    if (writeError) {
      setSaving(false);
      // Nothing chosen is lost, and setup is emphatically not marked done.
      setError("We couldn't save your setup. Check your device storage and try again.");
      return;
    }

    // Only now — navigation follows persistence, never the other way round.
    // The handoff is parked before the swap because this screen is about to
    // unmount along with its whole navigator; MainTabs collects it on mount.
    setPendingLanding(landing);
    onFinished(landing);
  }

  const canFinish = legalComplete && !saving;

  return (
    <AuthScaffold title="Setup" titleVariant="large" backdrop="soft">
      <View style={styles.body}>
        <Animated.View style={stagger(0, 0.42)}>
          <Text style={styles.eyebrow}>FINAL SETUP</Text>
          <Text style={styles.title} maxFontSizeMultiplier={1.4}>
            Set up your experience
          </Text>
          <Text style={styles.subtitle}>These choices can be changed later.</Text>
        </Animated.View>

        <Animated.View style={[styles.card, stagger(0.14, 0.62)]}>
          <PermissionSetupRow
            icon="location-outline"
            title="Location"
            subtitle="Required for nearby jobs and workers"
            settingsHint="Enable this in device Settings"
            permission={permissions.location}
          />
          <PermissionSetupRow
            icon="notifications-outline"
            title="Notifications"
            subtitle="Messages, bids and arrival updates"
            settingsHint="Turn this on in device Settings"
            permission={permissions.notifications}
            divider
          />

          <View>
            <Animated.View
              style={[styles.pulseOverlay, pulseStyle]}
              pointerEvents="none"
            />
            <SetupRow
              icon={legalComplete ? 'shield-checkmark-outline' : 'document-text-outline'}
              title="Terms & Privacy"
              subtitle={
                legalComplete ? 'Terms and Privacy reviewed' : 'Review both documents to continue'
              }
              done={legalComplete}
              divider
              onPress={openLegal}
              accessibilityLabel={`Terms and Privacy. ${
                legalComplete ? 'Reviewed.' : 'Review both documents to continue.'
              }`}
              accessibilityHint="Opens the Terms of Service and Privacy Policy"
              control={
                legalComplete ? (
                  <Ionicons name="checkmark-circle" size={26} color={authColors.forest} />
                ) : (
                  <Ionicons name="chevron-forward" size={20} color={authColors.placeholder} />
                )
              }
            />
          </View>
        </Animated.View>

        <Animated.View style={stagger(0.3, 0.8)}>
          <Text style={styles.sectionTitle}>Start in</Text>
          <View style={styles.choices} accessibilityRole="radiogroup">
            <SetupChoiceCard
              icon="home-outline"
              title="Hire help"
              subtitle="Customer mode"
              selected={landing === 'hire'}
              onSelect={() => setLanding('hire')}
              reducedMotion={reducedMotion === true}
            />
            <SetupChoiceCard
              icon="briefcase-outline"
              title="Find work"
              subtitle="Worker mode"
              selected={landing === 'work'}
              onSelect={() => setLanding('work')}
              reducedMotion={reducedMotion === true}
            />
          </View>
        </Animated.View>

        <Animated.View style={[styles.actions, stagger(0.46, 1)]}>
          {/* A fixed slot, so the helper text and the error swap without ever
              moving the button under the user's thumb. */}
          <View style={styles.messageSlot}>
            {error ? (
              <Text style={styles.error} accessibilityLiveRegion="assertive">
                {error}
              </Text>
            ) : !legalComplete ? (
              <Text style={styles.helper}>Review Terms & Privacy to finish setup.</Text>
            ) : null}
          </View>

          <AuthButton
            title="Finish setup"
            weight="semibold"
            onPress={handleFinish}
            disabled={!canFinish}
            loading={saving}
            accessibilityHint={
              legalComplete ? undefined : 'Review Terms and Privacy to enable this'
            }
          />

          {/* The only way out of a mandatory step, and the same one the legal
              gate has always offered — without it a user who cannot finish
              setup would be trapped in it. */}
          <Pressable
            onPress={() => logout()}
            disabled={saving}
            hitSlop={8}
            style={styles.signOutRow}
            accessibilityRole="button"
          >
            <Text style={styles.signOut}>Sign out</Text>
          </Pressable>
        </Animated.View>
      </View>
    </AuthScaffold>
  );
}

/**
 * A permission row that stays useful in every state the OS can be in.
 *
 * The failure this replaces: once a permission was denied for good, the switch
 * was disabled and the row did nothing. The user was left holding a control
 * that could not be operated and was not told where the real one lives. That
 * is a dead control, and it is worse than no control.
 *
 * Now there is one action per row and it always leads somewhere. While the OS
 * will still prompt, tapping asks. Once it won't — denied for good, or granted,
 * which the app equally cannot undo — tapping opens Settings, which is the
 * only place the answer can actually change. The subtitle says which of those
 * is about to happen, so nothing has to be guessed from the switch alone.
 *
 * Both the row and the switch run the same action, so there is no combination
 * of taps that does nothing.
 */
function PermissionSetupRow({
  icon,
  title,
  subtitle,
  settingsHint,
  permission,
  divider,
}: {
  icon: React.ComponentProps<typeof SetupRow>['icon'];
  title: string;
  subtitle: string;
  /** Shown instead of the subtitle once Settings is the only way through. */
  settingsHint: string;
  permission: PermissionRow;
  divider?: boolean;
}) {
  const { state, requesting, act, opensSettings } = permission;
  const granted = state === 'granted';
  const interactive = state !== 'unknown' && state !== 'unavailable';

  // Replaced, not appended: the old version tacked the hint onto the end with
  // a separator, which pushed every affected row onto a cramped second line.
  const detail =
    state === 'blocked'
      ? settingsHint
      : state === 'unavailable'
        ? 'Not available on this device'
        : subtitle;

  return (
    <SetupRow
      icon={icon}
      title={title}
      subtitle={detail}
      done={granted}
      divider={divider}
      onPress={interactive ? act : undefined}
      accessibilityLabel={`${title}. ${granted ? 'Allowed.' : 'Not allowed.'} ${detail}`}
      accessibilityHint={
        !interactive
          ? undefined
          : opensSettings
            ? 'Opens your device settings'
            : `Asks for ${title.toLowerCase()} permission`
      }
      control={
        state === 'unknown' ? (
          <ActivityIndicator color={authColors.placeholder} />
        ) : state === 'unavailable' ? (
          <Text style={styles.controlNote}>—</Text>
        ) : (
          <Switch
            value={granted}
            // Never disabled while the row is interactive: flicking it always
            // does the same useful thing the row does. It snaps back when the
            // real answer did not change, which is the honest outcome.
            disabled={requesting}
            onValueChange={act}
            trackColor={{ false: authColors.line, true: authColors.forest }}
            thumbColor={authColors.surface}
            ios_backgroundColor={authColors.line}
            accessibilityLabel={`${title} permission`}
          />
        )
      }
    />
  );
}

const styles = StyleSheet.create({
  body: {
    flexGrow: 1,
    paddingTop: authSpacing.sm,
    paddingBottom: authSpacing.lg,
  },
  eyebrow: {
    ...authType.eyebrow,
    color: authColors.emerald,
    marginTop: authSpacing.lg,
  },
  title: {
    ...authType.title,
    color: authColors.ink,
    marginTop: authSpacing.sm,
  },
  subtitle: {
    ...authType.body,
    color: authColors.muted,
    marginTop: authSpacing.sm,
  },
  card: {
    marginTop: authSpacing.xl,
    borderRadius: authRadius.card,
    borderWidth: 1,
    // Nearly invisible: the elevation carries the card, not the outline.
    borderColor: authColors.line,
    backgroundColor: authColors.surface,
    overflow: 'hidden',
    ...authShadows.card,
  },
  sectionTitle: {
    fontSize: 19,
    fontWeight: '700',
    color: authColors.ink,
    marginTop: authSpacing.xl,
  },
  choices: {
    flexDirection: 'row',
    gap: authSpacing.md,
    marginTop: authSpacing.md,
  },
  // marginTop:'auto' pulls the CTA off the bottom edge on a tall screen —
  // the reference sits it lower than it should, leaving it against the home
  // indicator.
  actions: {
    marginTop: 'auto',
    paddingTop: authSpacing.lg,
  },
  // Sits behind the legal row and flashes once when it completes. Rendered
  // first so the row paints over it, and untouchable either way.
  pulseOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: authColors.mint,
  },
  messageSlot: {
    minHeight: 34,
    justifyContent: 'center',
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
  signOutRow: {
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: authSpacing.xs,
  },
  signOut: {
    fontSize: 14,
    fontWeight: '600',
    color: authColors.muted,
  },
  controlNote: {
    ...authType.note,
    color: authColors.placeholder,
  },
});
