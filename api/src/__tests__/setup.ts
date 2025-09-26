// Test setup file
import { jest } from '@jest/globals';

// Mock Docker socket to prevent real Docker operations during tests
jest.mock('dockerode', () => {
  return jest.fn().mockImplementation(() => ({
    getContainer: jest.fn().mockReturnValue({
      inspect: jest.fn().mockResolvedValue({
        State: {
          Running: true,
          Health: { Status: 'healthy' },
          StartedAt: '2025-01-01T00:00:00.000Z',
          FinishedAt: null
        },
        Config: {
          Env: ['CLEAN_JOBS=4']
        }
      }),
      start: jest.fn().mockResolvedValue(undefined),
      stop: jest.fn().mockResolvedValue(undefined),
      logs: jest.fn().mockResolvedValue(Buffer.from('Mock log data\n'))
    }),
    getEvents: jest.fn().mockResolvedValue({
      on: jest.fn(),
      destroy: jest.fn()
    })
  }));
});

// Mock file system operations
jest.mock('fs/promises', () => ({
  readFile: jest.fn(),
  writeFile: jest.fn(),
  rename: jest.fn(),
  unlink: jest.fn(),
  access: jest.fn(),
  mkdir: jest.fn(),
  stat: jest.fn().mockResolvedValue({
    mtime: new Date('2025-01-01T00:00:00.000Z')
  })
}));