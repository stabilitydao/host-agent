import { Module } from '@nestjs/common';
import { GithubCommand } from './github.command';
import { GithubController } from './github.controller';
import { GithubService } from './github.service';

@Module({
  controllers: [GithubController],
  providers: [GithubService, GithubCommand],
  exports: [GithubService],
})
export class GithubModule {}
