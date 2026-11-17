import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Linking,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Card } from '../components/Card';
import { ScreenHeader } from '../components/ScreenHeader';
import { SegmentedControl } from '../components/SegmentedControl';
import { Toggle, useScrollClearance } from '../ui/primitives';
import { useAuth } from '../hooks/useAuth';
import { useProfile } from '../hooks/useProfile';
import { alertAsync } from '../lib/dialog';
import { askOpenSettings } from '../lib/permissionPrompt';
import { userMessage } from '../lib/errorMessage';
import { resolveCurrentPlace } from '../lib/geolocation';
import { goBackOrHome } from '../lib/navigationRef';
import {
  DEFAULT_PREFS,
  fetchNotificationPrefs,
  NOTIFICATION_TOGGLES,
  RADIUS_OPTIONS,
  updateNotificationPrefs,
  type NotificationPrefs,
  type NotificationToggleKey,
} from '../lib/notificationPrefs';
import { deviceTimeZone, QUIET_HOURS_HINT, QUIET_HOURS_LABEL } from '../lib/quietHours';
import {
  getProjectId,
  isExpoGo,
  registerPushToken,
  type PushRegistration,
} from '../lib/pushNotifications';
import { skillCategoryLabel } from '../lib/skillCategories';
import { SPINNER_STATE, ScreenStateView } from '../ui/templates/ScreenStates';
import {
  EYEBROW_TYPE,
  radius,
  spacing,
  textScale,
  themedStyles,
  useThemeColors,
  type ColorPalette,
  screenGround,
  textLine,
  touchSlop,
} from '../lib/theme';

/**
 * Notification preferences.
 *
 * Every switch here is also enforced in the database (should_notify(),
 * phase20) — this screen is the way to set them, not the thing that applies
 * them. Turning one off stops the send server-side rather than hiding an
 * already-delivered notification.
 */
/** Master 39 gives every preference row a glyph. Presentation only, keyed
 *  off the toggle key the row already carries. */
const TOGGLE_ICONS: Partial<Record<NotificationToggleKey, keyof typeof Ionicons.glyphMap>> = {
  messages: 'chatbubble-outline',
  bids: 'pricetag-outline',
  job_updates: 'briefcase-outline',
  hire_requests: 'person-add-outline',
  nearby_jobs: 'location-outline',
};

export function NotificationSettingsScreen() {
  const { palette: colors, isDark } = useThemeColors();
  const styles = stylesFor(colors);
  // emerald(3): the floating pill's real footprint.
  const navClearance = useScrollClearance();
  const { user } = useAuth();
  const { profile } = useProfile();

  const [prefs, setPrefs] = useState<NotificationPrefs | null>(null);
  const [loading, setLoading] = useState(true);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [pushState, setPushState] = useState<PushRegistration | null>(null);
  // Inline instead of a one-shot alert: a failed load used to alert once and
  // then render DEFAULT_PREFS as if they were the user's saved settings, with
  // no way to retry. The banner + Try again keeps the failure visible and
  // recoverable (state-coverage audit, 2026-08-10).
  const [loadError, setLoadError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!user) return;
    setLoadError(null);
    const { data, error } = await fetchNotificationPrefs(user.id);
    if (error) {
      setLoadError(userMessage(error));
    }
    setPrefs(data);
    setLoading(false);
    // Idea 7: quiet hours follow the phone's clock — a changed zone (travel, a new phone) is sent
    // quietly, so midnight stays the person's own.
    const zone = deviceTimeZone();
    if (data?.quiet_hours && zone && data.quiet_tz !== zone) {
      void updateNotificationPrefs(user.id, { quiet_tz: zone }).then(({ data: synced }) => {
        if (synced) setPrefs(synced);
      });
    }
  }, [user?.id]);

  useEffect(() => {
    load();
  }, [load]);

  // Report the device's actual delivery capability without prompting: this
  // screen should explain why nothing is arriving, not spend the one-shot
  // iOS permission dialog just by being opened.
  const checkPush = useCallback(() => {
    registerPushToken({ interactive: false }).then(setPushState);
  }, []);
  useEffect(checkPush, [checkPush]);

  async function persist(patch: Partial<NotificationPrefs>, key: string) {
    if (!user || !prefs) return;
    const previous = prefs;
    // Optimistic: a switch that lags behind the finger feels broken.
    setPrefs({ ...prefs, ...patch });
    setBusyKey(key);
    const { data, error } = await updateNotificationPrefs(user.id, patch);
    setBusyKey(null);

    if (error) {
      setPrefs(previous);
      await alertAsync('Could not save', userMessage(error));
      return;
    }
    if (data) setPrefs(data);
  }

  async function toggle(key: NotificationToggleKey, value: boolean) {
    if (!prefs) return;

    // "New jobs nearby" is the one switch that needs something besides itself:
    // there is no radius to measure without a point to measure from.
    if (key === 'nearby_jobs' && value) {
      if (prefs.home_lat == null || prefs.home_lng == null) {
        const ok = await captureLocation();
        if (!ok) return;
        return;
      }
    }

    await persist({ [key]: value } as Partial<NotificationPrefs>, key);
  }

  /** Grabs a coarse current position to anchor the nearby-jobs radius. */
  async function captureLocation(): Promise<boolean> {
    setBusyKey('nearby_jobs');
    const result = await resolveCurrentPlace();
    setBusyKey(null);

    if (!result.ok) {
      // B11: a denied permission offers Settings; anything else says what failed.
      if (result.reason === 'denied') {
        await askOpenSettings('location', 'Location is off for Brazos. Turn it on in Settings to hear about jobs near you.');
      } else {
        await alertAsync('Location needed', result.message);
      }
      return false;
    }

    await persist(
      {
        nearby_jobs: true,
        home_lat: result.place.lat,
        home_lng: result.place.lng,
      },
      'nearby_jobs'
    );
    return true;
  }

  const selectedCategories = profile?.categories ?? [];

  // One clear sentence about whether this device can actually receive a push.
  function deliveryNotice(): { tone: 'warn' | 'info' | 'quiet'; text: string; settings?: boolean; retry?: boolean } | null {
    if (!pushState || pushState.ok) return null;
    if (pushState.reason === 'unsupported' && isExpoGo()) {
      return {
        tone: 'warn',
        text:
          'This is Expo Go, which cannot receive push notifications. Your choices here are saved, but nothing will arrive until you run a development build.',
      };
    }
    if (pushState.reason === 'no_project_id' || !getProjectId()) {
      return {
        tone: 'warn',
        text:
          'Notifications aren’t available in this version. Update Brazos to turn them on.',
      };
    }
    if (pushState.reason === 'unsupported') {
      return { tone: 'info', text: pushState.message };
    }
    if (pushState.reason === 'denied') {
      return {
        // A2-M5 A10: switched off on the phone is the person's own choice, a notice and not a danger.
        tone: 'quiet',
        text:
          'Notifications are turned off for Brazos on this device. Turn them back on in your device Settings to start receiving them.',
        // B11: the switch is one tap away.
        settings: true,
      };
    }
    // B7 review: the 'error' branch's message carries the device's or the
    // server's own text ("Could not get a push token: …"); it stays in the
    // result for diagnostics and the person reads a plain line with a retry.
    return {
      tone: 'warn',
      text: 'Brazos couldn’t set up notifications on this phone. Check your connection and try again.',
      retry: true,
    };
  }

  const notice = deliveryNotice();
  // Plain row icons, as on the Profile hub: the mint in dark, the forest mark in light.
  const iconColour = isDark ? colors.emerald : colors.mark;

  return (
    <SafeAreaView style={[styles.safe, screenGround(colors, isDark)]} edges={['top']}>
      <ScreenHeader title="Notification Settings" onBack={goBackOrHome} />

      {loading ? (
        <ScreenStateView state={SPINNER_STATE} />
      ) : (
        <ScrollView contentContainerStyle={[styles.content, { paddingBottom: navClearance }]}>
          {loadError && (
            <View style={[styles.notice, styles.noticeWarn]}>
              <Ionicons name="alert-circle-outline" size={18} color={colors.danger} />
              <Text style={styles.noticeText}>
                {loadError} Showing defaults until it loads.
              </Text>
              <Pressable onPress={load} hitSlop={touchSlop(textLine(styles.noticeRetry))} accessibilityRole="button">
                <Text style={styles.noticeRetry}>Try again</Text>
              </Pressable>
            </View>
          )}
          {notice && notice.tone === 'quiet' ? (
            // A2-M5 A10: the app's quiet notice, the form of the job page's "booked time has passed"
            // card (a lit card on the mint, the muted line beside its mark); the words and the way to
            // Settings are unchanged.
            <Card style={[styles.quietNotice, isDark && styles.quietNoticeDark]}>
              <Ionicons name="information-circle-outline" size={20} color={colors.textMuted} />
              <Text style={styles.quietNoticeText}>{notice.text}</Text>
              {notice.settings ? (
                <Pressable onPress={() => void Linking.openSettings()} hitSlop={touchSlop(textLine(styles.noticeRetry))} accessibilityRole="button">
                  <Text style={styles.noticeRetry}>Open Settings</Text>
                </Pressable>
              ) : null}
            </Card>
          ) : notice ? (
            <View
              style={[
                styles.notice,
                notice.tone === 'warn' ? styles.noticeWarn : styles.noticeInfo,
              ]}
            >
              <Ionicons
                name="information-circle-outline"
                size={18}
                color={notice.tone === 'warn' ? colors.danger : colors.textMuted}
              />
              <Text style={styles.noticeText}>{notice.text}</Text>
              {notice.settings ? (
                <Pressable onPress={() => void Linking.openSettings()} hitSlop={touchSlop(textLine(styles.noticeRetry))} accessibilityRole="button">
                  <Text style={styles.noticeRetry}>Open Settings</Text>
                </Pressable>
              ) : notice.retry ? (
                <Pressable onPress={checkPush} hitSlop={touchSlop(textLine(styles.noticeRetry))} accessibilityRole="button">
                  <Text style={styles.noticeRetry}>Try again</Text>
                </Pressable>
              ) : null}
            </View>
          ) : null}

          <View style={styles.section}>
          <Text accessibilityRole="header" style={styles.sectionLabel}>Alerts</Text>
          <Card>
            {NOTIFICATION_TOGGLES.map((item, index) => {
              const value = prefs
                ? (prefs[item.key] as boolean)
                : (DEFAULT_PREFS[item.key] as boolean);
              return (
                <View
                  key={item.key}
                  style={[styles.row, index > 0 && styles.rowDivider]}
                >
                  {/* Master 39 leads each preference with its own glyph. The icon is
                      presentation, keyed off the same toggle key the row already carries. */}
                  <Ionicons
                    name={TOGGLE_ICONS[item.key] ?? 'notifications-outline'}
                    size={22}
                    color={iconColour}
                  />
                  <View style={styles.rowText}>
                    <Text style={styles.rowLabel}>{item.label}</Text>
                    <Text style={styles.rowHint}>{item.hint}</Text>
                  </View>
                  {busyKey === item.key ? (
                    <ActivityIndicator color={colors.primary} />
                  ) : (
                    <Toggle
                      value={value}
                      onValueChange={(next) => toggle(item.key, next)}
                      accessibilityLabel={item.label}
                    />
                  )}
                </View>
              );
            })}
          </Card>
          </View>

          {/* 2026-09-30 (idea 7): QUIET HOURS — midnight to 6 am, off until switched on; only the
              nearby alerts wait, so it sits with them. The phone's zone goes with the switch. */}
          {prefs?.nearby_jobs && (
            <View style={styles.section}>
            <Text accessibilityRole="header" style={styles.sectionLabel}>Nearby Jobs</Text>
            <Card>
              <View style={styles.row}>
                <Ionicons name="moon-outline" size={22} color={iconColour} />
                <View style={styles.rowText}>
                  <Text style={styles.rowLabel}>{QUIET_HOURS_LABEL}</Text>
                  <Text style={styles.rowHint}>{QUIET_HOURS_HINT}</Text>
                </View>
                {busyKey === 'quiet_hours' ? (
                  <ActivityIndicator color={colors.primary} />
                ) : (
                  <Toggle
                    value={prefs.quiet_hours}
                    onValueChange={(next) =>
                      persist(next ? { quiet_hours: true, quiet_tz: deviceTimeZone() } : { quiet_hours: false }, 'quiet_hours')
                    }
                    accessibilityLabel={QUIET_HOURS_LABEL}
                  />
                )}
              </View>
            </Card>
            </View>
          )}

          {prefs?.nearby_jobs && (
            <Card>
              {/* Master 39 sets typographic quotes here, as the rest of the
                  app's copy already does with its apostrophes. */}
              <Text accessibilityRole="header" style={styles.sectionTitle}>How far is “nearby”?</Text>
              <View style={styles.radiusWrap}>
                <SegmentedControl
                  options={RADIUS_OPTIONS.map((miles) => ({
                    label: `${miles} mi`,
                    value: String(miles),
                  }))}
                  value={String(prefs.nearby_radius_miles)}
                  onChange={(next) =>
                    persist({ nearby_radius_miles: Number(next) }, 'nearby_radius_miles')
                  }
                />
              </View>

              <Text style={styles.sectionNote}>
                Measured from the location you last set here
                {prefs.home_lat != null && prefs.home_lng != null
                  ? ''
                  : ' (not set yet)'}
                .
              </Text>
              <Pressable onPress={captureLocation} hitSlop={touchSlop(textLine(styles.link))}>
                <Text style={styles.link}>Update my location</Text>
              </Pressable>

              <View style={styles.categoryBlock}>
                <Text accessibilityRole="header" style={styles.sectionTitle}>Categories</Text>
                {selectedCategories.length > 0 ? (
                  <Text style={styles.sectionNote}>
                    You'll only be told about:{' '}
                    {selectedCategories.map(skillCategoryLabel).join(', ')}. Change
                    these under Job categories on your profile.
                  </Text>
                ) : (
                  <Text style={styles.sectionNote}>
                    You haven't picked any job categories, so this covers every
                    kind of job. Pick some on your profile to narrow it down.
                  </Text>
                )}
              </View>
            </Card>
          )}

          <Text style={styles.footnote}>
            Muted conversations and blocked users never send notifications,
            whatever these switches say.
          </Text>
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const stylesFor = themedStyles((colors: ColorPalette) =>
  StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: colors.background,
  },
  content: {
    padding: spacing.lg,
    gap: spacing.lg,
  },
  notice: {
    flexDirection: 'row',
    gap: spacing.sm,
    padding: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
  },
  noticeWarn: {
    backgroundColor: colors.dangerBg,
    borderColor: colors.danger,
  },
  noticeInfo: {
    backgroundColor: colors.neutralBg,
    borderColor: colors.border,
  },
  noticeText: {
    flex: 1,
    ...textScale.label,
    fontWeight: '400',
    color: colors.text,
  },
  noticeRetry: {
    ...textScale.label,
    fontWeight: '700',
    color: colors.primary,
  },
  // A2-M5 A10: the quiet notice (ClientJobDetailScreen's noticeCard: the mint, its rim, the xl corner).
  quietNotice: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    borderRadius: radius.xl,
    borderColor: colors.mint2,
    backgroundColor: colors.mint,
  },
  quietNoticeDark: { borderColor: colors.border },
  quietNoticeText: {
    flex: 1,
    ...textScale.body,
    color: colors.textMuted,
  },
  section: { gap: spacing.sm },
  sectionLabel: {
    ...EYEBROW_TYPE,
    color: colors.eyebrow,
    marginHorizontal: 2,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.md,
  },
  rowDivider: {
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  rowText: {
    flex: 1,
    gap: 2,
  },
  rowLabel: {
    ...textScale.control,
    color: colors.text,
  },
  rowHint: {
    ...textScale.footnote,
    fontWeight: '400',
    color: colors.textMuted,
  },
  sectionTitle: {
    ...textScale.title,
    color: colors.text,
  },
  sectionNote: {
    ...textScale.footnote,
    fontWeight: '400',
    color: colors.textMuted,
    marginTop: spacing.xs,
  },
  radiusWrap: {
    marginTop: spacing.md,
  },
  link: {
    ...textScale.body,
    fontWeight: '700',
    color: colors.emerald,
    marginTop: spacing.sm,
  },
  categoryBlock: {
    marginTop: spacing.lg,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingTop: spacing.md,
  },
  footnote: {
    ...textScale.footnote,
    fontWeight: '400',
    color: colors.textSubtle,
    textAlign: 'center',
  },
  }),
);
