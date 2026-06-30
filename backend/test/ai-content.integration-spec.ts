import { ExecutionContext, INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';
import { execSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Server } from 'node:http';
import request from 'supertest';
import { AiController } from '../src/ai/ai.controller';
import {
  AI_PROVIDERS,
  type IAiProvider,
} from '../src/ai/core/ai-provider.interface';
import { AiService } from '../src/ai/ai.service';
import { JwtAuthGuard } from '../src/auth/jwt-auth.guard';
import { PrismaService } from '../src/prisma/prisma.service';
import { TasksController } from '../src/tasks/tasks.controller';
import { TasksService } from '../src/tasks/tasks.service';
import { WorkspacesService } from '../src/workspaces/workspaces.service';

describe('AI content generation integration', () => {
  type GeneratedTask = {
    title: string;
    dueDate: string | null;
    status: string;
  };

  type GeneratedContentBody = {
    linkedin: string;
    email: string;
    tasks: GeneratedTask[];
  };

  type CreatedTaskBody = {
    id: string;
    workspaceId: string | null;
  };

  const backendRoot = join(__dirname, '..');
  const tempDir = mkdtempSync(join(tmpdir(), 'myday-ai-'));
  const databaseUrl = `file:${join(tempDir, 'integration.db')}`;

  let mockAiProvider: IAiProvider & { generate: jest.Mock };

  let app: INestApplication;
  let httpServer: Server;
  let moduleRef: TestingModule;
  let prisma: PrismaService;

  beforeAll(async () => {
    process.env.DATABASE_URL = databaseUrl;
    execSync('npx prisma migrate deploy', {
      cwd: backendRoot,
      env: {
        ...process.env,
        DATABASE_URL: databaseUrl,
      },
      stdio: 'inherit',
    });

    mockAiProvider = {
      name: 'gemini',
      generate: jest.fn(),
    };

    const builder = Test.createTestingModule({
      controllers: [AiController, TasksController],
      providers: [
        AiService,
        TasksService,
        WorkspacesService,
        PrismaService,
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn().mockReturnValue(undefined),
            getOrThrow: jest.fn(),
          },
        },
        {
          provide: AI_PROVIDERS,
          useValue: [mockAiProvider],
        },
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({
        canActivate: (context: ExecutionContext) => {
          const req = context.switchToHttp().getRequest<{
            user?: { id: string };
          }>();
          req.user = { id: 'user-1' };
          return true;
        },
      });

    moduleRef = await builder.compile();

    app = moduleRef.createNestApplication();
    await app.init();
    httpServer = app.getHttpServer() as Server;
    prisma = moduleRef.get(PrismaService);
  });

  beforeEach(async () => {
    mockAiProvider.generate.mockReset();
    await prisma.task.deleteMany({});
    await prisma.workspace.deleteMany({});
    await prisma.user.deleteMany({});
  });

  afterAll(async () => {
    if (app) {
      await app.close();
    }
    rmSync(tempDir, { recursive: true, force: true });
  });

  it('generates content and persists the resulting tasks with database IDs', async () => {
    await prisma.user.create({
      data: {
        id: 'user-1',
        email: 'caroline@example.com',
      },
    });

    mockAiProvider.generate
      .mockResolvedValueOnce('LinkedIn post content')
      .mockResolvedValueOnce('Follow-up email content')
      .mockResolvedValueOnce(
        JSON.stringify({
          tasks: [
            {
              title: 'Préparer la présentation',
              dueDate: '2026-07-01',
              status: 'DONE',
            },
            {
              title: 'Envoyer le compte-rendu',
              dueDate: null,
              status: 'IN_PROGRESS',
            },
          ],
        }),
      );

    const generationResponse = await request(httpServer)
      .post('/ai/generate-content')
      .send({ notes: 'Notes de réunion importantes avec actions à suivre.' })
      .expect(201);

    const generatedContent = generationResponse.body as GeneratedContentBody;

    expect(generatedContent).toEqual({
      linkedin: 'LinkedIn post content',
      email: 'Follow-up email content',
      tasks: [
        {
          title: 'Préparer la présentation',
          dueDate: '2026-07-01',
          status: 'TODO',
        },
        {
          title: 'Envoyer le compte-rendu',
          dueDate: null,
          status: 'TODO',
        },
      ],
    });

    const createdTasks: Array<{ body: CreatedTaskBody }> = [];
    for (const task of generatedContent.tasks) {
      const createdTask: { body: CreatedTaskBody } = await request(httpServer)
        .post('/tasks')
        .send({
          title: task.title,
          description: task.dueDate ? `Échéance : ${task.dueDate}` : undefined,
          source: 'AI_GENERATED',
        })
        .expect(201);
      createdTasks.push(createdTask);
    }

    expect(createdTasks).toHaveLength(2);
    expect(new Set(createdTasks.map((response) => response.body.id)).size).toBe(
      2,
    );
    expect(createdTasks[0]?.body.workspaceId).toBeDefined();
    expect(createdTasks[1]?.body.workspaceId).toBe(
      createdTasks[0]?.body.workspaceId,
    );

    const persistedTasks = await prisma.task.findMany({
      where: { userId: 'user-1' },
      orderBy: { createdAt: 'asc' },
    });

    expect(persistedTasks).toHaveLength(2);
    expect(persistedTasks.map((task) => task.id)).toEqual(
      createdTasks.map((response) => response.body.id),
    );
  });

  it('returns an empty task list when the AI returns malformed task JSON', async () => {
    await prisma.user.create({
      data: {
        id: 'user-1',
        email: 'caroline@example.com',
      },
    });

    mockAiProvider.generate
      .mockResolvedValueOnce('LinkedIn post content')
      .mockResolvedValueOnce('Follow-up email content')
      .mockResolvedValueOnce('{"tasks": [');

    const response = await request(httpServer)
      .post('/ai/generate-content')
      .send({ notes: 'Notes de réunion importantes avec actions à suivre.' })
      .expect(201);

    const generatedContent = response.body as GeneratedContentBody;

    expect(generatedContent.tasks).toEqual([]);
    expect(generatedContent.linkedin).toBe('LinkedIn post content');
    expect(generatedContent.email).toBe('Follow-up email content');
  });

  it('rejects task creation in a workspace owned by another user', async () => {
    await prisma.user.createMany({
      data: [
        { id: 'user-1', email: 'caroline@example.com' },
        { id: 'user-2', email: 'other@example.com' },
      ],
    });

    const foreignWorkspace = await prisma.workspace.create({
      data: {
        id: 'ws-foreign',
        userId: 'user-2',
        name: 'Équipe',
        color: '#6366F1',
        icon: 'pi pi-briefcase',
      },
    });

    await request(httpServer)
      .post('/tasks')
      .send({
        title: 'Tâche interdite',
        workspaceId: foreignWorkspace.id,
        source: 'AI_GENERATED',
      })
      .expect(404);
  });
});
