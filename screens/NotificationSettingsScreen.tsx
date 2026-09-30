import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
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
import {
  fonts,
  radius,
  spacing,
  themedStyles,
  useThemeColors,
  type ColorPalette,
  screenGround,
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
  useEffect(() => {
    registerPushToken({ interactive: false }).then(setPushState);
  }, []);

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
      await alertAsync('Location needed', result.message);
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
  function deliveryNotice(): { tone: 'warn' | 'info'; text: string } | null {
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
          'This build is not linked to an EAS project yet, so no push token can be issued. Run `eas init`, then rebuild.',
      };
    }
    if (pushState.reason === 'unsupported') {
      return { tone: 'info', text: pushState.message };
    }
    if (pushState.reason === 'denied') {
      return {
        tone: 'warn',
        text:
          'Notifications are turned off for Brazos on this device. Turn them back on in your device Settings to start receiving them.',
      };
    }
    return { tone: 'warn', text: pushState.message };
  }

  const notice = deliveryNotice();

  return (
    <SafeAreaView style={[styles.safe, screenGround(colors, isDark)]} edges={['top']}>
      <ScreenHeader title="Notification Settings" onBack={goBackOrHome} />

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      ) : (
        <ScrollView contentContainerStyle={[styles.content, { paddingBottom: navClearance }]}>
          {loadError && (
            <View style={[styles.notice, styles.noticeWarn]}>
              <Ionicons name="alert-circle-outline" size={18} color={colors.danger} />
              <Text style={styles.noticeText}>
                {loadError} Showing defaults until it loads.
              </Text>
              <Pressable onPress={load} hitSlop={8} accessibilityRole="button">
                <Text style={styles.noticeRetry}>Try again</Text>
              </Pressable>
            </View>
          )}
          {notice && (
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
            </View>
          )}

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
                  {/* Master 39 leads each preference with its own ringed
                      glyph. The icon is presentation, keyed off the same
                      toggle key the row already carries. */}
                  <View style={[styles.rowGlyph, isDark && styles.rowGlyphDark]}>
                    <Ionicons
                      name={TOGGLE_ICONS[item.key] ?? 'notifications-outline'}
                      size={18}
                      color={isDark ? colors.gold : colors.primary}
                    />
                  </View>
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

          {/* 2026-09-30 (idea 7): QUIET HOURS — midnight to 6 am, off until switched on; only the
              nearby alerts wait, so it sits with them. The phone's zone goes with the switch. */}
          {prefs?.nearby_jobs && (
            <Card>
              <View style={styles.row}>
                <View style={[styles.rowGlyph, isDark && styles.rowGlyphDark]}>
                  <Ionicons name="moon-outline" size={18} color={isDark ? colors.gold : colors.primary} />
                </View>
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
          )}

          {prefs?.nearby_jobs && (
            <Card>
              {/* Master 39 sets typographic quotes here, as the rest of the
                  app's copy already does with its apostrophes. */}
              <Text style={styles.sectionTitle}>How far is “nearby”?</Text>
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
              <Pressable onPress={captureLocation} hitSlop={8}>
                <Text style={styles.link}>Update my location</Text>
              </Pressable>

              <View style={styles.categoryBlock}>
                <Text style={styles.sectionTitle}>Categories</Text>
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
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
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
    fontSize: 13,
    lineHeight: 18,
    color: colors.text,
  },
  noticeRetry: {
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '700',
    color: colors.primary,
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
  // Master 39 rings every preference glyph in gold.
  rowGlyph: {
    width: 40,
    height: 40,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.border,
  },
  rowGlyphDark: {
    borderColor: colors.gold,
  },
  rowLabel: {
    fontFamily: fonts.display,
    fontSize: 18,
    fontWeight: '700',
    color: colors.text,
  },
  rowHint: {
    fontSize: 12,
    lineHeight: 17,
    color: colors.textMuted,
  },
  sectionTitle: {
    fontSize: 20,
    fontFamily: fonts.display,
    fontWeight: '700',
    color: colors.text,
  },
  sectionNote: {
    fontSize: 12,
    lineHeight: 17,
    color: colors.textMuted,
    marginTop: spacing.xs,
  },
  radiusWrap: {
    marginTop: spacing.md,
  },
  link: {
    fontSize: 14,
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
    fontSize: 12,
    lineHeight: 17,
    color: colors.textSubtle,
    textAlign: 'center',
  },
  }),
);
