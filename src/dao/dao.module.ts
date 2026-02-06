import { Module } from '@nestjs/common';
import { DaoFactory } from './dao-factory';
import { HttpModule } from '@nestjs/axios';
import { AnalyticsModule } from 'src/analytics/analytics.module';

@Module({
  imports: [HttpModule, AnalyticsModule],
  providers: [DaoFactory],
  exports: [DaoFactory],
})
export class DaoModule {}
