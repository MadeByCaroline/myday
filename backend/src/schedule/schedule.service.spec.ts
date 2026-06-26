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

  it('allows overlapping blocks when they belong to the same workspace', () => {
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
        title: 'Review PR',
      },
    ];
    const tasks = [
      { id: 'task-1', title: 'Write report', workspaceId: 'work' },
      { id: 'task-2', title: 'Review PR', workspaceId: 'work' },
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

  it('rejects cross-workspace switches without a 15-minute buffer', () => {
    const timeBlocks = [
      {
        taskId: 'task-1',
        suggestedStartTime: '09:00',
        suggestedEndTime: '09:30',
        title: 'Write report',
      },
      {
        taskId: 'task-2',
        suggestedStartTime: '09:40',
        suggestedEndTime: '10:10',
        title: 'School pickup prep',
      },
    ];
    const tasks = [
      { id: 'task-1', title: 'Write report', workspaceId: 'work' },
      { id: 'task-2', title: 'School pickup prep', workspaceId: 'family' },
    ];

    expect(service.validateTimeBlocks(timeBlocks, tasks)).toEqual([]);
  });

  it('rejects malformed or unresolvable time blocks', () => {
    expect(
      service.validateTimeBlocks(
        [
          {
            taskId: 'task-1',
            suggestedStartTime: '09:00',
            suggestedEndTime: '09:00',
            title: 'Zero duration task',
          },
        ],
        [{ id: 'task-1', title: 'Zero duration task', workspaceId: 'work' }],
      ),
    ).toEqual([]);

    expect(
      service.validateTimeBlocks(
        [
          {
            taskId: 'task-1',
            suggestedStartTime: '9am',
            suggestedEndTime: '10:00',
            title: 'Bad format task',
          },
        ],
        [{ id: 'task-1', title: 'Bad format task', workspaceId: 'work' }],
      ),
    ).toEqual([]);

    expect(
      service.validateTimeBlocks(
        [
          {
            taskId: 'missing-task',
            suggestedStartTime: '09:00',
            suggestedEndTime: '10:00',
            title: 'Missing task',
          },
        ],
        [],
      ),
    ).toEqual([]);
  });

  it('does not reject overlaps when workspace ids are missing', () => {
    const timeBlocks = [
      {
        taskId: 'task-1',
        suggestedStartTime: '09:00',
        suggestedEndTime: '10:00',
        title: 'Unassigned task 1',
      },
      {
        taskId: 'task-2',
        suggestedStartTime: '09:15',
        suggestedEndTime: '10:15',
        title: 'Unassigned task 2',
      },
    ];
    const tasks = [
      { id: 'task-1', title: 'Unassigned task 1', workspaceId: null },
      { id: 'task-2', title: 'Unassigned task 2', workspaceId: null },
    ];

    expect(service.validateTimeBlocks(timeBlocks, tasks)).toEqual(timeBlocks);
  });
});
