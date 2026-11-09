import { useEffect, useState } from 'react';
import NetInfo from '@react-native-community/netinfo';

export function useNetworkStatus(): { isOffline: boolean } {
  const [isOffline, setOffline] = useState(false);
  useEffect(() => {
    const unsub = NetInfo.addEventListener((s) => setOffline(s.isConnected === false || s.isInternetReachable === false));
    return unsub;
  }, []);
  return { isOffline };
}
