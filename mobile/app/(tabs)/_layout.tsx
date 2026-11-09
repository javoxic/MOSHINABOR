import { Redirect, Tabs } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useAuthStore } from '@/store/auth';
import { colors } from '@/theme';

type IconName = keyof typeof Ionicons.glyphMap;
const icon = (name: IconName, focusedName: IconName) =>
  function TabIcon({ color, focused, size }: { color: string; focused: boolean; size: number }) {
    return <Ionicons name={focused ? focusedName : name} size={size} color={color} />;
  };

export default function TabsLayout() {
  const { t } = useTranslation();
  const status = useAuthStore((s) => s.status);
  if (status !== 'signedIn') return <Redirect href="/" />;
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.accent,
        tabBarInactiveTintColor: colors.textMuted,
        tabBarStyle: { backgroundColor: colors.surface, borderTopColor: colors.border, height: 64, paddingTop: 6, paddingBottom: 8 },
        tabBarLabelStyle: { fontSize: 11, fontWeight: '600' },
        sceneStyle: { backgroundColor: colors.bg },
      }}
    >
      <Tabs.Screen name="index" options={{ title: t('tabs.home'), tabBarIcon: icon('speedometer-outline', 'speedometer') }} />
      <Tabs.Screen name="vehicles" options={{ title: t('tabs.vehicles'), tabBarIcon: icon('car-sport-outline', 'car-sport') }} />
      <Tabs.Screen name="maintenance" options={{ title: t('tabs.maintenance'), tabBarIcon: icon('construct-outline', 'construct') }} />
      <Tabs.Screen name="expenses" options={{ title: t('tabs.expenses'), tabBarIcon: icon('wallet-outline', 'wallet') }} />
      <Tabs.Screen name="profile" options={{ title: t('tabs.profile'), tabBarIcon: icon('person-circle-outline', 'person-circle') }} />
    </Tabs>
  );
}
