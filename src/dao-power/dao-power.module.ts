import { Module } from '@nestjs/common';
import { DaoPowerService } from './dao-power.service';
import { TokenHoldersModule } from 'src/token-holders/token-holders.module';
import { TxSenderModule } from 'src/tx-sender/tx-sender.module';

@Module({
  imports: [TokenHoldersModule, TxSenderModule],
  providers: [DaoPowerService],
})
export class DaoPowerModule {}
