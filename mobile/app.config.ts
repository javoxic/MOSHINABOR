import type { ExpoConfig, ConfigContext } from 'expo/config';

/**
 * Build-time configuration. Values come from environment variables (see mobile/.env.example)
 * so that no environment-specific URL or identifier is hard-coded.
 */
// APP_VARIANT=pilot builds a separately installable app pointing at staging.
const PILOT = process.env.APP_VARIANT === 'pilot';
const ID_SUFFIX = PILOT ? '.pilot' : '';

export default ({ config }: ConfigContext): ExpoConfig => ({
  ...config,
  name: PILOT ? 'MOSHINA BOR Pilot' : 'MOSHINA BOR',
  slug: 'moshina-bor',
  scheme: PILOT ? 'moshinabor-pilot' : 'moshinabor',
  version: '1.0.0',
  orientation: 'portrait',
  icon: './assets/icon.png',
  userInterfaceStyle: 'dark',
  backgroundColor: '#0B0D10',
  newArchEnabled: true,
  splash: {
    image: './assets/splash.png',
    resizeMode: 'contain',
    backgroundColor: '#0B0D10',
  },
  ios: {
    bundleIdentifier: `${process.env.IOS_BUNDLE_IDENTIFIER ?? 'uz.moshinabor.app'}${ID_SUFFIX}`,
    buildNumber: process.env.IOS_BUILD_NUMBER ?? '1',
    supportsTablet: false,
    infoPlist: {
      NSCameraUsageDescription:
        'MOSHINA BOR uses the camera to photograph your vehicle and service receipts.',
      NSPhotoLibraryUsageDescription:
        'MOSHINA BOR uses your photo library to attach vehicle photos and service receipts.',
      ITSAppUsesNonExemptEncryption: false,
    },
  },
  android: {
    package: `${process.env.ANDROID_PACKAGE ?? 'uz.moshinabor.app'}${ID_SUFFIX}`,
    versionCode: Number(process.env.ANDROID_VERSION_CODE ?? 1),
    adaptiveIcon: { foregroundImage: './assets/adaptive-icon.png', backgroundColor: '#0B0D10' },
    permissions: ['CAMERA', 'POST_NOTIFICATIONS'],
    blockedPermissions: ['android.permission.RECORD_AUDIO'],
    googleServicesFile: process.env.GOOGLE_SERVICES_JSON,
  },
  plugins: [
    'expo-router',
    'expo-secure-store',
    'expo-localization',
    [
      'expo-splash-screen',
      { image: './assets/splash.png', imageWidth: 200, backgroundColor: '#0B0D10' },
    ],
    ['expo-notifications', { icon: './assets/notification-icon.png', color: '#2F7BFF' }],
    [
      'expo-image-picker',
      {
        photosPermission: 'MOSHINA BOR uses your photos to attach vehicle images and receipts.',
        cameraPermission: 'MOSHINA BOR uses the camera to photograph your vehicle and receipts.',
      },
    ],
    '@react-native-community/datetimepicker',
  ],
  experiments: { typedRoutes: true },
  extra: {
    apiUrl: process.env.EXPO_PUBLIC_API_URL,
    eas: { projectId: process.env.EAS_PROJECT_ID },
  },
  updates: process.env.EAS_PROJECT_ID
    ? { url: `https://u.expo.dev/${process.env.EAS_PROJECT_ID}` }
    : undefined,
  runtimeVersion: { policy: 'appVersion' },
});
