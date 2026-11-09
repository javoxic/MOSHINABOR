import { useQuery } from '@tanstack/react-query';
import { useEffect, useMemo } from 'react';
import { Api } from '@/api/endpoints';
import { qk } from '@/api/keys';
import { useAppStore } from '@/store/app';

/** Currently selected vehicle (falls back to the primary vehicle). */
export function useSelectedVehicle() {
  const selectedId = useAppStore((s) => s.selectedVehicleId);
  const select = useAppStore((s) => s.selectVehicle);
  const vehicles = useQuery({ queryKey: qk.vehicles, queryFn: Api.vehicles });
  const list = useMemo(() => vehicles.data ?? [], [vehicles.data]);
  const selected = list.find((v) => v.id === selectedId) ?? list.find((v) => v.isPrimary) ?? list[0] ?? null;

  useEffect(() => {
    if (vehicles.isSuccess && selectedId && !list.some((v) => v.id === selectedId)) select(null);
  }, [vehicles.isSuccess, selectedId, list, select]);

  return { vehicles, list, selected, select };
}
