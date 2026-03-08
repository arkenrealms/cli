import path from 'node:path';
import http from 'node:http';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import type { AddressInfo } from 'node:net';
import { afterEach, expect, test } from 'vitest';
import { Server as SocketIOServer } from 'socket.io';
import { deserialize, serialize } from '@arken/node/rpc';

const execFileAsync = promisify(execFile);
const cleanup: Array<() => Promise<void>> = [];

async function startLinkServer() {
  const server = http.createServer();
  const io = new SocketIOServer(server, {
    transports: ['websocket'],
    serveClient: false,
  });

  io.on('connection', (socket) => {
    socket.on('trpc', (message: any) => {
      const method = typeof message?.method === 'string' ? message.method.trim() : '';
      const input = message?.params ? deserialize(message.params) : undefined;

      const resolveResult = async () => {
        switch (method) {
          case 'info':
            return { name: 'README Cerebro Bridge' };
          case 'ask':
            return input;
          case 'exec':
            return input;
          default:
            throw new Error(`TRPC handler does not exist for method: ${method}`);
        }
      };

      void resolveResult()
        .then((data) => {
          socket.emit('trpcResponse', {
            id: message?.id,
            result: serialize({ status: 1, data }),
          });
        })
        .catch((error: unknown) => {
          socket.emit('trpcResponse', {
            id: message?.id,
            result: serialize({ status: 0 }),
            error: error instanceof Error ? error.message : String(error),
          });
        });
    });
  });

  await new Promise<void>((resolve) => {
    server.listen(0, '127.0.0.1', () => resolve());
  });

  return {
    io,
    server,
    port: (server.address() as AddressInfo).port,
  };
}

afterEach(async () => {
  while (cleanup.length) {
    await cleanup.pop()?.();
  }
});

test('README cerebro.info commands work against websocket tRPC bridge', async () => {
  const { server, io, port } = await startLinkServer();

  cleanup.push(async () => {
    await new Promise<void>((resolve) => io.close(() => resolve()));
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

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
