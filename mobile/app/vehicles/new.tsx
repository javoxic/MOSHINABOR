import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useMutation } from '@tanstack/react-query';
import { Screen } from '@/components/Screen';
import { VehicleForm } from '@/components/VehicleForm';
import { Api, type VehicleBody } from '@/api/endpoints';
import { useInvalidateData } from '@/hooks/useInvalidateData';
import { useIdempotencyKey } from '@/hooks/useIdempotencyKey';
import { useAppStore } from '@/store/app';

export default function NewVehicleScreen() {
  const { t } = useTranslation();
  const invalidate = useInvalidateData();
  const idem = useIdempotencyKey();
  const select = useAppStore((s) => s.selectVehicle);
  const create = useMutation({
    mutationFn: (body: VehicleBody) => Api.createVehicle(body, idem.key()),
    onSuccess: async (v) => {
      idem.rotate();
      select(v.id);
      await invalidate();
      router.replace({ pathname: '/vehicles/[id]', params: { id: v.id } });
    },
  });
  return (
    <Screen back title={t('vehicle.add')}>
      <VehicleForm submitLabel={t('common.save')} onSubmit={(b) => create.mutate(b)} submitting={create.isPending} serverError={create.error} />
    </Screen>
  );
}
