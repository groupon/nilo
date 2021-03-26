'use strict';

const { execFile: execFileCb } = require('child_process');
const path = require('path');
const { promisify } = require('util');

const assert = require('assert');

const execFile = promisify(execFileCb);

const CLI = path.resolve(__dirname, '..', 'examples', 'cli', 'cli.js');
const PROJECT_PATH = path.resolve(__dirname, '..', 'examples', 'project');

describe('main', () => {
  it('allows describing commands', async () => {
    const { stdout } = await execFile('node', [CLI, '--help'], {
      cwd: PROJECT_PATH,
    });
    assert.ok(/start \[options]\s+Launch all the things/.test(stdout));
  });

  it('exits with the code returned from commands', async () => {
    await assert.rejects(
      () =>
        execFile('node', [CLI, 'start', '--code=42'], {
          cwd: PROJECT_PATH,
        }),
      err => {
        assert.ok(/Command failed/.test(err.message));
        assert.strictEqual(err.code, 42);
        return true;
      }
    );
  });
});
