import { Command } from "commander";
import { createAppCaller } from "../../trpc/appRouter";
import { parseInput } from "../../utils/parsing";
import { handleError, CommanderError } from "../../utils/errorHandler";

export class ConfigCommand extends Command {
  constructor() {
    super("config");
    this.description("Manage CLI configuration");

    // Define the subcommands
    this.addListCommand();
    this.addSetCommand();
  }

  private addListCommand() {
    this.command("list")
      .alias("ls")
      .description("List the current configuration")
      .action(async () => {
        const caller = createAppCaller({});
        await caller.config.list();
      });
  }

  private addSetCommand() {
    this.command("set <keyOrPair> [value]")
      .description(
        'Set a configuration value. Use either "key=value" or "key value" format'
      )
      .action(async (keyOrPair: string, value?: string) => {
        try {
          console.log("this.args:", this.args);

          // Check if any argument includes "="
          const hasEquals = this.args.some((arg) => arg.includes("="));

          // Validate based on the presence of "=" in the input
          if (hasEquals) {
            if (this.args.length > 1) {
              throw new CommanderError(
                'Too many arguments provided. Use either "key=value" or "key value" format.'
              );
            }
          } else {
            if (this.args.length > 2) {
              throw new CommanderError(
                'Too many arguments provided. Use either "key=value" or "key value" format.'
              );
            }
          }

          const { key, value: parsedValue } = parseInput(keyOrPair, value);
          const caller = createAppCaller({});
          await caller.config.set({ key, value: parsedValue });
        } catch (error) {
          handleError(error);
        }
      });
  }
}
