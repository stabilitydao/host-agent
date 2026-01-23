import { Controller, Get } from '@nestjs/common';
import { MemoryService } from './memory.service';
import { MemoryV2Service } from './memory-v2.service';

@Controller()
export class MemoryController {
  constructor(
    private readonly service: MemoryService,
    private readonly serviceV2: MemoryV2Service,
  ) {}
  @Get('builder-memory')
  async getBuilderMemory() {
    return this.service.getBuilderMemory();
  }

  @Get('os-memory')
  async getOSMemory() {
    return this.service.getOSMemory();
  }

  @Get('host-agent-memory')
  async getHostAgentMemory() {
    return this.serviceV2.getHostAgentMemory();
  }
}
