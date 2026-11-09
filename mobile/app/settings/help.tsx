import { Linking } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import { Screen } from '@/components/Screen';
import { Text } from '@/components/Text';
import { Card } from '@/components/Card';
import { ListRow, SectionHeader } from '@/components/Misc';
import { api } from '@/api/client';
import { spacing } from '@/theme';

interface AppConfig {
  supportPhone: string | null;
  supportEmail: string | null;
}

export default function HelpScreen() {
  const { t } = useTranslation();
  const faq = t('help.faq', { returnObjects: true }) as { q: string; a: string }[];
  const config = useQuery({
    queryKey: ['app-config'],
    queryFn: () =>
      api()
        .get<AppConfig>('/app-config')
        .then((r) => r.data),
    staleTime: 3600_000,
  });
  const phone = config.data?.supportPhone;
  const email = config.data?.supportEmail;
  return (
    <Screen back title={t('help.title')}>
      {faq.map((f) => (
        <Card key={f.q} style={{ marginTop: spacing.sm }}>
          <Text variant="bodyStrong">{f.q}</Text>
          <Text tone="secondary" style={{ marginTop: spacing.xs }}>
            {f.a}
          </Text>
        </Card>
      ))}
      <SectionHeader title={t('help.contact')} />
      <Card style={{ padding: spacing.xs }}>
        {phone ? (
          <ListRow
            icon="call-outline"
            title={t('help.contactPhone')}
            subtitle={phone}
            onPress={() => void Linking.openURL(`tel:${phone}`)}
          />
        ) : null}
        {email ? (
          <ListRow
            icon="mail-outline"
            title={t('help.contactEmail')}
            subtitle={email}
            onPress={() => void Linking.openURL(`mailto:${email}`)}
          />
        ) : null}
        {!phone && !email ? (
          <ListRow icon="information-circle-outline" title={t('help.contactUnavailable')} />
        ) : null}
      </Card>
    </Screen>
  );
}
