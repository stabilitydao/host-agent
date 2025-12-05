import { Module } from '@nestjs/common';
import { DaoFactory } from './dao-factory';
import { HttpModule } from '@nestjs/axios';

@Module({
  imports: [HttpModule],
  providers: [DaoFactory],
  exports: [DaoFactory],
})
export class DaoModule {}
