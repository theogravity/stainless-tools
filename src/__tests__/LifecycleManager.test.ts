import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { execa } from 'execa';
import { LifecycleManager } from '../LifecycleManager.js';
import { StainlessError } from '../StainlessError.js';
import { Readable } from 'stream';

vi.mock('execa');

describe('LifecycleManager', () => {
  const mockContext = {
    sdkPath: '/path/to/sdk',
    branch: 'main',
    sdkName: 'test-sdk'
  };

  const mockConfig = {
    'test-sdk': {
      postClone: 'npm install',
      postUpdate: 'npm run build'
    }
  };

  let lifecycleManager: LifecycleManager;
  let mockStdout: Readable;
  let mockStderr: Readable;
  let originalConsoleLog: typeof console.log;
  let originalConsoleError: typeof console.error;
  let mockProcess: any;

  beforeEach(() => {
    lifecycleManager = new LifecycleManager(mockConfig);

    // Mock stdout and stderr streams
    mockStdout = new Readable();
    mockStderr = new Readable();
    mockStdout.read = () => null;
    mockStderr.read = () => null;

    // Mock console.log and console.error
    originalConsoleLog = console.log;
    originalConsoleError = console.error;
    console.log = vi.fn();
    console.error = vi.fn();

    // Mock process.stdout.write and process.stderr.write
    mockProcess = {
      stdout: { write: vi.fn() },
      stderr: { write: vi.fn() }
    };
    vi.stubGlobal('process', mockProcess);

    // Setup default execa mock with proper subprocess structure
    const mockSubprocess = {
      stdout: mockStdout,
      stderr: mockStderr,
      exitCode: 0,
      // Add a promise-like structure that execa returns
      then: (fn: any) => Promise.resolve(fn({ exitCode: 0 })),
      catch: () => Promise.resolve(),
      finally: () => Promise.resolve()
    };

    (execa as unknown as any).mockReturnValue(mockSubprocess);
  });

  afterEach(() => {
    vi.clearAllMocks();
    console.log = originalConsoleLog;
    console.error = originalConsoleError;
    vi.unstubAllGlobals();
  });

  describe('executePostClone', () => {
    it('executes postClone command with correct environment variables', async () => {
      await lifecycleManager.executePostClone(mockContext);

      expect(execa).toHaveBeenCalledWith('npm install', {
        shell: true,
        env: {
          STAINLESS_TOOLS_SDK_PATH: mockContext.sdkPath,
          STAINLESS_TOOLS_SDK_BRANCH: mockContext.branch,
          STAINLESS_TOOLS_SDK_REPO_NAME: mockContext.sdkName,
        },
        stdio: ['inherit', 'pipe', 'pipe']
      });
    });

    it('streams stdout in real-time', async () => {
      const promise = lifecycleManager.executePostClone(mockContext);
      mockStdout.emit('data', 'Installing dependencies...\n');
      await promise;

      expect(mockProcess.stdout.write).toHaveBeenCalledWith('Installing dependencies...\n');
    });

    it('streams stderr in real-time', async () => {
      const promise = lifecycleManager.executePostClone(mockContext);
      mockStderr.emit('data', 'Warning: deprecated package\n');
      await promise;

      expect(mockProcess.stderr.write).toHaveBeenCalledWith('Warning: deprecated package\n');
    });

    it('handles command failure', async () => {
      (execa as unknown as any).mockReturnValue({
        stdout: mockStdout,
        stderr: mockStderr,
        exitCode: 1
      });

      await expect(lifecycleManager.executePostClone(mockContext))
        .rejects
        .toThrow(StainlessError);
    });

    it('does nothing if no postClone command is configured', async () => {
      const emptyManager = new LifecycleManager({});
      await emptyManager.executePostClone(mockContext);

      expect(execa).not.toHaveBeenCalled();
    });
  });

  describe('executePostUpdate', () => {
    it('executes postUpdate command with correct environment variables', async () => {
      await lifecycleManager.executePostUpdate(mockContext);

      expect(execa).toHaveBeenCalledWith('npm run build', {
        shell: true,
        env: {
          STAINLESS_TOOLS_SDK_PATH: mockContext.sdkPath,
          STAINLESS_TOOLS_SDK_BRANCH: mockContext.branch,
          STAINLESS_TOOLS_SDK_REPO_NAME: mockContext.sdkName,
        },
        stdio: ['inherit', 'pipe', 'pipe']
      });
    });

    it('streams stdout in real-time', async () => {
      const promise = lifecycleManager.executePostUpdate(mockContext);
      mockStdout.emit('data', 'Building project...\n');
      await promise;

      expect(mockProcess.stdout.write).toHaveBeenCalledWith('Building project...\n');
    });

    it('streams stderr in real-time', async () => {
      const promise = lifecycleManager.executePostUpdate(mockContext);
      mockStderr.emit('data', 'Warning: build optimization failed\n');
      await promise;

      expect(mockProcess.stderr.write).toHaveBeenCalledWith('Warning: build optimization failed\n');
    });

    it('handles command failure', async () => {
      (execa as unknown as any).mockReturnValue({
        stdout: mockStdout,
        stderr: mockStderr,
        exitCode: 1
      });

      await expect(lifecycleManager.executePostUpdate(mockContext))
        .rejects
        .toThrow(StainlessError);
    });

    it('does nothing if no postUpdate command is configured', async () => {
      const emptyManager = new LifecycleManager({});
      await emptyManager.executePostUpdate(mockContext);

      expect(execa).not.toHaveBeenCalled();
    });
  });

  describe('error handling', () => {
    it('wraps execa errors in StainlessError', async () => {
      const execaError = new Error('Command failed');
      (execa as unknown as any).mockRejectedValue(execaError);

      await expect(lifecycleManager.executePostClone(mockContext))
        .rejects
        .toThrow(StainlessError);
    });

    it('includes the command in error message', async () => {
      const execaError = new Error('Command failed');
      (execa as unknown as any).mockRejectedValue(execaError);

      await expect(lifecycleManager.executePostClone(mockContext))
        .rejects
        .toThrow('Failed to execute postClone command: npm install');
    });
  });
}); 