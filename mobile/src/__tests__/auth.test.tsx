import { fireEvent, screen, waitFor } from '@testing-library/react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { renderWithProviders } from '@/test-utils';
import { Api } from '@/api/endpoints';
import { ApiError } from '@/api/errors';
import { useAuthStore } from '@/store/auth';
import PhoneScreen from '../../app/(auth)/phone';
import VerifyScreen from '../../app/(auth)/verify';

jest.mock('@/api/endpoints', () => ({ Api: { requestOtp: jest.fn(), verifyOtp: jest.fn() } }));
const mockedApi = Api as jest.Mocked<typeof Api>;

const user = {
  id: 'u1',
  phone: '+998901234567',
  fullName: null,
  avatarUrl: null,
  status: 'ACTIVE' as const,
  createdAt: '2026-01-01T00:00:00Z',
  deletionRequestedAt: null,
  deletionScheduledFor: null,
  settings: {
    language: 'en' as const,
    pushEnabled: true,
    maintenanceReminders: true,
    mileageReminders: true,
    announcements: true,
    primaryVehicleId: null,
  },
};

beforeEach(() => jest.clearAllMocks());

describe('Phone entry', () => {
  it('validates the phone number before calling the API', async () => {
    renderWithProviders(<PhoneScreen />);
    fireEvent.changeText(screen.getByTestId('phone-input'), '123');
    fireEvent.press(screen.getByTestId('send-code'));
    expect(await screen.findByText('Enter a valid mobile number')).toBeTruthy();
    expect(mockedApi.requestOtp).not.toHaveBeenCalled();
  });

  it('requests a code and navigates to verification with the normalized phone', async () => {
    mockedApi.requestOtp.mockResolvedValue({
      requestId: 'r1',
      phone: '+998901234567',
      expiresInSeconds: 300,
      resendAfterSeconds: 60,
    });
    renderWithProviders(<PhoneScreen />);
    fireEvent.changeText(screen.getByTestId('phone-input'), '90 123 45 67');
    fireEvent.press(screen.getByTestId('send-code'));
    await waitFor(() => expect(mockedApi.requestOtp).toHaveBeenCalledWith('90 123 45 67', 'uz'));
    expect(router.push).toHaveBeenCalledWith({
      pathname: '/(auth)/verify',
      params: { phone: '+998901234567', resendAfter: '60' },
    });
  });

  it('shows server errors such as rate limits', async () => {
    mockedApi.requestOtp.mockRejectedValue(
      new ApiError(429, 'OTP_RESEND_COOLDOWN', 'wait', { retryAfterSeconds: 42 }),
    );
    renderWithProviders(<PhoneScreen />);
    fireEvent.changeText(screen.getByTestId('phone-input'), '+998901234567');
    fireEvent.press(screen.getByTestId('send-code'));
    expect(await screen.findByText('Please try again in 42 s.')).toBeTruthy();
  });
});

describe('SMS verification', () => {
  beforeEach(() => {
    (useLocalSearchParams as jest.Mock).mockReturnValue({
      phone: '+998901234567',
      resendAfter: '60',
    });
  });

  it('verifies a complete code, stores the session and continues to profile setup for new users', async () => {
    mockedApi.verifyOtp.mockResolvedValue({
      tokens: {
        accessToken: 'a',
        refreshToken: 'r',
        accessTokenExpiresAt: '',
        refreshTokenExpiresAt: '',
      },
      user,
      isNewUser: true,
    });
    renderWithProviders(<VerifyScreen />);
    expect(screen.getByText('Resend code in 60 s')).toBeTruthy();
    fireEvent.changeText(screen.getByTestId('otp-input'), '123456');
    await waitFor(() =>
      expect(mockedApi.verifyOtp).toHaveBeenCalledWith('+998901234567', '123456', 'uz'),
    );
    await waitFor(() => expect(router.replace).toHaveBeenCalledWith('/(auth)/profile-setup'));
    expect(useAuthStore.getState()).toMatchObject({
      status: 'signedIn',
      accessToken: 'a',
      refreshToken: 'r',
    });
  });

  it('shows remaining attempts for an incorrect code and clears the input', async () => {
    mockedApi.verifyOtp.mockRejectedValue(
      new ApiError(400, 'OTP_INVALID', 'bad', { attemptsRemaining: 3 }),
    );
    renderWithProviders(<VerifyScreen />);
    fireEvent.changeText(screen.getByTestId('otp-input'), '000000');
    expect(await screen.findByText('The code is incorrect. 3 attempts left.')).toBeTruthy();
    expect(screen.getByTestId('otp-input').props.value).toBe('');
  });

  it('allows resending immediately after the code expired', async () => {
    mockedApi.verifyOtp.mockRejectedValue(new ApiError(400, 'OTP_EXPIRED', 'expired'));
    mockedApi.requestOtp.mockResolvedValue({
      requestId: 'r2',
      phone: '+998901234567',
      expiresInSeconds: 300,
      resendAfterSeconds: 60,
    });
    renderWithProviders(<VerifyScreen />);
    fireEvent.changeText(screen.getByTestId('otp-input'), '111111');
    expect(await screen.findByText('The code has expired. Request a new one.')).toBeTruthy();
    fireEvent.press(screen.getByTestId('resend'));
    expect(await screen.findByText('A new code has been sent.')).toBeTruthy();
  });
});
