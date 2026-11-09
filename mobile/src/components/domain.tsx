import { useState } from 'react';
import { Modal, Pressable, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useMutation } from '@tanstack/react-query';
import type { Expense, MaintenanceSchedule, ServiceRecord, Vehicle } from '@moshina/api-types';
import type { ScheduleStatus } from '@moshina/shared';
import { colors, radius, spacing } from '@/theme';
import { formatDate, formatDateTime, km, money, serviceTypeName, digitsOnly } from '@/utils/format';
import { Api } from '@/api/endpoints';
import { errorMessage } from '@/api/errors';
import { useInvalidateData } from '@/hooks/useInvalidateData';
import { useNetworkStatus } from '@/hooks/useNetworkStatus';
import { Text } from './Text';
import { Card } from './Card';
import { Badge, type BadgeTone } from './Badge';
import { Button } from './Button';
import { TextField } from './Fields';
import { AuthImage } from './Misc';
import { InlineNotice } from './States';

export const STATUS_TONE: Record<ScheduleStatus, BadgeTone> = { OK: 'success', DUE_SOON: 'warning', DUE: 'danger', OVERDUE: 'danger', UNKNOWN: 'neutral' };

export function StatusBadge({ status }: { status: ScheduleStatus }) {
  const { t } = useTranslation();
  return <Badge label={t(`maintenance.status.${status}`)} tone={STATUS_TONE[status]} />;
}

const SERVICE_ICONS: Record<string, keyof typeof Ionicons.glyphMap> = {
  oil: 'water-outline', filter: 'funnel-outline', air: 'leaf-outline', cabin: 'snow-outline', fuel: 'flame-outline', brake: 'disc-outline',
  drop: 'water-outline', thermometer: 'thermometer-outline', spark: 'flash-outline', battery: 'battery-charging-outline', tire: 'ellipse-outline',
  belt: 'sync-outline', gear: 'cog-outline', wrench: 'build-outline',
};

export function ServiceIcon({ icon, tone = 'accent' }: { icon: string; tone?: 'accent' | 'danger' | 'warning' }) {
  const bg = tone === 'danger' ? colors.dangerSoft : tone === 'warning' ? colors.warningSoft : colors.accentSoft;
  const fg = tone === 'danger' ? colors.danger : tone === 'warning' ? colors.warning : colors.accent;
  return (
    <View style={[styles.serviceIcon, { backgroundColor: bg }]}>
      <Ionicons name={SERVICE_ICONS[icon] ?? 'build-outline'} size={20} color={fg} />
    </View>
  );
}

/** One-line summary of what remains until a schedule is due. */
export function useDueText() {
  const { t, i18n } = useTranslation();
  return (s: MaintenanceSchedule): string => {
    const parts: string[] = [];
    const { daysRemaining, kmRemaining } = s.computed;
    if (daysRemaining != null) {
      if (daysRemaining > 0) parts.push(t('maintenance.daysLeft', { count: daysRemaining }));
      else if (daysRemaining === 0) parts.push(t('maintenance.dueToday'));
      else parts.push(t('maintenance.daysOverdue', { count: -daysRemaining }));
    }
    if (kmRemaining != null) {
      parts.push(kmRemaining >= 0 ? t('maintenance.kmLeft', { value: km(kmRemaining, i18n.language) }) : t('maintenance.kmOverdue', { value: km(-kmRemaining, i18n.language) }));
    }
    return parts.join(' · ');
  };
}

export function ScheduleCard({ schedule, onPress }: { schedule: MaintenanceSchedule; onPress: () => void }) {
  const { t, i18n } = useTranslation();
  const dueText = useDueText();
  const status = schedule.computed.status;
  const tone = status === 'OVERDUE' || status === 'DUE' ? 'danger' : status === 'DUE_SOON' ? 'warning' : 'default';
  const name = serviceTypeName(schedule.serviceType, i18n.language);
  return (
    <Card onPress={onPress} tone={tone} style={{ marginTop: spacing.sm }} accessibilityLabel={`${name}, ${t(`maintenance.status.${status}`)}, ${dueText(schedule)}`}>
      <View style={styles.row}>
        <ServiceIcon icon={schedule.serviceType.icon} tone={tone === 'danger' ? 'danger' : tone === 'warning' ? 'warning' : 'accent'} />
        <View style={{ flex: 1, marginLeft: spacing.md }}>
          <Text variant="bodyStrong" numberOfLines={1}>
            {name}
          </Text>
          <Text variant="caption" tone="secondary" numberOfLines={1}>
            {schedule.isActive ? dueText(schedule) || t('maintenance.status.UNKNOWN') : t('maintenance.paused')}
          </Text>
        </View>
        <StatusBadge status={status} />
      </View>
      {schedule.computed.mileageStale && schedule.intervalKm ? (
        <View style={[styles.row, { marginTop: spacing.sm }]}>
          <Ionicons name="speedometer-outline" size={14} color={colors.warning} />
          <Text variant="caption" tone="warning" style={{ marginLeft: spacing.xs, flex: 1 }}>
            {t('maintenance.mileageStaleWarning')}
          </Text>
        </View>
      ) : null}
    </Card>
  );
}

export function RecordRow({ record, onPress }: { record: ServiceRecord; onPress: () => void }) {
  const { i18n } = useTranslation();
  return (
    <Card onPress={onPress} style={{ marginTop: spacing.sm }}>
      <View style={styles.row}>
        <ServiceIcon icon={record.serviceType.icon} />
        <View style={{ flex: 1, marginLeft: spacing.md }}>
          <Text variant="bodyStrong" numberOfLines={1}>
            {serviceTypeName(record.serviceType, i18n.language)}
          </Text>
          <Text variant="caption" tone="secondary" numberOfLines={1}>
            {formatDate(record.date, i18n.language)} · {km(record.mileage, i18n.language)}
            {record.serviceProvider ? ` · ${record.serviceProvider}` : ''}
          </Text>
        </View>
        {record.cost ? <Text variant="caption" style={{ fontWeight: '600' }}>{money(record.cost, i18n.language)}</Text> : null}
        {record.attachments.length ? <Ionicons name="attach" size={16} color={colors.textMuted} style={{ marginLeft: spacing.xs }} /> : null}
      </View>
    </Card>
  );
}

const CATEGORY_ICON: Record<string, keyof typeof Ionicons.glyphMap> = { FUEL: 'flame-outline', MAINTENANCE: 'build-outline', REPAIR: 'hammer-outline', PARTS: 'cube-outline', OTHER: 'receipt-outline' };

export function ExpenseRow({ expense, onPress }: { expense: Expense; onPress: () => void }) {
  const { t, i18n } = useTranslation();
  return (
    <Card onPress={onPress} style={{ marginTop: spacing.sm }}>
      <View style={styles.row}>
        <View style={styles.serviceIcon}>
          <Ionicons name={CATEGORY_ICON[expense.category] ?? 'receipt-outline'} size={20} color={colors.accent} />
        </View>
        <View style={{ flex: 1, marginLeft: spacing.md }}>
          <Text variant="bodyStrong">{t(`expenses.categories.${expense.category}`)}</Text>
          <Text variant="caption" tone="secondary" numberOfLines={1}>
            {formatDate(expense.date, i18n.language)}
            {expense.description ? ` · ${expense.description}` : expense.serviceRecordId ? ` · ${t('expenses.fromService')}` : ''}
          </Text>
        </View>
        <Text variant="bodyStrong">{money(expense.amount, i18n.language)}</Text>
      </View>
    </Card>
  );
}

export function VehicleCard({ vehicle, onPress }: { vehicle: Vehicle; onPress: () => void }) {
  const { t, i18n } = useTranslation();
  return (
    <Card onPress={onPress} style={{ marginTop: spacing.md, padding: 0, overflow: 'hidden' }} accessibilityLabel={`${vehicle.brand} ${vehicle.model} ${vehicle.registrationNumber}`}>
      {vehicle.coverImageUrl ? (
        <AuthImage uri={vehicle.coverImageUrl} style={styles.cover} accessibilityLabel={`${vehicle.brand} ${vehicle.model}`} />
      ) : (
        <View style={[styles.cover, styles.coverEmpty]}>
          <Ionicons name="car-sport" size={48} color={colors.borderStrong} />
        </View>
      )}
      <View style={{ padding: spacing.lg }}>
        <View style={styles.row}>
          <Text variant="heading" style={{ flex: 1 }} numberOfLines={1}>
            {vehicle.brand} {vehicle.model}
          </Text>
          {vehicle.isPrimary ? <Badge label={t('vehicle.primary')} tone="accent" /> : null}
        </View>
        <View style={[styles.row, { marginTop: spacing.xs }]}>
          <View style={styles.plate}>
            <Text variant="caption" style={{ fontWeight: '700', letterSpacing: 1 }}>
              {vehicle.registrationNumber}
            </Text>
          </View>
          <Text variant="caption" tone="secondary" style={{ marginLeft: spacing.sm }}>
            {vehicle.year} · {t(`vehicle.fuel.${vehicle.fuelType}`)} · {km(vehicle.currentMileage, i18n.language)}
          </Text>
        </View>
      </View>
    </Card>
  );
}

/** Bottom sheet to record a new odometer reading. */
export function MileageSheet({ vehicle, visible, onClose }: { vehicle: Vehicle; visible: boolean; onClose: () => void }) {
  const { t, i18n } = useTranslation();
  const invalidate = useInvalidateData();
  const { isOffline } = useNetworkStatus();
  const [value, setValue] = useState('');
  const [error, setError] = useState<string | null>(null);
  const save = useMutation({
    mutationFn: (m: number) => Api.updateMileage(vehicle.id, m),
    onSuccess: async () => {
      await invalidate();
      setValue('');
      onClose();
    },
    onError: (e) => setError(errorMessage(t, e)),
  });
  const submit = () => {
    const n = Number(digitsOnly(value));
    if (!value || !Number.isFinite(n)) return setError(t('validation.number'));
    if (n < vehicle.currentMileage) return setError(t('errors.MILEAGE_DECREASE'));
    setError(null);
    save.mutate(n);
  };
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose} accessibilityLabel={t('common.close')} />
      <View style={styles.sheet}>
        <Text variant="heading">{t('vehicle.mileageTitle')}</Text>
        <Text variant="caption" tone="secondary" style={{ marginBottom: spacing.lg }}>
          {t('vehicle.mileageHint', { value: km(vehicle.currentMileage, i18n.language) })}
          {vehicle.mileageUpdatedAt ? ` · ${t('vehicle.mileageUpdated', { time: formatDateTime(new Date(vehicle.mileageUpdatedAt), i18n.language) })}` : ''}
        </Text>
        <TextField
          label={t('vehicle.currentMileage')}
          keyboardType="number-pad"
          value={value}
          onChangeText={(v) => setValue(digitsOnly(v))}
          suffix={t('common.km')}
          autoFocus
          error={error ?? undefined}
          testID="mileage-input"
        />
        {isOffline ? <InlineNotice text={t('offline.blocked')} /> : null}
        <Button title={t('common.save')} onPress={submit} loading={save.isPending} disabled={isOffline} style={{ marginTop: spacing.md }} />
      </View>
    </Modal>
  );
}

export function VehicleSwitcher({ vehicles, selectedId, onSelect }: { vehicles: Vehicle[]; selectedId: string | null; onSelect: (id: string) => void }) {
  if (vehicles.length < 2) return null;
  return (
    <View style={styles.switcher} accessibilityRole="tablist">
      {vehicles.map((v) => {
        const active = v.id === selectedId;
        return (
          <Pressable key={v.id} accessibilityRole="tab" accessibilityState={{ selected: active }} onPress={() => onSelect(v.id)} style={[styles.chip, active && styles.chipActive]}>
            <Text variant="caption" style={{ fontWeight: '600', color: active ? colors.text : colors.textSecondary }} numberOfLines={1}>
              {v.brand} {v.model}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center' },
  serviceIcon: { width: 40, height: 40, borderRadius: radius.md, backgroundColor: colors.accentSoft, alignItems: 'center', justifyContent: 'center' },
  cover: { width: '100%', height: 150 },
  coverEmpty: { backgroundColor: colors.surfaceRaised, alignItems: 'center', justifyContent: 'center' },
  plate: { borderWidth: 1, borderColor: colors.borderStrong, borderRadius: 6, paddingHorizontal: 6, paddingVertical: 1 },
  backdrop: { flex: 1, backgroundColor: colors.overlay },
  sheet: { backgroundColor: colors.surfaceRaised, padding: spacing.xl, paddingBottom: spacing.xxxl, borderTopLeftRadius: radius.xl, borderTopRightRadius: radius.xl },
  switcher: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginBottom: spacing.md },
  chip: { minHeight: 36, paddingHorizontal: spacing.md, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.border, justifyContent: 'center', backgroundColor: colors.surface },
  chipActive: { borderColor: colors.accent, backgroundColor: colors.accentSoft },
});
