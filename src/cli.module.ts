import { Module, ModuleMetadata } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { CommandModule } from 'nestjs-command';
import { Commands, config } from './config/config';
import { commandArg } from './utils/getCommandArg';
import { GithubModule } from './github/github.module';
import { ToolsModule } from './tools/tools.module';

const imports: ModuleMetadata['imports'] = [
  ConfigModule.forRoot({ isGlobal: true, load: [config] }),
  CommandModule,
  ToolsModule,
];
if (commandArg() === Commands.SYNC_LABELS) imports.push(GithubModule);

@Module({
  imports,
})
export class CliModule {}
