import { TasksController } from './tasks.controller';

describe('TasksController', () => {
  const mockUser = { id: 'user-1' };

  function makeController(service: Partial<any>) {
    return new TasksController(service as any);
  }

  describe('getTasks', () => {
    it('returns tasks for the authenticated user', async () => {
      const tasks = [{ id: 't1', title: 'Buy milk' }];
      const service = { getUserTasks: jest.fn().mockResolvedValue(tasks) };
      const controller = makeController(service);

      const result = await controller.getTasks({ user: mockUser });

      expect(service.getUserTasks).toHaveBeenCalledWith('user-1');
      expect(result).toEqual(tasks);
    });
  });

  describe('createTask', () => {
    it('creates a task for the authenticated user', async () => {
      const created = { id: 't2', title: 'Walk dog', source: 'MANUAL' };
      const service = { createTask: jest.fn().mockResolvedValue(created) };
      const controller = makeController(service);

      const result = await controller.createTask(
        { user: mockUser },
        { title: 'Walk dog' },
      );

      expect(service.createTask).toHaveBeenCalledWith('user-1', {
        title: 'Walk dog',
      });
      expect(result).toEqual(created);
    });
  });

  describe('updateTask', () => {
    it('delegates update to the service with userId and taskId', async () => {
      const service = { updateTask: jest.fn().mockResolvedValue({ count: 1 }) };
      const controller = makeController(service);

      await controller.updateTask({ user: mockUser }, 't3', {
        status: 'IN_PROGRESS',
      });

      expect(service.updateTask).toHaveBeenCalledWith('t3', 'user-1', {
        status: 'IN_PROGRESS',
      });
    });
  });

  describe('deleteTask', () => {
    it('delegates deletion to the service with userId and taskId', async () => {
      const service = { deleteTask: jest.fn().mockResolvedValue({ count: 1 }) };
      const controller = makeController(service);

      await controller.deleteTask({ user: mockUser }, 't4');

      expect(service.deleteTask).toHaveBeenCalledWith('t4', 'user-1');
    });
  });
});
