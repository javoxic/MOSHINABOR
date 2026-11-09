import { screen } from '@testing-library/react-native';
import { renderWithProviders } from '@/test-utils';
import { useAppStore } from '@/store/app';
import { useAuthStore } from '@/store/auth';
import Index from '../../app/index';

const baseUser = {
  id: 'u1',
  phone: '+998901234567',
  avatarUrl: null,
  status: 'ACTIVE' as const,
  createdAt: '2026-01-01T00:00:00Z',
  deletionRequestedAt: null,
  deletionScheduledFor: null,
  settings: {
    language: 'uz' as const,
    pushEnabled: true,
    maintenanceReminders: true,
    mileageReminders: true,
    announcements: true,
    primaryVehicleId: null,
  },
};

describe('entry routing', () => {
  it('starts with language selection on first launch', () => {
    useAppStore.setState({ languageChosen: false });
    renderWithProviders(<Index />);
    expect(screen.getByTestId('redirect').props.children).toBe('/(auth)/language');
  });

  it('asks signed-out users for their phone', () => {
    useAppStore.setState({ languageChosen: true });
    useAuthStore.setState({ status: 'signedOut', user: null });
    renderWithProviders(<Index />);
    expect(screen.getByTestId('redirect').props.children).toBe('/(auth)/phone');
  });

  it('sends new users to profile setup and others to the dashboard', () => {
    useAppStore.setState({ languageChosen: true });
    useAuthStore.setState({ status: 'signedIn', user: { ...baseUser, fullName: null } });
    const { unmount } = renderWithProviders(<Index />);
    expect(screen.getByTestId('redirect').props.children).toBe('/(auth)/profile-setup');
    unmount();
    useAuthStore.setState({ status: 'signedIn', user: { ...baseUser, fullName: 'Aziz' } });
    renderWithProviders(<Index />);
    expect(screen.getByTestId('redirect').props.children).toBe('/(tabs)');
  });
});
