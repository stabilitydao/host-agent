import { Injectable, Logger } from '@nestjs/common';
import { daos, IDAOData } from '@stabilitydao/host';
import * as fs from 'fs';
import * as path from 'path';
import { createCanvas, loadImage } from 'canvas';

@Injectable()
export class ToolsService {
  private readonly tempDir = './temp/dao-images';
  private readonly logoPrefix =
    'https://raw.githubusercontent.com/stabilitydao/.github/main/tokens/';

  private readonly daos: IDAOData[];
  private readonly logger = new Logger(ToolsService.name);
  constructor() {
    this.daos = daos;
    if (!fs.existsSync(this.tempDir)) {
      fs.mkdirSync(this.tempDir, { recursive: true });
    }
  }

  async drawImages() {
    for (const dao of this.daos) {
      const logoUrl = dao.images?.daoToken || dao.images?.token;

      if (!logoUrl) {
        this.logger.warn(`No logo found for ${dao.name} DAO`);
        continue;
      }

      try {
        const canvas = createCanvas(800, 400);
        const ctx = canvas.getContext('2d');

        ctx.fillStyle = '##0D1117';
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        const logo = await loadImage(this.getLogoUrl(logoUrl));
        if (!logo) {
          this.logger.warn(`No logo found for ${dao.name} DAO`);
          continue;
        }

        const logoSize = 200;
        const logoX = (canvas.width - logoSize) / 2;
        const logoY = 50;
        ctx.drawImage(logo, logoX, logoY, logoSize, logoSize);

        ctx.fillStyle = '#FAFAFA';
        ctx.font = 'bold 48px Arial';
        ctx.textAlign = 'center';
        ctx.fillText(dao.symbol, canvas.width / 2, logoY + logoSize + 60);

        ctx.font = '36px Arial';
        ctx.fillText(
          `${dao.name} DAO`,
          canvas.width / 2,
          logoY + logoSize + 120,
        );

        const buffer = canvas.toBuffer('image/png');
        const fileName = `${dao.symbol.toLowerCase()}-dao.png`;

        const filePath = path.join(this.tempDir, fileName);
        fs.writeFileSync(filePath, buffer);

        this.logger.log(`Generated image for ${dao.name} DAO: ${filePath}`);
      } catch (error) {
        this.logger.error(`Error generating image for ${dao.name} DAO:`, error);
      }
    }
  }

  private getLogoUrl(logo: string) {
    return `${this.logoPrefix}${logo}`;
  }
}
