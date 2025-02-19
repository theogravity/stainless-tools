import { describe, test, expect, vi, beforeEach, afterEach, type Mock } from 'vitest';
import { RepoManager } from './RepoManager.js';
import simpleGit from 'simple-git';
import * as fs from 'node:fs/promises';
import { execa } from 'execa';
import { StainlessError } from './StainlessError.js';
import * as utils from './utils.js';

// Mock dependencies
vi.mock('simple-git');
vi.mock('node:fs/promises');
vi.mock('execa');
vi.mock('./utils.js');

describe('RepoManager', () => {
  const mockOptions = {
    sdkRepo: 'https://github.com/org/repo.git',
    branch: 'main',
    targetDir: '/path/to/{sdk}/{env}',
    sdkName: 'test-sdk',
    env: 'test',
  };

  const mockGit = {
    cwd: vi.fn().mockResolvedValue(undefined),
    init: vi.fn().mockResolvedValue(undefined),
    addRemote: vi.fn().mockResolvedValue(undefined),
    fetch: vi.fn().mockResolvedValue(undefined),
    checkout: vi.fn().mockResolvedValue(undefined),
    log: vi.fn().mockResolvedValue({ latest: { hash: 'abc123' } }),
    branch: vi.fn().mockResolvedValue({ all: ['origin/main'] }),
    getRemotes: vi.fn().mockResolvedValue([{ refs: { fetch: 'https://github.com/org/repo.git' } }]),
    revparse: vi.fn().mockResolvedValue('main'),
    status: vi.fn().mockResolvedValue({ isClean: () => true }),
    pull: vi.fn().mockResolvedValue(undefined),
    stash: vi.fn().mockResolvedValue(undefined),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    (simpleGit as unknown as Mock).mockReturnValue(mockGit);
    (utils.getTargetDir as Mock).mockImplementation((options) => {
      return `/path/to/${options.sdkName}/${options.env}`;
    });
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  describe('constructor', () => {
    test('initializes with provided options', () => {
      const manager = new RepoManager(mockOptions);
      expect(manager).toBeInstanceOf(RepoManager);
    });
  });

  describe('getTargetDir', () => {
    test('returns correct target directory', () => {
      const manager = new RepoManager(mockOptions);
      const targetDir = manager.getTargetDir();
      expect(targetDir).toBe('/path/to/test-sdk/test');
      expect(utils.getTargetDir).toHaveBeenCalledWith({
        targetDir: mockOptions.targetDir,
        sdkName: mockOptions.sdkName,
        env: mockOptions.env,
        branch: mockOptions.branch,
      });
    });
  });

  describe('initializeRepo', () => {
    test('clones fresh repo when directory does not exist', async () => {
      vi.spyOn(fs, 'access').mockRejectedValueOnce(new Error());
      mockGit.branch.mockResolvedValueOnce({ all: ['origin/main'] });
      mockGit.log.mockResolvedValueOnce({ latest: { hash: 'abc123' } });
      const manager = new RepoManager(mockOptions);
      
      await manager.initializeRepo();
      
      expect(fs.mkdir).toHaveBeenCalledWith(expect.any(String), { recursive: true });
      expect(mockGit.init).toHaveBeenCalled();
      expect(mockGit.addRemote).toHaveBeenCalledWith('origin', mockOptions.sdkRepo);
      expect(mockGit.fetch).toHaveBeenCalledWith('origin', mockOptions.branch);
      expect(mockGit.checkout).toHaveBeenCalledWith(['-b', mockOptions.branch, `origin/${mockOptions.branch}`]);
    });

    test('updates existing repo when directory exists', async () => {
      vi.spyOn(fs, 'access').mockResolvedValueOnce(undefined);
      mockGit.revparse.mockResolvedValueOnce('git-dir');
      mockGit.getRemotes.mockResolvedValueOnce([{ refs: { fetch: mockOptions.sdkRepo } }]);
      mockGit.status.mockResolvedValueOnce({ isClean: () => true });
      mockGit.revparse.mockResolvedValueOnce(mockOptions.branch); // current branch
      mockGit.log
        .mockResolvedValueOnce({ latest: { hash: 'abc123' } }) // getCurrentSdkCommitHash before pull
        .mockResolvedValueOnce({ latest: { hash: 'def456' } }) // getCurrentSdkCommitHash after pull
        .mockResolvedValueOnce({ latest: { hash: 'def456' } }); // final getCurrentSdkCommitHash
      const manager = new RepoManager(mockOptions);
      
      await manager.initializeRepo();
      
      expect(mockGit.fetch).toHaveBeenCalled();
      expect(mockGit.pull).toHaveBeenCalledWith('origin', mockOptions.branch);
    });

    test('throws error when directory contains different repository', async () => {
      vi.spyOn(fs, 'access').mockResolvedValueOnce(undefined);
      mockGit.revparse.mockResolvedValueOnce('git-dir');
      mockGit.getRemotes.mockResolvedValueOnce([{ refs: { fetch: 'https://github.com/different/repo.git' } }]);
      const manager = new RepoManager(mockOptions);
      
      await expect(manager.initializeRepo()).rejects.toThrow(StainlessError);
    });
  });

  describe('hasNewChanges', () => {
    test('returns true when remote has new changes', async () => {
      mockGit.log
        .mockResolvedValueOnce({ latest: { hash: 'abc123' } }) // local hash
        .mockResolvedValueOnce({ latest: { hash: 'def456' } }); // remote hash
      
      const manager = new RepoManager(mockOptions);
      const hasChanges = await manager.hasNewChanges();
      
      expect(hasChanges).toBe(true);
    });

    test('returns false when no new changes', async () => {
      const sameHash = 'abc123';
      mockGit.log
        .mockResolvedValueOnce({ latest: { hash: sameHash } })
        .mockResolvedValueOnce({ latest: { hash: sameHash } });
      
      const manager = new RepoManager(mockOptions);
      const hasChanges = await manager.hasNewChanges();
      
      expect(hasChanges).toBe(false);
    });
  });

  describe('waitForRemoteBranch', () => {
    test('resolves when branch becomes available', async () => {
      mockGit.branch.mockResolvedValueOnce({ all: [] }).mockResolvedValueOnce({ all: ['origin/main'] });
      const manager = new RepoManager(mockOptions);
      
      await manager.waitForRemoteBranch('main', 100);
      
      expect(mockGit.fetch).toHaveBeenCalled();
      expect(mockGit.branch).toHaveBeenCalledWith(['-r']);
    }, 1000); // Increase timeout to 1 second
  });

  describe('pullChanges', () => {
    test('pulls changes without stashing when working directory is clean', async () => {
      mockGit.status.mockResolvedValueOnce({ isClean: () => true });
      mockGit.log
        .mockResolvedValueOnce({ latest: { hash: 'abc123' } }) // old hash
        .mockResolvedValueOnce({ latest: { hash: 'def456' } }); // new hash
      const manager = new RepoManager(mockOptions);
      
      await manager.pullChanges();
      
      expect(mockGit.stash).not.toHaveBeenCalled();
      expect(mockGit.pull).toHaveBeenCalledWith('origin', mockOptions.branch);
    });

    test('stashes changes before pulling when working directory is dirty', async () => {
      mockGit.status.mockResolvedValueOnce({ isClean: () => false });
      mockGit.log
        .mockResolvedValueOnce({ latest: { hash: 'abc123' } }) // old hash
        .mockResolvedValueOnce({ latest: { hash: 'def456' } }); // new hash
      const manager = new RepoManager(mockOptions);
      
      await manager.pullChanges();
      
      expect(mockGit.stash).toHaveBeenCalledWith(['push', '-u', '-m', expect.any(String)]);
      expect(mockGit.pull).toHaveBeenCalledWith('origin', mockOptions.branch);
      expect(mockGit.stash).toHaveBeenCalledWith(['pop']);
    });

    test('executes post-update command when configured', async () => {
      const optionsWithLifecycle = {
        ...mockOptions,
        lifecycle: {
          'test-sdk': {
            postUpdate: 'npm install',
          },
        },
      };
      
      mockGit.status.mockResolvedValueOnce({ isClean: () => true });
      mockGit.log
        .mockResolvedValueOnce({ latest: { hash: 'abc123' } }) // old hash
        .mockResolvedValueOnce({ latest: { hash: 'def456' } }); // new hash
      (execa as unknown as Mock).mockResolvedValueOnce({ stdout: '', stderr: '' });
      
      const manager = new RepoManager(optionsWithLifecycle);
      await manager.pullChanges();
      
      expect(execa).toHaveBeenCalledWith('npm install', {
        shell: true,
        env: expect.objectContaining({
          STAINLESS_TOOLS_SDK_PATH: expect.any(String),
          STAINLESS_TOOLS_SDK_BRANCH: mockOptions.branch,
          STAINLESS_TOOLS_SDK_REPO_NAME: mockOptions.sdkName,
        }),
      });
    });
  });
}); 