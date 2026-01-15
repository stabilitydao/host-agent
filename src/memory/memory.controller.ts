import { Controller, Get } from '@nestjs/common';
import { MemoryService } from './memory.service';

@Controller()
export class MemoryController {
  constructor(private readonly service: MemoryService) {}
  @Get('builder-memory')
  async getBuilderMemory() {
    return this.service.getBuilderMemory();
  }

  @Get('os-memory')
  async getOSMemory() {
    return this.service.getOSMemory();
  }
}
