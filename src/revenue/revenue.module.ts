import { Module } from '@nestjs/common';
import { RevenueService } from './revenue.service';
import { DaoModule } from 'src/dao/dao.module';

@Module({
  providers: [RevenueService],
  imports: [DaoModule],
  exports: [RevenueService],
})
export class RevenueModule {}
