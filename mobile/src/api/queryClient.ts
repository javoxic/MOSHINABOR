import AsyncStorage from '@react-native-async-storage/async-storage';
import { createAsyncStoragePersister } from '@tanstack/query-async-storage-persister';
import { onlineManager, QueryClient } from '@tanstack/react-query';
import NetInfo from '@react-native-community/netinfo';
import type { ApiError } from './errors';

// TanStack Query pauses requests while offline and resumes when connectivity returns.
onlineManager.setEventListener((setOnline) =>
  NetInfo.addEventListener((state) => setOnline(state.isConnected !== false && state.isInternetReachable !== false)),
);

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      gcTime: 7 * 24 * 3600_000,
      // Retry only transient failures of safe (GET) requests.
      retry: (failureCount, error) => {
        const e = error as Partial<ApiError>;
        if (e.status && e.status >= 400 && e.status < 500) return false;
        return failureCount < 2;
      },
      networkMode: 'offlineFirst',
    },
    mutations: { retry: false, networkMode: 'online' },
  },
});

export const persister = createAsyncStoragePersister({ storage: AsyncStorage, key: 'mb.query-cache', throttleTime: 2000 });
