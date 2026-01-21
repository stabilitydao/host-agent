import { Module } from '@nestjs/common';
import { TokenHoldersService } from './token-holders.service';

@Module({
  providers: [TokenHoldersService]
})
export class TokenHoldersModule {}
