import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { PremiumGuard } from './premium.guard';

function makeContext(user: { isPremium: boolean; role: string }) {
  const request = { user };
  return {
    switchToHttp: () => ({ getRequest: () => request }),
    getClass: jest.fn(),
    getHandler: jest.fn(),
  } as unknown as ExecutionContext;
}

describe('PremiumGuard', () => {
  let guard: PremiumGuard;

  beforeEach(() => {
    guard = new PremiumGuard();
    // Bypass JwtAuthGuard base behaviour by resolving immediately
    jest
      .spyOn(Object.getPrototypeOf(PremiumGuard.prototype), 'canActivate')
      .mockResolvedValue(true);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('allows premium users', async () => {
    const ctx = makeContext({ isPremium: true, role: 'USER' });
    await expect(guard.canActivate(ctx)).resolves.toBe(true);
  });

  it('allows admin users regardless of isPremium', async () => {
    const ctx = makeContext({ isPremium: false, role: 'ADMIN' });
    await expect(guard.canActivate(ctx)).resolves.toBe(true);
  });

  it('throws ForbiddenException for non-premium, non-admin users', async () => {
    const ctx = makeContext({ isPremium: false, role: 'USER' });
    await expect(guard.canActivate(ctx)).rejects.toThrow(ForbiddenException);
  });
});
