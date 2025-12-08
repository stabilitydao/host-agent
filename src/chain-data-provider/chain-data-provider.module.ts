import { Module } from '@nestjs/common';
import { DefiLlamaService } from './defilama.service';
import { DexscreenerService } from './dexscreener.service';
import { HttpModule } from '@nestjs/axios';

@Module({
  providers: [DefiLlamaService, DexscreenerService],
  imports: [HttpModule],
  exports: [DefiLlamaService, DexscreenerService],
})
export class ChainDataProviderModule {}
