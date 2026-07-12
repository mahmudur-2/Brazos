import { useRef, useState } from 'react';
import {
  Animated,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { Button } from '../components/Button';
import { Chip } from '../components/Chip';
import { ScreenHeader } from '../components/ScreenHeader';
import { TextField } from '../components/TextField';
import { useAuth } from '../hooks/useAuth';
import {
  createJob,
  dollarsToCents,
  JOB_CATEGORIES,
  JOB_CATEGORY_ICONS,
  JOB_CATEGORY_LABELS,
  type JobCategory,
} from '../lib/jobs';
import { alertAsync } from '../lib/dialog';
import type { HomeStackNavigation } from '../lib/navigation';
import { colors, radius, spacing } from '../lib/theme';

const USE_NATIVE_DRIVER = Platform.OS !== 'web';

export function PostJobScreen() {
  const navigation = useNavigation<HomeStackNavigation>();
  const { user } = useAuth();

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState<JobCategory | null>(null);
  const [location, setLocation] = useState('');
  const [budget, setBudget] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);

  const successScale = useRef(new Animated.Value(0.4)).current;
  const successOpacity = useRef(new Animated.Value(0)).current;

  function playSuccessThenLeave() {
    setShowSuccess(true);
    Animated.parallel([
      Animated.spring(successScale, {
        toValue: 1,
        friction: 6,
        tension: 80,
        useNativeDriver: USE_NATIVE_DRIVER,
      }),
      Animated.timing(successOpacity, {
        toValue: 1,
        duration: 200,
        useNativeDriver: USE_NATIVE_DRIVER,
      }),
    ]).start();

    setTimeout(() => {
      setShowSuccess(false);
      successScale.setValue(0.4);
      successOpacity.setValue(0);
      setTitle('');
      setDescription('');
      setCategory(null);
      setLocation('');
      setBudget('');
      // Return to Home, then jump to the My Jobs hub tab to see the new post.
      navigation.goBack();
      navigation.getParent()?.navigate('MyJobs' as never);
    }, 1200);
  }

  async function handleSubmit() {
    if (!user) return;

    if (!title.trim() || !description.trim() || !category || !location.trim()) {
      await alertAsync(
        'Missing details',
        'Title, description, category, and location are all required.'
      );
      return;
    }

    const budgetCents = dollarsToCents(budget);
    if (Number.isNaN(budgetCents)) {
      await alertAsync('Invalid budget', 'Budget must be a positive dollar amount.');
      return;
    }

    setSubmitting(true);
    const { error } = await createJob(user.id, {
      title: title.trim(),
      description: description.trim(),
      category,
      location: location.trim(),
      budgetCents,
    });
    setSubmitting(false);

    if (error) {
      await alertAsync('Could not post job', error.message);
      return;
    }

    playSuccessThenLeave();
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <ScreenHeader title="Post a Job" onBack={() => navigation.goBack()} />

      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <TextField
            label="Title"
            value={title}
            onChangeText={setTitle}
            placeholder="e.g. Walk my dog on weekday mornings"
            autoCapitalize="sentences"
          />

          <TextField
            label="Description"
            value={description}
            onChangeText={setDescription}
            placeholder="Describe what you need done…"
            autoCapitalize="sentences"
            multiline
            numberOfLines={4}
            style={styles.multiline}
          />

          <View style={styles.field}>
            <Text style={styles.fieldLabel}>Category</Text>
            <View style={styles.chips}>
              {JOB_CATEGORIES.map((c) => (
                <Chip
                  key={c}
                  label={JOB_CATEGORY_LABELS[c]}
                  icon={JOB_CATEGORY_ICONS[c]}
                  selected={category === c}
                  onPress={() => setCategory(c)}
                />
              ))}
            </View>
          </View>

          <TextField
            label="Location"
            value={location}
            onChangeText={setLocation}
            placeholder="e.g. Sheepshead Bay, Brooklyn"
            autoCapitalize="words"
          />

          <TextField
            label="Budget (optional)"
            value={budget}
            onChangeText={setBudget}
            placeholder="e.g. 50"
            keyboardType="numeric"
          />

          <Button
            title="Post job"
            onPress={handleSubmit}
            loading={submitting}
            style={styles.submit}
          />
        </ScrollView>
      </KeyboardAvoidingView>

      {showSuccess && (
        <Animated.View style={[styles.successOverlay, { opacity: successOpacity }]}>
          <Animated.View
            style={[styles.successCircle, { transform: [{ scale: successScale }] }]}
          >
            <Ionicons name="checkmark" size={56} color={colors.white} />
          </Animated.View>
          <Text style={styles.successText}>Job posted!</Text>
        </Animated.View>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: colors.background,
  },
  flex: {
    flex: 1,
  },
  content: {
    padding: spacing.lg,
    gap: spacing.lg,
  },
  multiline: {
    height: 110,
    paddingTop: spacing.md,
    textAlignVertical: 'top',
  },
  field: {
    gap: spacing.sm,
  },
  fieldLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.text,
  },
  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  submit: {
    marginTop: spacing.sm,
  },
  successOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(248,250,252,0.97)',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.lg,
  },
  successCircle: {
    width: 104,
    height: 104,
    borderRadius: radius.pill,
    backgroundColor: colors.success,
    alignItems: 'center',
    justifyContent: 'center',
  },
  successText: {
    fontSize: 20,
    fontWeight: '700',
    color: colors.text,
  },
});
