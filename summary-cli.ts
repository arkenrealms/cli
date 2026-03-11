import type { Logger } from './types';

export type SummaryCommandInfo = {
  name: string;
  description?: string;
};

export function getSummaryCommandDescription(meta: unknown): string | undefined {
  if (typeof meta === 'string') {
    return meta;
  }

  if (meta && typeof meta === 'object' && 'description' in (meta as Record<string, unknown>)) {
    const description = (meta as { description?: unknown }).description;
    return typeof description === 'string' ? description : undefined;
  }

  return undefined;
}

export function renderSummaryHelp({
  logger,
  commands,
}: {
  logger: Logger;
  commands: SummaryCommandInfo[];
}) {
  const longestCommandName = commands.reduce((max, command) => {
    return Math.max(max, command.name.length);
  }, 0);
  const summaryCommandWidth = longestCommandName + 8;
  const commandLines = commands.map(({ name, description }) => {
    const paddedName = name.padEnd(summaryCommandWidth, ' ');
    return `  ${paddedName}${description ?? ''}`;
  });
  const lines = [
    'COMMANDS:',
    ...commandLines,
    '',
    'FLAGS:',
    '  -h, --help                  Show help',
    '      --interactive           Enter interactive mode',
    '      --verbose-errors        Throw raw errors (by default errors are summarised)',
  ];

  logger.info?.(`${lines.join('\n')}\n`);
}

export function normalizeInputArgv(rawArgs: string[]): string[] {
  const inputArgv = rawArgs.slice();
  const commandName = inputArgv[0];
  const shorthandIndex = inputArgv[0] === commandName ? 1 : 0;
  const shorthandResult = reconstructShorthandCommand(inputArgv.slice(shorthandIndex));

  if (!shorthandResult) {
    return inputArgv;
  }

  const { shorthandCommand, remainingArgs } = shorthandResult;
  const shorthandRegex = /^([\w-]+)\.([\w-]+)\((.*)\)$/s;
  const match = shorthandCommand.match(shorthandRegex);
  if (!match) {
    return inputArgv;
  }

  const [, agent, method, paramsString] = match;
  const params = parseParamsString(paramsString);
  return [
    commandName,
    '--agent',
    agent,
    '--method',
    method,
    ...(params.length > 0 ? ['--params', ...params] : []),
    ...remainingArgs,
  ];
}

export function resolveRequestedCommand(
  inputArgv: string[],
  defaultProcedure?: string
): string | undefined {
  for (const token of inputArgv) {
    if (token === '--') break;
    if (
      token === '--help' ||
      token === '-h' ||
      token === '--verboseErrors' ||
      token === '--verbose-errors' ||
      token === '--interactive'
    ) {
      continue;
    }
    if (token.startsWith('-')) {
      continue;
    }
    return token.includes('(') ? token.split('(')[0] : token;
  }

  return defaultProcedure;
}

function parseParamsString(paramsString: string): string[] {
  const params: string[] = [];
  let currentParam = '';
  let inQuotes = false;
  let quoteChar = '';
  let escape = false;
  let sawParamToken = false;
  let currentTokenQuoted = false;

  const pushCurrentParam = () => {
    params.push(currentTokenQuoted ? currentParam : currentParam.trim());
    currentParam = '';
    sawParamToken = false;
    currentTokenQuoted = false;
  };

  for (let i = 0; i < paramsString.length; i++) {
    const char = paramsString[i];

    if (escape) {
      currentParam += char;
      sawParamToken = true;
      escape = false;
      continue;
    }

    if (char === '\\') {
      escape = true;
      sawParamToken = true;
      continue;
    }

    if (inQuotes) {
      if (char === quoteChar) {
        inQuotes = false;
        sawParamToken = true;
      } else {
        currentParam += char;
        sawParamToken = true;
      }
    } else {
      if (char === '"' || char === "'") {
        if (currentParam.trim().length === 0) {
          currentParam = '';
        }
        inQuotes = true;
        quoteChar = char;
        sawParamToken = true;
        currentTokenQuoted = true;
      } else if (char === ',') {
        pushCurrentParam();
      } else {
        if (currentTokenQuoted && char.trim().length === 0) {
          continue;
        }
        currentParam += char;
        if (char.trim().length > 0) sawParamToken = true;
      }
    }
  }

  if (escape) {
    currentParam += '\\';
    sawParamToken = true;
  }

  if (sawParamToken || currentParam.trim().length > 0 || paramsString.trimEnd().endsWith(',')) {
    pushCurrentParam();
  }
  return params;
}

function reconstructShorthandCommand(
  argv: string[]
): { shorthandCommand: string; remainingArgs: string[] } | null {
  const shorthandCommandParts = [];
  let startIndex = -1;
  let parenDepth = 0;
  let found = false;

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (!arg.startsWith('--')) {
      if (arg.includes('.') && arg.includes('(')) {
        startIndex = i;
        shorthandCommandParts.push(arg);
        parenDepth += (arg.match(/\(/g) || []).length;
        parenDepth -= (arg.match(/\)/g) || []).length;
        if (parenDepth <= 0) {
          found = true;
          break;
        }
      } else if (startIndex >= 0) {
        shorthandCommandParts.push(arg);
        parenDepth += (arg.match(/\(/g) || []).length;
        parenDepth -= (arg.match(/\)/g) || []).length;
        if (parenDepth <= 0) {
          found = true;
          break;
        }
      }
    } else if (startIndex >= 0) {
      shorthandCommandParts.push(arg);
      parenDepth += (arg.match(/\(/g) || []).length;
      parenDepth -= (arg.match(/\)/g) || []).length;
      if (parenDepth <= 0) {
        found = true;
        break;
      }
    }
  }

  if (!found || startIndex < 0) {
    return null;
  }

  const endIndex = startIndex + shorthandCommandParts.length;
  return {
    shorthandCommand: shorthandCommandParts.join(' '),
    remainingArgs: [...argv.slice(0, startIndex), ...argv.slice(endIndex)],
  };
}
