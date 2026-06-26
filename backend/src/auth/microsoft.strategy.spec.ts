import { ConfigService } from '@nestjs/config';
import type { Request } from 'express';
import { MicrosoftStrategy } from './microsoft.strategy';

describe('MicrosoftStrategy', () => {
  const configService = {
    getOrThrow: jest.fn().mockReturnValue('test-value'),
  } as unknown as ConfigService;

  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('returns the Microsoft OAuth payload for NestJS Passport', async () => {
    const nowSpy = jest.spyOn(Date, 'now').mockReturnValue(1_700_000_000_000);
    const strategy = new MicrosoftStrategy(configService);

    await expect(
      strategy.validate(
        {
          query: { state: 'link-state' },
        } as Request,
        'access-token',
        'refresh-token',
        {
          expires_in: '3600',
          scope: 'user.read mail.read offline_access',
        },
        {
          displayName: 'Test User',
          emails: [{ value: 'user@example.com' }],
        },
      ),
    ).resolves.toEqual({
      email: 'user@example.com',
      name: 'Test User',
      accessToken: 'access-token',
      refreshToken: 'refresh-token',
      expiresAt: new Date(1_700_003_600_000),
      scope: 'user.read mail.read offline_access',
      state: 'link-state',
    });

    nowSpy.mockRestore();
  });

  it('throws when Microsoft does not provide an email', async () => {
    const strategy = new MicrosoftStrategy(configService);

    await expect(
      strategy.validate(
        {
          query: {},
        } as Request,
        'access-token',
        'refresh-token',
        {},
        {
          displayName: 'Test User',
        },
      ),
    ).rejects.toThrow('Microsoft account email was not provided.');
  });

  it('uses _json.userPrincipalName when emails and mail are missing', async () => {
    const strategy = new MicrosoftStrategy(configService);

    await expect(
      strategy.validate(
        {
          query: {},
        } as Request,
        'access-token',
        'refresh-token',
        {},
        {
          displayName: 'Test User',
          _json: { userPrincipalName: 'upn-json@example.com' },
        },
      ),
    ).resolves.toMatchObject({
      email: 'upn-json@example.com',
    });
  });

  it('uses profile.userPrincipalName as final fallback', async () => {
    const strategy = new MicrosoftStrategy(configService);

    await expect(
      strategy.validate(
        {
          query: {},
        } as Request,
        'access-token',
        'refresh-token',
        {},
        {
          displayName: 'Test User',
          userPrincipalName: 'upn-profile@example.com',
        },
      ),
    ).resolves.toMatchObject({
      email: 'upn-profile@example.com',
    });
  });
});
