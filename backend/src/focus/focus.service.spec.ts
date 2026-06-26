import { BadRequestException } from '@nestjs/common';
import { FocusService } from './focus.service';

describe('FocusService', () => {
  let usersService: {
    getOAuthTokens: jest.Mock;
  };
  let googleService: {
    createBusyEvent: jest.Mock;
    deleteBusyEvent: jest.Mock;
  };
  let microsoftService: {
    createBusyEvent: jest.Mock;
    deleteBusyEvent: jest.Mock;
  };
  let service: FocusService;

  beforeEach(() => {
    usersService = {
      getOAuthTokens: jest.fn(),
    };
    googleService = {
      createBusyEvent: jest.fn(),
      deleteBusyEvent: jest.fn(),
    };
    microsoftService = {
      createBusyEvent: jest.fn(),
      deleteBusyEvent: jest.fn(),
    };
    service = new FocusService(
      usersService as any,
      googleService as any,
      microsoftService as any,
    );
  });

  it('creates busy events for connected providers when deep work starts', async () => {
    usersService.getOAuthTokens.mockResolvedValue([
      {
        provider: 'google',
        email: 'caroline@gmail.com',
        accessToken: 'google-token',
        refreshToken: 'google-refresh',
      },
      {
        provider: 'MICROSOFT',
        email: 'caroline@outlook.com',
        accessToken: 'microsoft-token',
      },
    ]);
    googleService.createBusyEvent.mockResolvedValue('google-event');
    microsoftService.createBusyEvent.mockResolvedValue('microsoft-event');

    const result = await service.startDeepWork('user-1', 90);

    expect(googleService.createBusyEvent).toHaveBeenCalledWith(
      'google-token',
      'google-refresh',
      expect.any(Date),
      expect.any(Date),
      expect.stringContaining('I am currently in a deep work session until'),
    );
    expect(microsoftService.createBusyEvent).toHaveBeenCalledWith(
      'microsoft-token',
      expect.any(Date),
      expect.any(Date),
      expect.stringContaining('I am currently in a deep work session until'),
    );
    expect(result).toEqual({
      active: true,
      startedAt: expect.any(Date),
      endsAt: expect.any(Date),
      durationMinutes: 90,
      providers: ['GOOGLE', 'MICROSOFT'],
    });
    expect(service.getCurrentDeepWork('user-1')).toEqual({
      active: true,
      startedAt: expect.any(Date),
      endsAt: expect.any(Date),
      durationMinutes: 90,
      providers: ['GOOGLE', 'MICROSOFT'],
    });
  });

  it('deletes created busy events when deep work stops', async () => {
    usersService.getOAuthTokens.mockResolvedValue([
      {
        provider: 'google',
        email: 'caroline@gmail.com',
        accessToken: 'google-token',
        refreshToken: 'google-refresh',
      },
      {
        provider: 'MICROSOFT',
        email: 'caroline@outlook.com',
        accessToken: 'microsoft-token',
      },
    ]);
    googleService.createBusyEvent.mockResolvedValue('google-event');
    microsoftService.createBusyEvent.mockResolvedValue('microsoft-event');

    await service.startDeepWork('user-1', 45);
    const result = await service.stopDeepWork('user-1');

    expect(googleService.deleteBusyEvent).toHaveBeenCalledWith(
      'google-token',
      'google-refresh',
      'google-event',
    );
    expect(microsoftService.deleteBusyEvent).toHaveBeenCalledWith(
      'microsoft-token',
      'microsoft-event',
    );
    expect(result).toEqual({ active: false });
    expect(service.getCurrentDeepWork('user-1')).toEqual({ active: false });
  });

  it('rejects invalid deep work durations', async () => {
    await expect(service.startDeepWork('user-1', 0)).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });
});
