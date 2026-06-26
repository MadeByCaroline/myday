import { ScheduleService } from './schedule.service';

describe('ScheduleService', () => {
  const service = new ScheduleService();

  it('returns valid time blocks when cross-workspace blocks do not overlap', () => {
    const timeBlocks = [
      {
        taskId: 'task-1',
        suggestedStartTime: '09:00',
        suggestedEndTime: '09:30',
        title: 'Write report',
      },
      {
        taskId: 'task-2',
        suggestedStartTime: '09:45',
        suggestedEndTime: '10:15',
        title: 'School pickup prep',
      },
    ];
    const tasks = [
      { id: 'task-1', title: 'Write report', workspaceId: 'work' },
      { id: 'task-2', title: 'School pickup prep', workspaceId: 'family' },
    ];

    expect(service.validateTimeBlocks(timeBlocks, tasks)).toEqual(timeBlocks);
  });

  it('rejects overlapping blocks that belong to different workspaces', () => {
    const timeBlocks = [
      {
        taskId: 'task-1',
        suggestedStartTime: '09:00',
        suggestedEndTime: '10:00',
        title: 'Write report',
      },
      {
        taskId: 'task-2',
        suggestedStartTime: '09:30',
        suggestedEndTime: '10:15',
        title: 'Doctor appointment prep',
      },
    ];
    const tasks = [
      { id: 'task-1', title: 'Write report', workspaceId: 'work' },
      { id: 'task-2', title: 'Doctor appointment prep', workspaceId: 'health' },
    ];

    expect(service.validateTimeBlocks(timeBlocks, tasks)).toEqual([]);
  });
});
