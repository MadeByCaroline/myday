import { AuthController } from './auth.controller';

describe('AuthController', () => {
  const authService = {
    createGoogleLinkState: jest.fn(),
    createMicrosoftLinkState: jest.fn(),
  };
  const configService = {
    get: jest.fn(),
  };

  const controller = new AuthController(authService as any, configService as any);

  it('returns role and connected accounts in profile response', () => {
    const result = controller.getProfile({
      protocol: 'http',
      get: jest.fn(),
      user: {
        id: 'user-1',
        email: 'admin@example.com',
        name: 'Admin',
        role: 'ADMIN',
        picture: 'https://example.com/pic.png',
        oauthTokens: [
          { provider: 'google', email: 'google@example.com' },
          { provider: 'MICROSOFT', email: 'outlook@example.com' },
        ],
      },
    });

    expect(result).toEqual({
      id: 'user-1',
      email: 'admin@example.com',
      name: 'Admin',
      role: 'ADMIN',
      picture: 'https://example.com/pic.png',
      connectedGoogleAccounts: ['google@example.com'],
      connectedOutlookAccounts: ['outlook@example.com'],
    });
  });
});
