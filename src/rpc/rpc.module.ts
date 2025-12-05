import { Global, Module } from '@nestjs/common';
import { RpcService } from './rpc.service';

@Global()
@Module({
  providers: [RpcService],
  exports: [RpcService],
})
export class RpcModule {}
