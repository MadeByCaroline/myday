import { AuthController } from './auth.controller';

describe('AuthController', () => {
  const authService = {
    createGoogleLinkState: jest.fn(),
    createMicrosoftLinkState: jest.fn(),
  };
  const configService = {
    get: jest.fn(),
  };

  const controller = new AuthController(
    authService as any,
    configService as any,
  );

  it('returns role, isPremium and connected accounts in profile response', () => {
    const result = controller.getProfile({
      protocol: 'http',
      get: jest.fn(),
      user: {
        id: 'user-1',
        email: 'admin@example.com',
        name: 'Admin',
        role: 'ADMIN',
        isPremium: true,
        picture: 'https://example.com/pic.png',
        oauthTokens: [],
        emailAccounts: [
          { provider: 'google', emailAddress: 'google@example.com' },
          { provider: 'MICROSOFT', emailAddress: 'outlook@example.com' },
        ],
      },
    });

    expect(result).toEqual({
      id: 'user-1',
      email: 'admin@example.com',
      name: 'Admin',
      role: 'ADMIN',
      isPremium: true,
      picture: 'https://example.com/pic.png',
      connectedGoogleAccounts: ['google@example.com'],
      connectedOutlookAccounts: ['outlook@example.com'],
    });
  });

  it('returns USER role in profile response for non-admin users', () => {
    const result = controller.getProfile({
      protocol: 'http',
      get: jest.fn(),
      user: {
        id: 'user-2',
        email: 'user@example.com',
        name: 'User',
        role: 'USER',
        isPremium: false,
        oauthTokens: [],
        emailAccounts: [],
      },
    });

    expect(result).toEqual({
      id: 'user-2',
      email: 'user@example.com',
      name: 'User',
      role: 'USER',
      isPremium: false,
      connectedGoogleAccounts: [],
      connectedOutlookAccounts: [],
    });
  });
});
