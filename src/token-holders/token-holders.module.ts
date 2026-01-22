import { Module } from '@nestjs/common';
import { TokenHoldersService } from './token-holders.service';

@Module({
  providers: [TokenHoldersService],
  exports: [TokenHoldersService],
})
export class TokenHoldersModule {}
