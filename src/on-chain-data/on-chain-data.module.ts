import { Module } from '@nestjs/common';
import { OnChainDataService } from './on-chain-data.service';
import { DaoModule } from 'src/dao/dao.module';

@Module({
  providers: [OnChainDataService],
  imports: [DaoModule],
  exports: [OnChainDataService],
})
export class OnChainDataModule {}
