import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

export interface UserSettings {
  aiSummaryInstructions: string | null;
  excludedSenders: string[];
}

@Injectable()
export class SettingsService {
  constructor(private readonly prisma: PrismaService) {}

  async getSettings(userId: string): Promise<UserSettings> {
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: { aiSummaryInstructions: true, excludedSenders: true },
    });

    return {
      aiSummaryInstructions: user.aiSummaryInstructions,
      excludedSenders: this.parseExcludedSenders(user.excludedSenders),
    };
  }

  async updateSettings(
    userId: string,
    data: Partial<UserSettings>,
  ): Promise<UserSettings> {
    const updated = await this.prisma.user.update({
      where: { id: userId },
      data: {
        ...(data.aiSummaryInstructions !== undefined && {
          aiSummaryInstructions: data.aiSummaryInstructions,
        }),
        ...(data.excludedSenders !== undefined && {
          excludedSenders: JSON.stringify(data.excludedSenders),
        }),
      },
      select: { aiSummaryInstructions: true, excludedSenders: true },
    });

    return {
      aiSummaryInstructions: updated.aiSummaryInstructions,
      excludedSenders: this.parseExcludedSenders(updated.excludedSenders),
    };
  }

  parseExcludedSenders(raw: string): string[] {
    try {
      const parsed = JSON.parse(raw) as unknown;
      if (Array.isArray(parsed)) {
        return parsed.filter((s): s is string => typeof s === 'string');
      }
    } catch {
      // ignore parse errors, return empty array
    }
    return [];
  }
}
