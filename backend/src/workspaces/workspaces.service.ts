import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

const DEFAULT_WORKSPACE = {
  name: 'Personnel',
  color: '#6366F1',
  icon: 'pi pi-home',
};

@Injectable()
export class WorkspacesService {
  constructor(private readonly prisma: PrismaService) {}

  async listWorkspaces(userId: string) {
    await this.ensureDefaultWorkspace(userId);

    return this.prisma.workspace.findMany({
      where: { userId },
      orderBy: { createdAt: 'asc' },
    });
  }

  async createWorkspace(
    userId: string,
    data: { name: string; color?: string; icon?: string },
  ) {
    const workspaceData = this.normalizeWorkspaceInput(data);
    const { name, color, icon } = workspaceData;

    return this.prisma.workspace.create({
      data: {
        userId,
        name: name || DEFAULT_WORKSPACE.name,
        color: color || DEFAULT_WORKSPACE.color,
        icon: icon || DEFAULT_WORKSPACE.icon,
      },
    });
  }

  async updateWorkspace(
    workspaceId: string,
    userId: string,
    data: { name?: string; color?: string; icon?: string },
  ) {
    await this.getWorkspaceOrThrow(workspaceId, userId);

    const workspaceData = this.normalizeWorkspaceInput(data, true);
    if (Object.keys(workspaceData).length === 0) {
      throw new BadRequestException(
        'At least one field (name, color, or icon) must be provided for update.',
      );
    }

    return this.prisma.workspace.update({
      where: { id: workspaceId },
      data: workspaceData,
    });
  }

  async deleteWorkspace(workspaceId: string, userId: string) {
    const workspaces = await this.prisma.workspace.findMany({
      where: { userId },
      orderBy: { createdAt: 'asc' },
    });
    const workspace = workspaces.find((entry) => entry.id === workspaceId);

    if (!workspace) {
      throw new NotFoundException('Workspace not found.');
    }

    if (workspaces.length <= 1) {
      throw new BadRequestException(
        'Cannot delete the last workspace. At least one workspace must exist.',
      );
    }

    const fallbackWorkspace = workspaces.find((entry) => entry.id !== workspaceId);
    if (!fallbackWorkspace) {
      throw new BadRequestException('A fallback workspace is required to delete this workspace.');
    }

    await this.prisma.$transaction([
      this.prisma.task.updateMany({
        where: { userId, workspaceId },
        data: { workspaceId: fallbackWorkspace.id },
      }),
      this.prisma.oAuthToken.updateMany({
        where: { userId, workspaceId },
        data: { workspaceId: fallbackWorkspace.id },
      }),
      this.prisma.workspace.delete({
        where: { id: workspaceId },
      }),
    ]);

    return {
      deletedWorkspaceId: workspaceId,
      reassignedToWorkspaceId: fallbackWorkspace.id,
    };
  }

  async resolveWorkspaceId(userId: string, workspaceId?: string | null) {
    if (workspaceId) {
      const workspace = await this.prisma.workspace.findFirst({
        where: { id: workspaceId, userId },
        select: { id: true },
      });

      if (!workspace) {
        throw new NotFoundException('Workspace not found.');
      }

      return workspace.id;
    }

    const defaultWorkspace = await this.ensureDefaultWorkspace(userId);
    return defaultWorkspace.id;
  }

  async ensureDefaultWorkspace(userId: string) {
    let workspace = await this.prisma.workspace.findFirst({
      where: { userId },
      orderBy: { createdAt: 'asc' },
    });

    if (!workspace) {
      workspace = await this.prisma.workspace.create({
        data: {
          userId,
          ...DEFAULT_WORKSPACE,
        },
      });
    }

    await this.prisma.$transaction([
      this.prisma.task.updateMany({
        where: { userId, workspaceId: null },
        data: { workspaceId: workspace.id },
      }),
      this.prisma.oAuthToken.updateMany({
        where: { userId, workspaceId: null },
        data: { workspaceId: workspace.id },
      }),
    ]);

    return workspace;
  }

  private async getWorkspaceOrThrow(workspaceId: string, userId: string) {
    const workspace = await this.prisma.workspace.findFirst({
      where: { id: workspaceId, userId },
    });

    if (!workspace) {
      throw new NotFoundException('Workspace not found.');
    }

    return workspace;
  }

  private normalizeWorkspaceInput(
    data: { name?: string; color?: string; icon?: string },
    partial = false,
  ) {
    const normalizedName = data.name?.trim();
    const normalizedColor = data.color?.trim();
    const normalizedIcon = data.icon?.trim();

    if (!partial && !normalizedName) {
      throw new BadRequestException('Workspace name is required.');
    }

    if (data.name !== undefined && !normalizedName) {
      throw new BadRequestException('Workspace name cannot be empty.');
    }

    return {
      ...(normalizedName ? { name: normalizedName } : {}),
      ...this.normalizeOptionalWorkspaceField(
        'color',
        normalizedColor,
        DEFAULT_WORKSPACE.color,
        partial,
      ),
      ...this.normalizeOptionalWorkspaceField(
        'icon',
        normalizedIcon,
        DEFAULT_WORKSPACE.icon,
        partial,
      ),
    };
  }

  private normalizeOptionalWorkspaceField(
    field: 'color' | 'icon',
    value: string | undefined,
    fallback: string,
    partial: boolean,
  ) {
    if (value) {
      return { [field]: value };
    }

    if (partial) {
      return {};
    }

    return { [field]: fallback };
  }
}
