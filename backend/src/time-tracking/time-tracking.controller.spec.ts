import { TimeTrackingController } from './time-tracking.controller';

describe('TimeTrackingController', () => {
  const mockUser = { id: 'user-1' };

  function makeController(service: Partial<any>) {
    return new TimeTrackingController(service as any);
  }

  it('returns the current timer for the authenticated user', async () => {
    const entry = { id: 'entry-1' };
    const service = { getCurrentEntry: jest.fn().mockResolvedValue(entry) };
    const controller = makeController(service);

    const result = await controller.getCurrentTimer({ user: mockUser });

    expect(service.getCurrentEntry).toHaveBeenCalledWith('user-1');
    expect(result).toEqual(entry);
  });

  it('starts a timer for the authenticated user and task', async () => {
    const entry = { id: 'entry-2', taskId: 'task-1' };
    const service = { startTimer: jest.fn().mockResolvedValue(entry) };
    const controller = makeController(service);

    const result = await controller.startTimer({ user: mockUser }, 'task-1');

    expect(service.startTimer).toHaveBeenCalledWith('user-1', 'task-1');
    expect(result).toEqual(entry);
  });

  it('stops a timer for the authenticated user and entry', async () => {
    const entry = { id: 'entry-3', duration: 120 };
    const service = { stopTimer: jest.fn().mockResolvedValue(entry) };
    const controller = makeController(service);

    const result = await controller.stopTimer({ user: mockUser }, 'entry-3');

    expect(service.stopTimer).toHaveBeenCalledWith('user-1', 'entry-3');
    expect(result).toEqual(entry);
  });
});
