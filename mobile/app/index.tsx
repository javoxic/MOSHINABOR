import { Redirect } from 'expo-router';
import { useAppStore } from '@/store/app';
import { useAuthStore } from '@/store/auth';

/** Entry router: decides where a user lands based on onboarding and session state. */
export default function Index() {
  const languageChosen = useAppStore((s) => s.languageChosen);
  const status = useAuthStore((s) => s.status);
  const user = useAuthStore((s) => s.user);

  if (!languageChosen) return <Redirect href="/(auth)/language" />;
  if (status !== 'signedIn') return <Redirect href="/(auth)/phone" />;
  if (user && !user.fullName) return <Redirect href="/(auth)/profile-setup" />;
  return <Redirect href="/(tabs)" />;
}
