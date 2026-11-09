import { useTranslation } from 'react-i18next';
import { Screen } from '@/components/Screen';
import { Text } from '@/components/Text';
import { Card } from '@/components/Card';
import { spacing } from '@/theme';

export default function PrivacyScreen() {
  const { t } = useTranslation();
  const sections = t('privacy.sections', { returnObjects: true }) as { h: string; p: string }[];
  return (
    <Screen back title={t('privacy.title')}>
      <Text tone="secondary" style={{ marginBottom: spacing.md }}>
        {t('privacy.intro')}
      </Text>
      {sections.map((s) => (
        <Card key={s.h} style={{ marginTop: spacing.sm }}>
          <Text variant="bodyStrong">{s.h}</Text>
          <Text tone="secondary" style={{ marginTop: spacing.xs }}>
            {s.p}
          </Text>
        </Card>
      ))}
    </Screen>
  );
}
