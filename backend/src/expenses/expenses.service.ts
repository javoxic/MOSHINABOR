import { Injectable } from '@nestjs/common';
import { Prisma, type Expense, type ExpenseCategory } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AppException } from '../common/errors/app-exception';
import { assertNotFuture, dateOnly, toDbDate, todayTashkent } from '../common/utils/dates';
import { decimalToString } from '../common/utils/decimal';
import { paginate } from '../common/dto/pagination.dto';
import { VehiclesService } from '../vehicles/vehicles.service';
import type {
  CreateExpenseDto,
  ExpenseQueryDto,
  ExpenseStatsQueryDto,
  UpdateExpenseDto,
} from './dto/expenses.dto';

export interface ExpenseView {
  id: string;
  vehicleId: string;
  category: ExpenseCategory;
  amount: string;
  date: string;
  mileage: number | null;
  liters: string | null;
  description: string | null;
  serviceRecordId: string | null;
  createdAt: string;
  updatedAt: string;
}

export function expenseView(e: Expense): ExpenseView {
  return {
    id: e.id,
    vehicleId: e.vehicleId,
    category: e.category,
    amount: e.amount.toFixed(2),
    date: dateOnly(e.expenseDate),
    mileage: e.mileage,
    liters: decimalToString(e.liters),
    description: e.description,
    serviceRecordId: e.serviceRecordId,
    createdAt: e.createdAt.toISOString(),
    updatedAt: e.updatedAt.toISOString(),
  };
}

@Injectable()
export class ExpensesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly vehicles: VehiclesService,
  ) {}

  private async getOwned(userId: string, id: string): Promise<Expense> {
    const e = await this.prisma.expense.findFirst({ where: { id, userId } });
    if (!e) throw AppException.notFound('Expense');
    return e;
  }

  async list(userId: string, q: ExpenseQueryDto) {
    if (q.vehicleId) await this.vehicles.getOwned(userId, q.vehicleId);
    const where: Prisma.ExpenseWhereInput = {
      userId,
      vehicleId: q.vehicleId,
      category: q.category,
      expenseDate:
        q.from || q.to
          ? { gte: q.from ? toDbDate(q.from) : undefined, lte: q.to ? toDbDate(q.to) : undefined }
          : undefined,
    };
    const [items, total, sum] = await Promise.all([
      this.prisma.expense.findMany({
        where,
        orderBy: [{ expenseDate: 'desc' }, { createdAt: 'desc' }],
        ...paginate(q),
      }),
      this.prisma.expense.count({ where }),
      this.prisma.expense.aggregate({ where, _sum: { amount: true } }),
    ]);
    return {
      items: items.map(expenseView),
      total,
      page: q.page,
      pageSize: q.pageSize,
      totalAmount: (sum._sum.amount ?? new Prisma.Decimal(0)).toFixed(2),
    };
  }

  async get(userId: string, id: string): Promise<ExpenseView> {
    return expenseView(await this.getOwned(userId, id));
  }

  async create(userId: string, dto: CreateExpenseDto): Promise<ExpenseView> {
    assertNotFuture(dto.date, 'date');
    const vehicle = await this.vehicles.getOwned(userId, dto.vehicleId);
    const e = await this.prisma.$transaction(async (tx) => {
      const created = await tx.expense.create({
        data: {
          userId,
          vehicleId: dto.vehicleId,
          category: dto.category,
          amount: new Prisma.Decimal(dto.amount),
          expenseDate: toDbDate(dto.date),
          mileage: dto.mileage ?? null,
          liters: dto.liters != null ? new Prisma.Decimal(dto.liters) : null,
          description: dto.description ?? null,
        },
      });
      if (dto.mileage != null)
        await this.vehicles.applyMileage(tx, vehicle, dto.mileage, 'EXPENSE', new Date());
      return created;
    });
    return expenseView(e);
  }

  async update(userId: string, id: string, dto: UpdateExpenseDto): Promise<ExpenseView> {
    const existing = await this.getOwned(userId, id);
    if (existing.serviceRecordId) {
      throw AppException.conflict(
        'This expense belongs to a service record. Edit the service record instead.',
      );
    }
    if (dto.date) assertNotFuture(dto.date, 'date');
    const e = await this.prisma.$transaction(async (tx) => {
      const updated = await tx.expense.update({
        where: { id },
        data: {
          category: dto.category,
          amount: dto.amount !== undefined ? new Prisma.Decimal(dto.amount) : undefined,
          expenseDate: dto.date ? toDbDate(dto.date) : undefined,
          mileage: dto.mileage,
          liters:
            dto.liters === undefined
              ? undefined
              : dto.liters === null
                ? null
                : new Prisma.Decimal(dto.liters),
          description: dto.description,
        },
      });
      if (dto.mileage != null) {
        const vehicle = await this.vehicles.getOwned(userId, existing.vehicleId, tx);
        await this.vehicles.applyMileage(tx, vehicle, dto.mileage, 'EXPENSE', new Date());
      }
      return updated;
    });
    return expenseView(e);
  }

  async remove(userId: string, id: string): Promise<void> {
    const existing = await this.getOwned(userId, id);
    if (existing.serviceRecordId) {
      throw AppException.conflict(
        'This expense belongs to a service record. Remove the cost from the service record instead.',
      );
    }
    await this.prisma.expense.delete({ where: { id } });
  }

  async stats(userId: string, q: ExpenseStatsQueryDto) {
    if (q.vehicleId) await this.vehicles.getOwned(userId, q.vehicleId);
    const today = todayTashkent();
    const from = q.from ?? `${today.slice(0, 4)}-01-01`;
    const to = q.to ?? today;
    if (from > to) throw AppException.validation('"from" must be before "to"');
    const where: Prisma.ExpenseWhereInput = {
      userId,
      vehicleId: q.vehicleId,
      expenseDate: { gte: toDbDate(from), lte: toDbDate(to) },
    };
    const vehicleFilter = q.vehicleId
      ? Prisma.sql`AND vehicle_id = ${q.vehicleId}::uuid`
      : Prisma.empty;
    const [total, byCategory, byVehicle, byMonth] = await Promise.all([
      this.prisma.expense.aggregate({ where, _sum: { amount: true }, _count: true }),
      this.prisma.expense.groupBy({
        by: ['category'],
        where,
        _sum: { amount: true },
        _count: true,
      }),
      this.prisma.expense.groupBy({ by: ['vehicleId'], where, _sum: { amount: true } }),
      this.prisma.$queryRaw<{ month: string; total: Prisma.Decimal }[]>`
        SELECT to_char(expense_date, 'YYYY-MM') AS month, SUM(amount) AS total
        FROM expenses
        WHERE user_id = ${userId}::uuid AND expense_date BETWEEN ${toDbDate(from)}::date AND ${toDbDate(to)}::date ${vehicleFilter}
        GROUP BY 1 ORDER BY 1`,
    ]);
    const zero = new Prisma.Decimal(0);
    return {
      from,
      to,
      total: (total._sum.amount ?? zero).toFixed(2),
      count: total._count,
      byCategory: byCategory
        .map((c) => ({
          category: c.category,
          total: (c._sum.amount ?? zero).toFixed(2),
          count: c._count,
        }))
        .sort((a, b) => Number(b.total) - Number(a.total)),
      byMonth: this.fillMonths(
        from,
        to,
        byMonth.map((m) => ({ month: m.month, total: new Prisma.Decimal(m.total).toFixed(2) })),
      ),
      byVehicle: byVehicle.map((v) => ({
        vehicleId: v.vehicleId,
        total: (v._sum.amount ?? zero).toFixed(2),
      })),
    };
  }

  /** Includes months without expenses (total 0) so charts reflect the full period. */
  private fillMonths(
    from: string,
    to: string,
    rows: { month: string; total: string }[],
  ): { month: string; total: string }[] {
    const map = new Map(rows.map((r) => [r.month, r.total]));
    const result: { month: string; total: string }[] = [];
    let y = Number(from.slice(0, 4));
    let m = Number(from.slice(5, 7));
    const endKey = to.slice(0, 7);
    for (let i = 0; i < 240; i++) {
      const key = `${y}-${String(m).padStart(2, '0')}`;
      result.push({ month: key, total: map.get(key) ?? '0.00' });
      if (key === endKey) break;
      m += 1;
      if (m > 12) {
        m = 1;
        y += 1;
      }
    }
    return result;
  }

  async summary(
    userId: string,
    vehicleId?: string,
  ): Promise<{ monthTotal: string; yearTotal: string }> {
    const today = todayTashkent();
    const base: Prisma.ExpenseWhereInput = { userId, vehicleId };
    const [month, year] = await Promise.all([
      this.prisma.expense.aggregate({
        where: {
          ...base,
          expenseDate: { gte: toDbDate(`${today.slice(0, 7)}-01`), lte: toDbDate(today) },
        },
        _sum: { amount: true },
      }),
      this.prisma.expense.aggregate({
        where: {
          ...base,
          expenseDate: { gte: toDbDate(`${today.slice(0, 4)}-01-01`), lte: toDbDate(today) },
        },
        _sum: { amount: true },
      }),
    ]);
    return {
      monthTotal: (month._sum.amount ?? new Prisma.Decimal(0)).toFixed(2),
      yearTotal: (year._sum.amount ?? new Prisma.Decimal(0)).toFixed(2),
    };
  }
}
