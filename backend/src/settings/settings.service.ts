import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

export interface UserSettings {
  theme: string;
  aiSummaryInstructions: string | null;
  excludedSenders: string[];
}

const SUPPORTED_THEMES = new Set(['light', 'dark', 'zen']);

@Injectable()
export class SettingsService {
  constructor(private readonly prisma: PrismaService) {}

  async getSettings(userId: string): Promise<UserSettings> {
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: {
        theme: true,
        aiSummaryInstructions: true,
        excludedSenders: true,
      },
    });

    return {
      theme: this.normalizeTheme(user.theme),
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
        ...(data.theme !== undefined && {
          theme: this.normalizeTheme(data.theme),
        }),
        ...(data.aiSummaryInstructions !== undefined && {
          aiSummaryInstructions: data.aiSummaryInstructions,
        }),
        ...(data.excludedSenders !== undefined && {
          excludedSenders: JSON.stringify(data.excludedSenders),
        }),
      },
      select: {
        theme: true,
        aiSummaryInstructions: true,
        excludedSenders: true,
      },
    });

    return {
      theme: this.normalizeTheme(updated.theme),
      aiSummaryInstructions: updated.aiSummaryInstructions,
      excludedSenders: this.parseExcludedSenders(updated.excludedSenders),
    };
  }

  private parseExcludedSenders(raw: string): string[] {
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

  private normalizeTheme(theme: string | null | undefined): string {
    return theme && SUPPORTED_THEMES.has(theme) ? theme : 'light';
  }
}
