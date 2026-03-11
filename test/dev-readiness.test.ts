import path from 'node:path';
import { spawn } from 'node:child_process';
import { expect, test } from '@jest/globals';
import {
  ARKEN_CLI_INTERACTIVE_READY_ENV,
  ARKEN_CLI_INTERACTIVE_READY_LINE,
} from '../interactive-ready';

test(
  'interactive CLI emits an explicit readiness marker on the dev path',
  async () => {
    const cwd = path.join(__dirname, '..');
    const command =
      process.platform === 'win32'
        ? path.join(cwd, 'node_modules', '.bin', 'tsx.cmd')
        : path.join(cwd, 'node_modules', '.bin', 'tsx');

    const output = await new Promise<string>((resolve, reject) => {
      const child = spawn(
        command,
        ['-r', 'dotenv/config', '-r', 'tsconfig-paths/register', './cli.ts', '--interactive'],
        {
          cwd,
          env: {
            ...process.env,
            [ARKEN_CLI_INTERACTIVE_READY_ENV]: '1',
          },
          stdio: ['pipe', 'pipe', 'pipe'],
        }
      );

      let combined = '';
      let settled = false;
      const timeout = setTimeout(() => {
        if (!settled) {
          settled = true;
          child.kill('SIGINT');
          reject(new Error(`Timed out waiting for ${ARKEN_CLI_INTERACTIVE_READY_LINE}`));
        }
      }, 20_000);

      const finish = (value: string) => {
        if (settled) {
          return;
        }
        settled = true;
        clearTimeout(timeout);
        child.kill('SIGINT');
        resolve(value);
      };

      const onData = (chunk: Buffer | string) => {
        combined += chunk.toString();
        if (combined.includes(ARKEN_CLI_INTERACTIVE_READY_LINE)) {
          finish(combined);
        }
      };

      child.stdout.on('data', onData);
      child.stderr.on('data', onData);
      child.on('error', (error) => {
        if (settled) {
          return;
        }
        settled = true;
        clearTimeout(timeout);
        reject(error);
      });
      child.on('close', (code) => {
        if (settled) {
          return;
        }
        settled = true;
        clearTimeout(timeout);
        reject(new Error(`CLI exited before readiness marker with code ${String(code)}`));
      });
    });

    expect(output).toContain(ARKEN_CLI_INTERACTIVE_READY_LINE);
  },
  30_000
);
