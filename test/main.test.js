'use strict';

const { execFile: execFileCb, execFileSync } = require('child_process');
const path = require('path');
const { promisify } = require('util');

const { expect } = require('chai').use(require('chai-as-promised'));

const execFile = promisify(execFileCb);

const CLI = path.resolve(__dirname, '..', 'examples', 'cli', 'cli.js');
const PROJECT_PATH = path.resolve(__dirname, '..', 'examples', 'project');

describe('main', () => {
  it('allows describing commands', async () => {
    const stdout = execFileSync('node', [CLI, '-h'], {
      cwd: PROJECT_PATH,
    }).toString();
    expect(stdout).match(/start \[options]\s+Launch all the things/);
  });

  it('exits with the code returned from commands', async () => {
    await expect(
      execFile('node', [CLI, 'start', '--code=42'], {
        cwd: PROJECT_PATH,
      })
    )
      .rejectedWith(Error, /Command failed/)
      .and.eventually.property('code', 42);
  });
});
