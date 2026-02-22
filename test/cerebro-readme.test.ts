import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { afterEach, expect, test } from 'vitest';
import { startLinkServer } from '../../cerebro/link/src/trpcSocketServer';

const execFileAsync = promisify(execFile);
const cleanup: Array<() => Promise<void>> = [];

afterEach(async () => {
  while (cleanup.length) {
    await cleanup.pop()?.();
  }
});

test('README cerebro.info commands work against websocket tRPC bridge', async () => {
  const { server } = await startLinkServer({
    port: 0,
    service: {
      async info() {
        return { status: 1, data: { name: 'README Cerebro Bridge' } };
      },
      async ask(input: any) {
        return { status: 1, data: input };
      },
      async exec(input: any) {
        return { status: 1, data: input };
      },
    },
  });

  cleanup.push(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  const port = (server.address() as any).port as number;
  const env = {
    ...process.env,
    CEREBRO_SERVICE_URI: `ws://127.0.0.1:${port}`,
  };

  const cwd = path.resolve(__dirname, '..');

  const rushxConfigList = await execFileAsync('rushx', ['cli', 'config.list'], {
    cwd,
    env,
  });

  expect(rushxConfigList.stdout).toContain('Current Configuration');

  const binConfigList = await execFileAsync('./bin/arken', ['config.list'], {
    cwd,
    env,
  });

  expect(binConfigList.stdout).toContain('Current Configuration');

  const rushxInfo = await execFileAsync('rushx', ['cli', 'cerebro.info'], {
    cwd,
    env,
  });

  expect(rushxInfo.stdout).toContain('README Cerebro Bridge');

  const binInfo = await execFileAsync('./bin/arken', ['cerebro.info'], {
    cwd,
    env,
  });

  expect(binInfo.stdout).toContain('README Cerebro Bridge');

  const askViaRushx = await execFileAsync('rushx', ['cli', 'cerebro.ask', '--mod', 'math', '--messages', '2+2'], {
    cwd,
    env,
  });

  expect(askViaRushx.stdout).toContain('"mod": "math"');
  expect(askViaRushx.stdout).toContain('"messages"');

  const askViaBin = await execFileAsync('./bin/arken', ['cerebro.ask', '--mod', 'math', '--messages', '2+2'], {
    cwd,
    env,
  });

  expect(askViaBin.stdout).toContain('"mod": "math"');
  expect(askViaBin.stdout).toContain('"messages"');

  const execViaRushx = await execFileAsync(
    'rushx',
    ['cli', 'cerebro.exec', '--agent', 'Hisoka', '--method', 'run'],
    {
      cwd,
      env,
    }
  );

  expect(execViaRushx.stdout).toContain('"agent": "Hisoka"');
  expect(execViaRushx.stdout).toContain('"method": "run"');

  const execViaBin = await execFileAsync('./bin/arken', ['cerebro.exec', 'Hisoka.run()'], {
    cwd,
    env,
  });

  expect(execViaBin.stdout).toContain('"agent": "Hisoka"');
  expect(execViaBin.stdout).toContain('"method": "run"');
}, 180_000);
