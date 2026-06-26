import { AuthService } from './auth.service';

describe('AuthService', () => {
  const mockJwtService = {
    sign: jest.fn(),
    signAsync: jest.fn(),
    verifyAsync: jest.fn(),
  };

  function makeService(usersService: Partial<any>) {
    return new AuthService(usersService as any, mockJwtService as any);
  }

  it('returns OAuth connections with normalized provider names', async () => {
    const usersService = {
      getOAuthTokens: jest.fn().mockResolvedValue([
        { provider: 'google', email: 'user@gmail.com' },
        { provider: 'MICROSOFT', email: 'user@outlook.com' },
      ]),
    };
    const service = makeService(usersService);

    await expect(service.getConnections('user-1')).resolves.toEqual([
      { provider: 'GOOGLE', email: 'user@gmail.com' },
      { provider: 'MICROSOFT', email: 'user@outlook.com' },
    ]);
  });

  it('disconnects Google regardless of stored casing', async () => {
    const usersService = {
      deleteOAuthTokens: jest.fn().mockResolvedValue({ count: 1 }),
    };
    const service = makeService(usersService);

    await service.disconnectConnection('user-1', 'GOOGLE');

    expect(usersService.deleteOAuthTokens).toHaveBeenCalledWith('user-1', [
      'google',
      'GOOGLE',
    ]);
  });

  it('disconnects Microsoft regardless of stored casing', async () => {
    const usersService = {
      deleteOAuthTokens: jest.fn().mockResolvedValue({ count: 1 }),
    };
    const service = makeService(usersService);

    await service.disconnectConnection('user-1', 'microsoft');

    expect(usersService.deleteOAuthTokens).toHaveBeenCalledWith('user-1', [
      'MICROSOFT',
      'microsoft',
    ]);
  });
});
