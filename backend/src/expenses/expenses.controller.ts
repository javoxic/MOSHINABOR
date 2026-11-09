import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser, type AuthUser } from '../common/decorators/auth.decorators';
import {
  CreateExpenseDto,
  ExpenseQueryDto,
  ExpenseStatsQueryDto,
  UpdateExpenseDto,
} from './dto/expenses.dto';
import { ExpensesService } from './expenses.service';

@ApiTags('Expenses')
@ApiBearerAuth()
@Controller({ path: 'expenses', version: '1' })
export class ExpensesController {
  constructor(private readonly expenses: ExpensesService) {}

  @Get()
  @ApiOperation({
    summary: 'List expenses with filters (includes total amount of the filtered set)',
  })
  list(@CurrentUser() user: AuthUser, @Query() q: ExpenseQueryDto) {
    return this.expenses.list(user.id, q);
  }

  @Get('stats')
  @ApiOperation({ summary: 'Expense statistics by category, month and vehicle' })
  stats(@CurrentUser() user: AuthUser, @Query() q: ExpenseStatsQueryDto) {
    return this.expenses.stats(user.id, q);
  }

  @Post()
  @ApiOperation({ summary: 'Add an expense' })
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateExpenseDto) {
    return this.expenses.create(user.id, dto);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Expense details' })
  get(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.expenses.get(user.id, id);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Edit an expense (not for expenses created from service records)' })
  update(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateExpenseDto,
  ) {
    return this.expenses.update(user.id, id, dto);
  }

  @Delete(':id')
  @HttpCode(204)
  @ApiOperation({ summary: 'Delete an expense' })
  async remove(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<void> {
    await this.expenses.remove(user.id, id);
  }
}
