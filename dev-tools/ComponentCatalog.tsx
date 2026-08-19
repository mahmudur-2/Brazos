import { useState, type ReactNode } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import {
  Avatar,
  BOTTOM_NAV_TABS,
  BottomNavPreview,
  Button,
  CUSTOMER_BAR_TABS,
  WORKER_BAR_TABS,
  Card,
  Chip,
  EmptyState,
  Input,
  JobCard,
  ListRow,
  MediaGrid,
  MediaUploader,
  MoneyText,
  RatingStars,
  SearchBar,
  SegmentedTabs,
  Sheet,
  Skeleton,
  StatusPill,
  StepHeader,
  TopBar,
  type JobStatus,
  type OfferStatus,
  type PaymentStatus,
} from '../ui/primitives';
import { ScreenStateView, type ScreenState } from '../ui/templates';
import { ModePreview } from '../modes';
import type { OpenJob } from '../lib/jobs';
import { colors, layout, radius, spacing, type as typeScale } from '../ui/tokens';

/**
 * The dev-only component catalog (BRAZOS_MASTER_PLAN.md §I).
 *
 * "A hidden dev-only route rendering every primitive in every state. Any edit
 * to a shared component requires eyeballing the catalog plus one
 * representative real screen per template. This is the regression canary for
 * 'fixed one screen, broke five.'"
 *
 * It is registered in App.tsx behind `__DEV__` and reached from a `__DEV__`-only
 * row on the Profile tab, so it exists on a device during development and is
 * absent from a production build's navigation entirely — the route is never
 * registered, not merely hidden.
 *
 * Rendering real primitives, not copies: everything below is imported from
 * ui/primitives, so if a primitive regresses, this screen shows it.
 */

const JOB_STATUSES: JobStatus[] = [
  'draft',
  'published',
  'pending_payment',
  'confirmed',
  'en_route',
  'arrived',
  'in_progress',
  'completion_submitted',
  'approved',
  'completed',
  'expired',
  'cancelled_by_customer',
  'cancelled_by_worker',
  'disputed',
];

const OFFER_STATUSES: OfferStatus[] = [
  'pending',
  'accepted',
  'declined',
  'withdrawn',
  'expired',
  'superseded',
];

const PAYMENT_STATUSES: PaymentStatus[] = [
  'unfunded',
  'authorized',
  'held',
  'released',
  'paid_out',
  'failed',
  'voided',
  'refunded',
  'partially_refunded',
];

/**
 * Catalog fixtures for JobCard. Obviously-fake copy and a fixed timestamp, so
 * nobody can mistake this for marketplace data — CLAUDE.md forbids inventing
 * marketplace data, and a catalog row that reads like a real listing is exactly
 * how a screenshot of it ends up somewhere it shouldn't.
 */
const CATALOG_JOB: OpenJob = {
  id: 'catalog-job-1',
  client_id: 'catalog-client',
  title: 'Example job — replace a kitchen faucet',
  description: 'Catalog fixture. Not a real posting.',
  category: 'handyman',
  location: 'Example neighborhood',
  budget_cents: 18000,
  budget_min_cents: 15000,
  budget_max_cents: 18000,
  scheduled_date: null,
  arrival_start_hour: null,
  arrival_end_hour: null,
  status: 'open',
  created_at: new Date('2026-08-08T12:00:00Z').toISOString(),
  photos: [],
  videos: [],
};

const CATALOG_JOB_NO_BUDGET: OpenJob = {
  ...CATALOG_JOB,
  id: 'catalog-job-2',
  title:
    'Example job with a title long enough to wrap onto a second line and prove the card still lines up',
  category: 'cleaning',
  location: null,
  budget_cents: null,
};

const SCREEN_STATES: { label: string; state: Exclude<ScreenState, { kind: 'ready' }> }[] = [
  { label: 'loading (skeleton)', state: { kind: 'loading', rows: 2 } },
  { label: 'loading (spinner)', state: { kind: 'loading', variant: 'spinner' } },
  {
    label: 'empty',
    state: { kind: 'empty', body: 'Nothing matches these filters yet.', actionLabel: 'Clear' },
  },
  { label: 'error + retry', state: { kind: 'error', onRetry: () => {} } },
  { label: 'offline', state: { kind: 'offline', onRetry: () => {} } },
  { label: 'permission denied', state: { kind: 'permissionDenied', onAction: () => {} } },
];

export function ComponentCatalog() {
  const navigation = useNavigation();
  const [search, setSearch] = useState('');
  const [tab, setTab] = useState('all');
  const [text, setText] = useState('');
  const [rating, setRating] = useState(4);
  const [step, setStep] = useState(1);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [stateIndex, setStateIndex] = useState(0);
  const [uploaderPhotos, setUploaderPhotos] = useState<string[]>([]);

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <TopBar
        title="Component catalog"
        subtitle="Dev only — every primitive, every state"
        onBack={navigation.canGoBack() ? () => navigation.goBack() : undefined}
      />

      <ScrollView
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <Section title="Button">
          <Button title="Primary" onPress={() => {}} />
          <Button title="Secondary" variant="secondary" onPress={() => {}} />
          <Button title="Destructive" variant="destructive" onPress={() => {}} />
          <Button title="Loading" loading onPress={() => {}} />
          <Button title="Disabled" disabled onPress={() => {}} />
          <Button title="Small" size="sm" onPress={() => {}} />
          <Button title="With icon" icon="arrow-forward" onPress={() => {}} />
        </Section>

        <Section title="Input">
          <Input label="Text" value={text} onChangeText={setText} placeholder="Type here" />
          <Input
            label="With hint"
            value={text}
            onChangeText={setText}
            hint={`${text.length}/50`}
            placeholder="Counted"
          />
          <Input
            label="With error"
            value={text}
            onChangeText={setText}
            error="This field is required"
          />
          <Input
            label="Textarea"
            value={text}
            onChangeText={setText}
            multiline
            style={styles.textarea}
            placeholder="Multiple lines"
          />
        </Section>

        <Section title="SearchBar">
          <SearchBar value={search} onChangeText={setSearch} placeholder="Search jobs" />
          <SearchBar value="" onChangeText={() => {}} placeholder="As a button" onPress={() => {}} />
        </Section>

        <Section title="Card">
          <Card>
            <Text style={styles.body}>A plain card.</Text>
          </Card>
          <Card onPress={() => {}}>
            <Text style={styles.body}>A pressable card.</Text>
          </Card>
        </Section>

        <Section title="Chip">
          <View style={styles.row}>
            <Chip label="Default" onPress={() => {}} />
            <Chip label="Selected" selected onPress={() => {}} />
            <Chip label="Service" variant="service" icon="hammer" onPress={() => {}} />
            <Chip label="Gold" variant="outlineGold" onPress={() => {}} />
            <Chip label="Soft tag" variant="soft" size="sm" />
            <Chip label="Filter" variant="filter" onPress={() => {}} />
            <Chip label="Filter on" variant="filter" selected onPress={() => {}} />
          </View>
        </Section>

        <Section title="SegmentedTabs">
          <SegmentedTabs
            options={[
              { label: 'All', value: 'all' },
              { label: 'Open', value: 'open' },
              { label: 'Done', value: 'done' },
            ]}
            value={tab}
            onChange={setTab}
          />
        </Section>

        <Section title="StatusPill — job">
          <View style={styles.row}>
            {JOB_STATUSES.map((s) => (
              <StatusPill key={s} kind="job" status={s} />
            ))}
          </View>
        </Section>

        <Section title="StatusPill — offer">
          <View style={styles.row}>
            {OFFER_STATUSES.map((s) => (
              <StatusPill key={s} kind="offer" status={s} />
            ))}
          </View>
        </Section>

        <Section title="StatusPill — payment">
          <View style={styles.column}>
            {PAYMENT_STATUSES.map((s) => (
              <StatusPill key={s} kind="payment" status={s} />
            ))}
          </View>
        </Section>

        <Section title="MoneyText">
          {/* The whole payment ladder, so a wrong label is visible here before
              it ships. "Paid out" must be the only one saying paid. */}
          <MoneyText cents={12500} />
          <MoneyText cents={12500} size="lg" />
          <MoneyText cents={null} />
          {PAYMENT_STATUSES.map((s) => (
            <MoneyText key={s} cents={12500} state={s} />
          ))}
        </Section>

        <Section title="ListRow">
          <Card style={styles.flush}>
            <ListRow title="Plain row" />
            <ListRow title="With subtitle" subtitle="Secondary line of context" />
            <ListRow title="Navigates" icon="notifications-outline" showChevron onPress={() => {}} />
            <ListRow
              title="With trailing"
              icon="star-outline"
              trailing={<Text style={styles.muted}>4.8</Text>}
            />
            <ListRow
              title="A very long title that has to truncate rather than push the trailing control off screen"
              icon="alert-circle-outline"
              showChevron
              onPress={() => {}}
            />
            <ListRow title="Destructive" icon="log-out-outline" tone="danger" onPress={() => {}} />
          </Card>
        </Section>

        <Section title="Avatar">
          <View style={styles.row}>
            <Avatar name="Mah R." />
            <Avatar name="Afnan M." size={56} />
          </View>
        </Section>

        <Section title="RatingStars">
          <RatingStars value={rating} onChange={setRating} />
        </Section>

        <Section title="Skeleton">
          <Skeleton style={styles.skeletonLine} />
          <Skeleton style={styles.skeletonBlock} />
        </Section>

        <Section title="StepHeader">
          <StepHeader step={step} steps={['Describe', 'Media', 'Location', 'Review']} />
          <View style={styles.row}>
            <Button title="Prev" size="sm" variant="secondary" onPress={() => setStep((s) => Math.max(0, s - 1))} />
            <Button title="Next" size="sm" variant="secondary" onPress={() => setStep((s) => Math.min(3, s + 1))} />
          </View>
        </Section>

        <Section title="MediaGrid">
          <MediaGrid
            items={[
              { uri: 'https://picsum.photos/seed/a/300' },
              { uri: 'https://picsum.photos/seed/b/300', kind: 'video' },
              { uri: 'https://picsum.photos/seed/c/300' },
              { uri: 'https://picsum.photos/seed/d/300' },
            ]}
            onPressItem={() => {}}
            onRemoveItem={() => {}}
          />
          <MediaGrid items={[]} emptyLabel="No photos added yet" />
        </Section>

        <Section title="MediaUploader">
          <MediaUploader
            kind="photo"
            label="Photos"
            maxItems={5}
            items={uploaderPhotos}
            onItemsChange={setUploaderPhotos}
            onUpload={async (asset) => ({ url: asset.uri, error: null })}
          />
        </Section>

        <Section title="Sheet">
          <Button title="Open sheet" variant="secondary" onPress={() => setSheetOpen(true)} />
        </Section>

        <Section title="EmptyState">
          <View style={styles.stateBox}>
            <EmptyState
              icon="briefcase-outline"
              title="No jobs yet"
              body="Jobs you post will show up here."
              actionLabel="Post a job"
              onAction={() => {}}
            />
          </View>
        </Section>

        {/* --- Phase 2 primitives ------------------------------------------ */}

        <Section title="BottomNav — tab states">
          <Text style={styles.note}>
            The real bar is drawn by React Navigation from bottomNavScreenOptions(); this preview
            uses the same item renderer and constants, so a change to one shows here. Prestige 0d
            (decision 4): one floating pill, the same five tabs in both modes, emerald active
            with a soft glow in dark (the customer tree keeps Discover as a hidden route).
          </Text>
          {WORKER_BAR_TABS.map((key) => {
            const tab = BOTTOM_NAV_TABS.find((t) => t.key === key);
            return (
              <View key={key} style={styles.navBox}>
                <Text style={styles.navCaption}>worker bar, active: {tab?.label ?? key}</Text>
                <BottomNavPreview activeKey={key} />
              </View>
            );
          })}
          <View style={styles.navBox}>
            <Text style={styles.navCaption}>customer bar — the same five (decision 4)</Text>
            <BottomNavPreview activeKey="Home" tabs={CUSTOMER_BAR_TABS} />
          </View>
          <View style={styles.navBox}>
            <Text style={styles.navCaption}>with a notched device’s bottom inset (34pt reported)</Text>
            <BottomNavPreview activeKey="Home" insetBottom={34} />
          </View>
        </Section>

        <Section title="JobCard — customer perspective">
          <Text style={styles.note}>
            EST. PRICE, no bid affordance, no distance. The perspective comes from ModeContext —
            these two sections differ only in which mode they are previewed under, not in any prop.
          </Text>
          <ModePreview mode="customer">
            <View style={styles.cardStack}>
              <JobCard job={CATALOG_JOB} onPress={() => {}} bidCount={0} onBid={() => {}} />
              <JobCard job={CATALOG_JOB_NO_BUDGET} onPress={() => {}} isOwn bidCount={3} />
            </View>
          </ModePreview>
        </Section>

        <Section title="JobCard — worker perspective">
          <Text style={styles.note}>
            EST. PAY, the bidding affordance, the exact radius distance, and the “Break the ice”
            state on a job with no bids yet. Same component, same props.
          </Text>
          <ModePreview mode="worker">
            <View style={styles.cardStack}>
              <JobCard
                job={CATALOG_JOB}
                onPress={() => {}}
                bidCount={0}
                distanceMiles={1.4}
                onBid={() => {}}
              />
              <JobCard
                job={CATALOG_JOB_NO_BUDGET}
                onPress={() => {}}
                bidCount={3}
                distanceMiles={4.8}
                onBid={() => {}}
              />
              <JobCard job={CATALOG_JOB} onPress={() => {}} isOwn bidCount={2} onBid={() => {}} />
            </View>
          </ModePreview>
        </Section>

        <Section title="Template states (all five)">
          <View style={styles.row}>
            {SCREEN_STATES.map((entry, index) => (
              <Pressable
                key={entry.label}
                onPress={() => setStateIndex(index)}
                style={[styles.stateTab, index === stateIndex && styles.stateTabActive]}
              >
                <Text
                  style={[styles.stateTabLabel, index === stateIndex && styles.stateTabLabelActive]}
                >
                  {entry.label}
                </Text>
              </Pressable>
            ))}
          </View>
          <View style={styles.stateBox}>
            <ScreenStateView state={SCREEN_STATES[stateIndex].state} />
          </View>
        </Section>

        <Text style={styles.footer}>
          Templates (FormScreen / DetailScreen / SuccessScreen) are full-screen and
          are checked on a real screen rather than inside this scroller.
        </Text>
      </ScrollView>

      <Sheet visible={sheetOpen} onClose={() => setSheetOpen(false)} title="Example sheet">
        <Text style={styles.body}>
          Sheets scroll, cap at 88% of the screen height, and read the device bottom inset rather
          than assuming one.
        </Text>
        <ListRow title="An option" showChevron onPress={() => setSheetOpen(false)} />
        <ListRow title="Another option" showChevron onPress={() => setSheetOpen(false)} />
      </Sheet>
    </SafeAreaView>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      <View style={styles.sectionBody}>{children}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  content: {
    padding: layout.screenGutter,
    gap: spacing.xxl,
    paddingBottom: layout.floatingNavClearance + spacing.xxl,
  },
  section: {
    gap: spacing.md,
  },
  sectionTitle: {
    ...typeScale.eyebrow,
    color: colors.emerald,
  },
  sectionBody: {
    gap: spacing.md,
  },
  row: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: spacing.sm,
  },
  column: {
    gap: spacing.sm,
    alignItems: 'flex-start',
  },
  body: {
    ...typeScale.body,
    color: colors.ink,
  },
  muted: {
    ...typeScale.sub,
    color: colors.muted,
  },
  flush: {
    padding: 0,
    overflow: 'hidden',
  },
  textarea: {
    minHeight: 88,
    textAlignVertical: 'top',
    paddingTop: spacing.md,
  },
  skeletonLine: {
    height: 16,
    borderRadius: radius.xs,
  },
  skeletonBlock: {
    height: 72,
    borderRadius: radius.md,
  },
  stateBox: {
    height: 280,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.surface,
    overflow: 'hidden',
  },
  stateTab: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.surface,
  },
  stateTabActive: {
    backgroundColor: colors.forest,
    borderColor: colors.forest,
  },
  stateTabLabel: {
    ...typeScale.sub,
    color: colors.muted,
  },
  stateTabLabelActive: {
    color: colors.onForest,
  },
  footer: {
    ...typeScale.sub,
    color: colors.muted,
  },
  note: {
    ...typeScale.sub,
    color: colors.muted,
  },
  navBox: {
    gap: spacing.xs,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.line,
    overflow: 'hidden',
    paddingTop: spacing.sm,
    backgroundColor: colors.bg,
  },
  navCaption: {
    ...typeScale.caption,
    color: colors.muted,
    paddingHorizontal: spacing.md,
  },
  cardStack: {
    gap: layout.cardGap,
  },
});
