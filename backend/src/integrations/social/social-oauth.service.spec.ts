import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { SocialOAuthService } from './social-oauth.service';

describe('SocialOAuthService', () => {
  const configService = {
    get: jest.fn(),
  } as unknown as ConfigService;

  const service = new SocialOAuthService(
    configService,
    new JwtService({ secret: 'test-secret' }),
  );

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('rejects non read-only or missing scopes', () => {
    expect(() =>
      service.validateReadOnlyScopes(
        'INSTAGRAM',
        'instagram_manage_insights,pages_read_engagement',
      ),
    ).toThrow('Missing required scopes');

    expect(() =>
      service.validateReadOnlyScopes(
        'TIKTOK',
        'user.info.basic,business.data.insights.read,video.upload',
      ),
    ).toThrow('not allowed');
  });

  it('accepts strict read-only scope sets', () => {
    const scopes = service.validateReadOnlyScopes(
      'FACEBOOK',
      'pages_read_engagement,pages_show_list,read_insights',
    );

    expect(scopes).toContain('pages_read_engagement');
    expect(scopes).toContain('read_insights');
  });
});
