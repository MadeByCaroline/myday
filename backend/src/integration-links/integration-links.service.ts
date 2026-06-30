import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

export class CreateIntegrationLinkDto {
  type!: 'github' | 'notion';
  sourceId!: string;
  sourceName!: string;
  workspaceId?: string | null;
  config?: Record<string, unknown>;
}

@Injectable()
export class IntegrationLinksService {
  constructor(private readonly prisma: PrismaService) {}

  async listLinks(userId: string, type?: string) {
    return this.prisma.integrationLink.findMany({
      where: {
        userId,
        ...(type ? { type } : {}),
      },
      include: { workspace: { select: { id: true, name: true, color: true } } },
      orderBy: { createdAt: 'desc' },
    });
  }

  async createLink(userId: string, data: CreateIntegrationLinkDto) {
    const sourceId = data.sourceId?.trim();
    const sourceName = data.sourceName?.trim();

    if (!sourceId) {
      throw new BadRequestException('sourceId is required');
    }
    if (!sourceName) {
      throw new BadRequestException('sourceName is required');
    }
    if (data.type !== 'github' && data.type !== 'notion') {
      throw new BadRequestException('type must be "github" or "notion"');
    }

    if (data.workspaceId) {
      const workspace = await this.prisma.workspace.findFirst({
        where: { id: data.workspaceId, userId },
      });
      if (!workspace) {
        throw new NotFoundException('Workspace not found');
      }
    }

    return this.prisma.integrationLink.upsert({
      where: {
        userId_type_sourceId: { userId, type: data.type, sourceId },
      },
      update: {
        sourceName,
        workspaceId: data.workspaceId ?? null,
        config: JSON.stringify(data.config ?? {}),
        active: true,
      },
      create: {
        userId,
        type: data.type,
        sourceId,
        sourceName,
        workspaceId: data.workspaceId ?? null,
        config: JSON.stringify(data.config ?? {}),
        active: true,
      },
      include: { workspace: { select: { id: true, name: true, color: true } } },
    });
  }

  async deleteLink(linkId: string, userId: string) {
    const link = await this.prisma.integrationLink.findFirst({
      where: { id: linkId, userId },
    });

    if (!link) {
      throw new NotFoundException('Integration link not found');
    }

    await this.prisma.integrationLink.delete({ where: { id: linkId } });

    return { deleted: true };
  }
}
