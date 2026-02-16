import { Controller, Get } from '@nestjs/common';
import { MemoryV2Service } from './memory.service';
@Controller()
export class MemoryController {
  constructor(private readonly serviceV2: MemoryV2Service) {}

  @Get('host-agent-memory')
  async getHostAgentMemory() {
    return this.serviceV2.getHostAgentV3Memory();
  }

  @Get('host-agent-memory')
  async getHostAgentV3Memory() {
    return this.serviceV2.getHostAgentV3Memory();
  }
}
