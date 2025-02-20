import { describe, test, expect, vi, beforeEach, afterEach, type Mock } from 'vitest';
import { RepoManager } from './RepoManager.js';
import simpleGit from 'simple-git';
import * as fs from 'node:fs/promises';
import { execa } from 'execa';
import { StainlessError } from './StainlessError.js';
import * as utils from './utils.js';
import { LifecycleManager } from './LifecycleManager.js';

// Mock dependencies
vi.mock('simple-git');
vi.mock('node:fs/promises');
vi.mock('execa');
vi.mock('./utils.js');
vi.mock('./LifecycleManager.js');

describe('RepoManager', () => {
  const mockOptions = {
    sdkRepo: 'git@github.com:org/repo.git',
    branch: 'main',
    targetDir: './sdks/test',
    sdkName: 'test-sdk',
    env: 'staging',
    lifecycle: {
      'test-sdk': {
        postClone: 'npm install',
        postUpdate: 'npm run build'
      }
    }
  };

  let mockGit: any;
  let mockLifecycleManager: any;

  beforeEach(() => {
    // Reset mocks
    vi.clearAllMocks();

    // Setup git mock
    mockGit = {
      cwd: vi.fn(),
      init: vi.fn(),
      addRemote: vi.fn(),
      fetch: vi.fn(),
      branch: vi.fn(),
      checkout: vi.fn(),
      pull: vi.fn(),
      log: vi.fn(),
      status: vi.fn(),
      stash: vi.fn(),
      revparse: vi.fn(),
      getRemotes: vi.fn()
    };
    (simpleGit as unknown as any).mockReturnValue(mockGit);

    // Setup LifecycleManager mock
    mockLifecycleManager = {
      executePostClone: vi.fn().mockResolvedValue(undefined),
      executePostUpdate: vi.fn().mockResolvedValue(undefined)
    };
    vi.mocked(LifecycleManager).mockImplementation(() => mockLifecycleManager);

    // Setup utils mock
    vi.mocked(utils.getTargetDir).mockImplementation((options) => {
      return './sdks/test';
    });

    // Setup fs mock
    vi.mocked(fs.access).mockRejectedValue(new Error('ENOENT'));
    vi.mocked(fs.mkdir).mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  describe('constructor', () => {
    test('initializes with provided options', () => {
      const manager = new RepoManager(mockOptions);
      expect(LifecycleManager).toHaveBeenCalledWith(mockOptions.lifecycle);
    });
  });

  describe('getTargetDir', () => {
    test('returns correct target directory', () => {
      const manager = new RepoManager(mockOptions);
      expect(manager.getTargetDir()).toBe('./sdks/test');
      expect(utils.getTargetDir).toHaveBeenCalledWith({
        targetDir: mockOptions.targetDir,
        sdkName: mockOptions.sdkName,
        env: mockOptions.env,
        branch: mockOptions.branch
      });
    });
  });

  describe('initializeRepo', () => {
    test('clones fresh repo when directory does not exist', async () => {
      const manager = new RepoManager(mockOptions);
      mockGit.branch.mockResolvedValue({ all: ['origin/main'] });
      mockGit.log.mockResolvedValue({ latest: { hash: 'abc123' } });
      vi.mocked(fs.access).mockRejectedValue(new Error('ENOENT'));

      await manager.initializeRepo();

      expect(mockGit.init).toHaveBeenCalled();
      expect(mockGit.addRemote).toHaveBeenCalledWith('origin', mockOptions.sdkRepo);
      expect(mockGit.checkout).toHaveBeenCalledWith(['-b', 'main', 'origin/main']);
      expect(mockLifecycleManager.executePostClone).toHaveBeenCalledWith({
        sdkPath: './sdks/test',
        branch: 'main',
        sdkName: 'test-sdk'
      });
    });

    test('updates existing repo when directory exists', async () => {
      const manager = new RepoManager(mockOptions);
      vi.mocked(fs.access).mockResolvedValue(undefined);
      mockGit.revparse.mockResolvedValue('some-git-dir');
      mockGit.getRemotes.mockResolvedValue([{ refs: { fetch: mockOptions.sdkRepo } }]);
      mockGit.status.mockResolvedValue({ isClean: () => true });
      mockGit.branch.mockResolvedValue({ all: ['origin/main'] });
      mockGit.log.mockResolvedValue({ latest: { hash: 'abc123' } });

      await manager.initializeRepo();

      expect(mockGit.pull).toHaveBeenCalledWith('origin', mockOptions.branch);
      expect(mockLifecycleManager.executePostUpdate).toHaveBeenCalledWith({
        sdkPath: './sdks/test',
        branch: 'main',
        sdkName: 'test-sdk'
      });
    });

    test('throws error when directory contains different repository', async () => {
      const manager = new RepoManager(mockOptions);
      vi.mocked(fs.access).mockResolvedValue(undefined);
      mockGit.revparse.mockResolvedValue('some-git-dir');
      mockGit.getRemotes.mockResolvedValue([{ refs: { fetch: 'git@github.com:other/repo.git' } }]);

      await expect(manager.initializeRepo()).rejects.toThrow(StainlessError);
    });
  });

  describe('hasNewChanges', () => {
    test('returns true when remote has new changes', async () => {
      const manager = new RepoManager(mockOptions);
      mockGit.log
        .mockResolvedValueOnce({ latest: { hash: 'abc123' } }) // local hash
        .mockResolvedValueOnce({ latest: { hash: 'def456' } }); // remote hash

      const hasChanges = await manager.hasNewChanges();
      expect(hasChanges).toBe(true);
    });

    test('returns false when no new changes', async () => {
      const manager = new RepoManager(mockOptions);
      mockGit.log
        .mockResolvedValueOnce({ latest: { hash: 'abc123' } }) // local hash
        .mockResolvedValueOnce({ latest: { hash: 'abc123' } }); // remote hash

      const hasChanges = await manager.hasNewChanges();
      expect(hasChanges).toBe(false);
    });
  });

  describe('waitForRemoteBranch', () => {
    test('resolves when branch becomes available', async () => {
      const manager = new RepoManager(mockOptions);
      mockGit.branch
        .mockResolvedValueOnce({ all: [] })
        .mockResolvedValueOnce({ all: ['origin/main'] });

      const promise = manager.waitForRemoteBranch('main', 0);
      await expect(promise).resolves.toBeUndefined();
    });
  });

  describe('pullChanges', () => {
    test('pulls changes without stashing when working directory is clean', async () => {
      const manager = new RepoManager(mockOptions);
      mockGit.status.mockResolvedValue({ isClean: () => true });
      mockGit.log
        .mockResolvedValueOnce({ latest: { hash: 'abc123' } })
        .mockResolvedValueOnce({ latest: { hash: 'def456' } });

      await manager.pullChanges();

      expect(mockGit.stash).not.toHaveBeenCalled();
      expect(mockGit.pull).toHaveBeenCalledWith('origin', 'main');
    });

    test('stashes changes before pulling when working directory is dirty', async () => {
      const manager = new RepoManager(mockOptions);
      mockGit.status.mockResolvedValue({ isClean: () => false });
      mockGit.log
        .mockResolvedValueOnce({ latest: { hash: 'abc123' } })
        .mockResolvedValueOnce({ latest: { hash: 'def456' } });

      await manager.pullChanges();

      expect(mockGit.stash).toHaveBeenCalledWith(['push', '-u', '-m', expect.any(String)]);
      expect(mockGit.pull).toHaveBeenCalledWith('origin', 'main');
      expect(mockGit.stash).toHaveBeenCalledWith(['pop']);
    });

    test('executes post-update command when configured', async () => {
      const manager = new RepoManager(mockOptions);
      mockGit.status.mockResolvedValue({ isClean: () => true });
      mockGit.log
        .mockResolvedValueOnce({ latest: { hash: 'abc123' } })
        .mockResolvedValueOnce({ latest: { hash: 'def456' } });

      await manager.pullChanges();

      expect(mockGit.pull).toHaveBeenCalledWith('origin', 'main');
      expect(mockLifecycleManager.executePostUpdate).toHaveBeenCalledWith({
        sdkPath: './sdks/test',
        branch: 'main',
        sdkName: 'test-sdk'
      });
    });
  });
}); 