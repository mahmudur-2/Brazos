import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { authColors } from '../lib/authTheme';
import type { AuthStackParamList } from '../lib/navigation';
import { CreateAccountScreen } from './CreateAccountScreen';
import { EmailSignInScreen } from './EmailSignInScreen';
import { SignInScreen } from './SignInScreen';
import { WelcomeScreen } from './WelcomeScreen';

const Stack = createNativeStackNavigator<AuthStackParamList>();

/**
 * The signed-out stack, rendered in place of the tab bar until there is a
 * session. Screen transitions are left at the navigator's platform defaults —
 * the same as every other stack in App.tsx — so this can't drift into a second
 * competing transition style.
 */
export function AuthFlow() {
  return (
    <Stack.Navigator
      screenOptions={{
        headerShown: false,
        // Each screen owns its own safe area; this only stops a flash of the
        // default white behind the ivory background mid-transition.
        contentStyle: { backgroundColor: authColors.bg },
      }}
    >
      <Stack.Screen name="Welcome" component={WelcomeScreen} />
      <Stack.Screen name="SignIn" component={SignInScreen} />
      <Stack.Screen name="EmailSignIn" component={EmailSignInScreen} />
      <Stack.Screen name="CreateAccount" component={CreateAccountScreen} />
    </Stack.Navigator>
  );
}
