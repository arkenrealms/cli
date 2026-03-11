import colors from 'picocolors';
import { createCliBenchmarkRecorder } from './benchmark-runtime';
import { lineByLineConsoleLogger } from './logging';
import { renderSummaryHelp, normalizeInputArgv, resolveRequestedCommand } from './summary-cli';
import { SUMMARY_COMMANDS } from './summary-manifest.generated';

async function main() {
  const rawArgs = process.argv.slice(2);
  const inputArgv = normalizeInputArgv(rawArgs);
  const benchmarkRecorder = createCliBenchmarkRecorder({
    argv: inputArgv,
  });
  const benchmarkProcess = {
    ...process,
    exit: benchmarkRecorder.wrapProcessExit(process.exit.bind(process)),
  };
  const logger = lineByLineConsoleLogger;
  const requestedCommand = resolveRequestedCommand(inputArgv);
  const summaryCommandNames = new Set(SUMMARY_COMMANDS.map(({ name }) => name));
  const shouldUseSummaryOnly =
    !inputArgv.includes('--interactive') &&
    (!requestedCommand || !summaryCommandNames.has(requestedCommand));
  const requestedSummaryHelp = shouldUseSummaryOnly && inputArgv.includes('--help');

  if (shouldUseSummaryOnly) {
    const verboseErrors =
      inputArgv.includes('--verbose-errors') || inputArgv.includes('--verboseErrors');

    benchmarkRecorder.markInitialized({
      command: requestedCommand || null,
      interactive: false,
      summaryOnly: true,
    });

    if (requestedSummaryHelp || inputArgv.includes('-h')) {
      renderSummaryHelp({
        logger,
        commands: SUMMARY_COMMANDS,
      });
      benchmarkRecorder.complete({
        exitCode: 0,
        command: requestedCommand || null,
        interactive: false,
        summaryOnly: true,
      });
      return;
    }

    const name = JSON.stringify(requestedCommand || inputArgv[0]);
    const message = name ? `Command not found: ${name}.` : 'No command specified.';
    if (verboseErrors) {
      throw new Error(message);
    }
    logger.error?.(colors.red(message));
    renderSummaryHelp({
      logger,
      commands: SUMMARY_COMMANDS,
    });
    benchmarkProcess.exit(1);
  }

  const { createCli } = require('./index') as typeof import('./index');
  const { router, link } = require('./router') as typeof import('./router');
  await createCli({ router, link }).run();
}

void main();
