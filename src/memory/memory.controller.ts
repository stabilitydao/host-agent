import { Controller, Get } from '@nestjs/common';
import { MemoryV2Service } from './memory.service';
@Controller()
export class MemoryController {
  constructor(
    private readonly serviceV2: MemoryV2Service,
  ) {}

  @Get('host-agent-memory')
  async getHostAgentMemory() {
    return this.serviceV2.getHostAgentMemory();
  }

   @Get('host-agent-memory-v3')
  async getHostAgentV3Memory() {
    return this.serviceV2.getHostAgentV3Memory();
  }
}
