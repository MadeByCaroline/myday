import { AuthService } from './auth.service';

describe('AuthService', () => {
  const mockJwtService = {
    sign: jest.fn(),
    signAsync: jest.fn(),
    verifyAsync: jest.fn(),
  };

  function createAuthService(usersService: Partial<any>) {
    return new AuthService(usersService as any, mockJwtService as any);
  }

  it('returns OAuth connections with normalized provider names', async () => {
    const usersService = {
      getEmailAccounts: jest.fn().mockResolvedValue([
        {
          id: 'g-1',
          provider: 'GOOGLE',
          emailAddress: 'user@gmail.com',
          label: 'Personal',
          expiresAt: null,
        },
        {
          id: 'm-1',
          provider: 'MICROSOFT',
          emailAddress: 'user@outlook.com',
          label: 'Work',
          expiresAt: new Date(Date.now() + 60_000),
        },
      ]),
    };
    const service = createAuthService(usersService);

    await expect(service.getConnections('user-1')).resolves.toEqual([
      {
        id: 'g-1',
        provider: 'GOOGLE',
        emailAddress: 'user@gmail.com',
        label: 'Personal',
        status: 'ACTIVE',
      },
      {
        id: 'm-1',
        provider: 'MICROSOFT',
        emailAddress: 'user@outlook.com',
        label: 'Work',
        status: 'ACTIVE',
      },
    ]);
  });

  it('disconnects an account by id', async () => {
    const usersService = {
      disconnectEmailAccount: jest.fn().mockResolvedValue({ id: 'account-1' }),
    };
    const service = createAuthService(usersService);

    await service.disconnectConnection('user-1', 'account-1');

    expect(usersService.disconnectEmailAccount).toHaveBeenCalledWith(
      'user-1',
      'account-1',
    );
  });

  it('marks OAuth accounts as expired when token is expired', async () => {
    const usersService = {
      getEmailAccounts: jest.fn().mockResolvedValue([
        {
          id: 'm-1',
          provider: 'MICROSOFT',
          emailAddress: 'user@outlook.com',
          label: 'Work',
          expiresAt: new Date(Date.now() - 60_000),
        },
      ]),
    };
    const service = createAuthService(usersService);

    await expect(service.getConnections('user-1')).resolves.toEqual([
      {
        id: 'm-1',
        provider: 'MICROSOFT',
        emailAddress: 'user@outlook.com',
        label: 'Work',
        status: 'EXPIRED',
      },
    ]);
  });
});
