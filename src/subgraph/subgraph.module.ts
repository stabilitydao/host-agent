import { Global, Module } from '@nestjs/common';
import { SubgraphService } from './subgraph.service';
import { HttpModule } from '@nestjs/axios';

@Global()
@Module({
  imports: [HttpModule],
  providers: [SubgraphService],
  exports: [SubgraphService],
})
export class SubgraphModule {}
