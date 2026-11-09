import { useEffect, useState } from 'react';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { FUEL_TYPES } from '@moshina/shared';
import { AdminApi } from '@/api/endpoints';
import { errorText } from '@/api/client';
import { useListParams } from '@/hooks/useListParams';
import { DataTable, EmptyState, ErrorState, Field, Input, Loading, PageHeader, Pagination, Select, Toolbar } from '@/components/ui';
import { FUEL_LABEL, fmtDate, fmtNumber } from '@/utils/format';

const KEYS = ['q', 'fuelType', 'yearFrom', 'yearTo', 'sort'] as const;

export default function VehiclesPage() {
  const navigate = useNavigate();
  const { values, page, set } = useListParams(KEYS);
  const [search, setSearch] = useState(values.q);
  useEffect(() => {
    const id = setTimeout(() => search !== values.q && set({ q: search }), 350);
    return () => clearTimeout(id);
  }, [search, values.q, set]);
  const q = useQuery({ queryKey: ['admin', 'vehicles', values, page], queryFn: () => AdminApi.vehicles({ ...values, page, pageSize: 20 }), placeholderData: keepPreviousData });
  return (
    <>
      <PageHeader title="Vehicles" subtitle="All registered vehicles with ownership information" />
      <Toolbar>
        <Field label="Search" htmlFor="veh-search">
          <Input id="veh-search" placeholder="Brand, model, plate or VIN" value={search} onChange={(e) => setSearch(e.target.value)} style={{ minWidth: 240 }} />
        </Field>
        <Field label="Fuel type" htmlFor="veh-fuel">
          <Select id="veh-fuel" value={values.fuelType} onChange={(e) => set({ fuelType: e.target.value })}>
            <option value="">All</option>
            {FUEL_TYPES.map((f) => (
              <option key={f} value={f}>
                {FUEL_LABEL[f]}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Year from" htmlFor="veh-yf">
          <Input id="veh-yf" type="number" min={1950} max={2100} value={values.yearFrom} onChange={(e) => set({ yearFrom: e.target.value })} style={{ width: 110 }} />
        </Field>
        <Field label="Year to" htmlFor="veh-yt">
          <Input id="veh-yt" type="number" min={1950} max={2100} value={values.yearTo} onChange={(e) => set({ yearTo: e.target.value })} style={{ width: 110 }} />
        </Field>
        <Field label="Sort" htmlFor="veh-sort">
          <Select id="veh-sort" value={values.sort} onChange={(e) => set({ sort: e.target.value })}>
            <option value="">Newest first</option>
            <option value="year:desc">Year (newest)</option>
            <option value="currentMileage:desc">Mileage (highest)</option>
            <option value="brand:asc">Brand A–Z</option>
          </Select>
        </Field>
      </Toolbar>
      {q.isPending ? (
        <Loading />
      ) : q.isError ? (
        <ErrorState message={errorText(q.error)} onRetry={() => q.refetch()} />
      ) : q.data.items.length === 0 ? (
        <EmptyState title="No vehicles match these filters" />
      ) : (
        <>
          <DataTable
            caption="Vehicles"
            rows={q.data.items}
            onRowClick={(v) => navigate(`/vehicles/${v.id}`)}
            columns={[
              { key: 'v', header: 'Vehicle', render: (v) => `${v.brand} ${v.model}` },
              { key: 'y', header: 'Year', render: (v) => v.year },
              { key: 'p', header: 'Registration', render: (v) => <span className="mono">{v.registrationNumber}</span> },
              { key: 'f', header: 'Fuel', render: (v) => FUEL_LABEL[v.fuelType] },
              { key: 'm', header: 'Mileage', render: (v) => `${fmtNumber(v.currentMileage)} km` },
              { key: 'o', header: 'Owner', render: (v) => <span>{v.owner.fullName ?? '—'} <span className="mono muted">{v.owner.phone}</span></span> },
              { key: 'c', header: 'Added', render: (v) => fmtDate(v.createdAt) },
            ]}
          />
          <Pagination page={q.data.page} pageSize={q.data.pageSize} total={q.data.total} onPage={(p) => set({ page: String(p) })} />
        </>
      )}
    </>
  );
}
