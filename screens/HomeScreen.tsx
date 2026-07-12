import { StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { Button } from '../components/Button';
import { useAuth } from '../hooks/useAuth';
import { useProfile } from '../hooks/useProfile';
import type { HomeStackNavigation } from '../lib/navigation';

export function HomeScreen() {
  const { user } = useAuth();
  const { profile } = useProfile();
  const navigation = useNavigation<HomeStackNavigation>();

  const firstName = profile?.full_name?.trim().split(/\s+/)[0];

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.content}>
        <View style={styles.header}>
          <Text style={styles.title}>{firstName ? `Hi, ${firstName}` : 'Home'}</Text>
          <Text style={styles.subtitle}>
            {user?.email ?? 'Post a job or find work'}
          </Text>
        </View>

        <View style={styles.actions}>
          <Button title="Post a Job" onPress={() => navigation.navigate('PostJob')} />
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: '#ffffff',
  },
  content: {
    flex: 1,
    paddingHorizontal: 24,
    paddingTop: 32,
    gap: 32,
  },
  header: {
    gap: 6,
  },
  title: {
    fontSize: 28,
    fontWeight: '700',
    color: '#111827',
  },
  subtitle: {
    fontSize: 15,
    color: '#6b7280',
  },
  actions: {
    gap: 12,
  },
});
