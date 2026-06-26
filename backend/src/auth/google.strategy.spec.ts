import { ConfigService } from '@nestjs/config';
import { GoogleStrategy } from './google.strategy';

const strategyConstructorSpy = jest.fn();

jest.mock('passport-google-oauth20', () => {
  class MockStrategy {
    constructor(...args: unknown[]) {
      strategyConstructorSpy(...args);
    }
  }

  return {
    Strategy: MockStrategy,
  };
});

describe('GoogleStrategy', () => {
  it('requests offline access with consent prompt', () => {
    const configService = {
      getOrThrow: jest
        .fn()
        .mockReturnValueOnce('google-client-id')
        .mockReturnValueOnce('google-client-secret')
        .mockReturnValueOnce('http://localhost:3000/auth/google/callback'),
    } as unknown as ConfigService;

    new GoogleStrategy(configService);

    expect(strategyConstructorSpy).toHaveBeenCalled();
    expect(strategyConstructorSpy.mock.calls[0][0]).toMatchObject({
      clientID: 'google-client-id',
      clientSecret: 'google-client-secret',
      callbackURL: 'http://localhost:3000/auth/google/callback',
      accessType: 'offline',
      prompt: 'consent',
    });
  });
});
