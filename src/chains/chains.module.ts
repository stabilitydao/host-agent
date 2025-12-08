import { Global, Module } from '@nestjs/common';
import { ChainsService } from './chains.service';

@Global()
@Module({
  providers: [ChainsService],
  imports: [],
  exports: [ChainsService],
})
export class ChainsModule {}
