import { Alert } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Screen } from '@/components/Screen';
import { ExpenseForm } from '@/components/ExpenseForm';
import { Button } from '@/components/Button';
import { Card } from '@/components/Card';
import { ErrorState, InlineNotice, LoadingState } from '@/components/States';
import { ListRow } from '@/components/Misc';
import { Api, type ExpenseBody } from '@/api/endpoints';
import { qk } from '@/api/keys';
import { errorMessage } from '@/api/errors';
import { useInvalidateData } from '@/hooks/useInvalidateData';
import { useSelectedVehicle } from '@/hooks/useSelectedVehicle';
import { spacing } from '@/theme';
import { formatDate, money } from '@/utils/format';

export default function ExpenseDetailsScreen() {
  const { t, i18n } = useTranslation();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { list } = useSelectedVehicle();
  const invalidate = useInvalidateData();
  const expense = useQuery({ queryKey: qk.expense(id), queryFn: () => Api.expense(id) });
  const update = useMutation({
    mutationFn: (b: ExpenseBody) => Api.updateExpense(id, b),
    onSuccess: async () => {
      await invalidate();
      router.back();
    },
  });
  const remove = useMutation({
    mutationFn: () => Api.deleteExpense(id),
    onSuccess: async () => {
      await invalidate();
      router.back();
    },
    onError: (e) => Alert.alert(t('errors.title'), errorMessage(t, e)),
  });
  if (expense.isPending)
    return (
      <Screen back title={t('expenses.edit')}>
        <LoadingState />
      </Screen>
    );
  if (!expense.data)
    return (
      <Screen back title={t('expenses.edit')}>
        <ErrorState message={errorMessage(t, expense.error)} onRetry={() => expense.refetch()} />
      </Screen>
    );
  const e = expense.data;
  if (e.serviceRecordId) {
    return (
      <Screen back title={t(`expenses.categories.${e.category}`)}>
        <InlineNotice tone="accent" text={t('expenses.linkedNote')} />
        <Card style={{ marginTop: spacing.md, padding: spacing.xs }}>
          <ListRow title={t('expenses.amount')} value={money(e.amount, i18n.language)} />
          <ListRow title={t('expenses.date')} value={formatDate(e.date, i18n.language)} />
        </Card>
        <Button title={t('history.details')} variant="secondary" onPress={() => router.replace({ pathname: '/history/[id]', params: { id: e.serviceRecordId! } })} style={{ marginTop: spacing.lg }} />
      </Screen>
    );
  }
  return (
    <Screen back title={t('expenses.edit')}>
      <ExpenseForm vehicles={list} defaultVehicleId={e.vehicleId} initial={e} onSubmit={(b) => update.mutate(b)} submitting={update.isPending} serverError={update.error} />
      <Button
        title={t('common.delete')}
        variant="danger"
        icon="trash-outline"
        loading={remove.isPending}
        style={{ marginTop: spacing.md }}
        onPress={() =>
          Alert.alert(t('expenses.deleteTitle'), t('common.deleteConfirmBody'), [
            { text: t('common.cancel'), style: 'cancel' },
            { text: t('common.delete'), style: 'destructive', onPress: () => remove.mutate() },
          ])
        }
      />
    </Screen>
  );
}
