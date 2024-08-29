import { Command } from "commander";
import { ConfigCommand } from "./commands/config";
import { ApplicationCommand } from "./commands/application";
const program = new Command();

program
  .name("arken")
  .description("A CLI tool for managing configurations")
  .version("1.0.0");

// Register commands
program.addCommand(new ConfigCommand());
program.addCommand(new ApplicationCommand());

// Parse the arguments
program.parse(process.argv);
