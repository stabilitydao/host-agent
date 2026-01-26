import { Command } from 'nestjs-command';
import { Injectable } from '@nestjs/common';
import { ToolsService } from './tools.service';

@Injectable()
export class ToolsCommand {
  constructor(private readonly toolsService: ToolsService) {}

  @Command({
    command: 'draw:dao-images',
  })
  async drawDaoImages(): Promise<void> {
    return this.toolsService.drawImages();
  }
}
