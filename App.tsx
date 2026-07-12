import { StatusBar } from 'expo-status-bar';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { NavigationContainer } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import type { ComponentProps } from 'react';
import { AuthProvider } from './lib/AuthContext';
import { useAuth } from './hooks/useAuth';
import type {
  HomeStackParamList,
  MyJobsStackParamList,
  WorkStackParamList,
} from './lib/navigation';
import { colors } from './lib/theme';
import { AuthScreen } from './screens/AuthScreen';
import { HomeScreen } from './screens/HomeScreen';
import { PostJobScreen } from './screens/PostJobScreen';
import { ClientJobDetailScreen } from './screens/ClientJobDetailScreen';
import { BrowseJobsScreen } from './screens/BrowseJobsScreen';
import { JobDetailScreen } from './screens/JobDetailScreen';
import { WorkerJobScreen } from './screens/WorkerJobScreen';
import { MyJobsHubScreen } from './screens/MyJobsHubScreen';
import { ProfileScreen } from './screens/ProfileScreen';

type IoniconName = ComponentProps<typeof Ionicons>['name'];

const Tab = createBottomTabNavigator();
const HomeStack = createNativeStackNavigator<HomeStackParamList>();
const WorkStack = createNativeStackNavigator<WorkStackParamList>();
const MyJobsStack = createNativeStackNavigator<MyJobsStackParamList>();

// [active, inactive] icon per tab.
const TAB_ICONS: Record<string, [IoniconName, IoniconName]> = {
  Home: ['home', 'home-outline'],
  Work: ['search', 'search-outline'],
  MyJobs: ['briefcase', 'briefcase-outline'],
  Profile: ['person', 'person-outline'],
};

function HomeStackNavigator() {
  return (
    <HomeStack.Navigator screenOptions={{ headerShown: false }}>
      <HomeStack.Screen name="HomeMain" component={HomeScreen} />
      <HomeStack.Screen name="PostJob" component={PostJobScreen} />
    </HomeStack.Navigator>
  );
}

function WorkStackNavigator() {
  return (
    <WorkStack.Navigator screenOptions={{ headerShown: false }}>
      <WorkStack.Screen name="BrowseJobs" component={BrowseJobsScreen} />
      <WorkStack.Screen name="JobDetail" component={JobDetailScreen} />
    </WorkStack.Navigator>
  );
}

function MyJobsStackNavigator() {
  return (
    <MyJobsStack.Navigator screenOptions={{ headerShown: false }}>
      <MyJobsStack.Screen name="MyJobsHub" component={MyJobsHubScreen} />
      <MyJobsStack.Screen name="ClientJobDetail" component={ClientJobDetailScreen} />
      <MyJobsStack.Screen name="WorkerJob" component={WorkerJobScreen} />
      <MyJobsStack.Screen name="JobDetail" component={JobDetailScreen} />
    </MyJobsStack.Navigator>
  );
}

function MainTabs() {
  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.textSubtle,
        tabBarIcon: ({ focused, color, size }) => {
          const [active, inactive] = TAB_ICONS[route.name] ?? [
            'ellipse',
            'ellipse-outline',
          ];
          return <Ionicons name={focused ? active : inactive} size={size} color={color} />;
        },
      })}
    >
      <Tab.Screen name="Home" component={HomeStackNavigator} />
      <Tab.Screen
        name="Work"
        component={WorkStackNavigator}
        options={{ tabBarLabel: 'Find Work' }}
      />
      <Tab.Screen
        name="MyJobs"
        component={MyJobsStackNavigator}
        options={{ tabBarLabel: 'My Jobs' }}
      />
      <Tab.Screen name="Profile" component={ProfileScreen} />
    </Tab.Navigator>
  );
}

function RootNavigator() {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <View style={styles.loader}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  return user ? <MainTabs /> : <AuthScreen />;
}

export default function App() {
  return (
    <SafeAreaProvider>
      <AuthProvider>
        <NavigationContainer>
          <RootNavigator />
          <StatusBar style="auto" />
        </NavigationContainer>
      </AuthProvider>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  loader: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.background,
  },
});
