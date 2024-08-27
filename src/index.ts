#!/usr/bin/env ts-node

import { hello } from "./commands/hello";
import { configCommands } from "./commands/config";

const args = process.argv.slice(2);

if (args.length === 0) {
  console.log("No command provided.");
  process.exit(1);
}

const command = args[0];

switch (command) {
  case "hello":
    hello(args.slice(1));
    break;
  case "config":
    configCommands(args.slice(1));
    break;
  default:
    console.log(`Unknown command: ${command}`);
    process.exit(1);
}
