import { Module } from '@nestjs/common';
import { ToolsService } from './tools.service';
import { ToolsCommand } from './tools.command';

@Module({
  providers: [ToolsService, ToolsCommand],
})
export class ToolsModule {}
