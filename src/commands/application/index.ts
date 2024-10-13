import { Command } from "commander";
import { createAppCaller } from "../../trpc/appRouter";
import { handleError, CommanderError } from "../../utils/errorHandler";

export class ApplicationCommand extends Command {
  constructor() {
    super("application");
    this.description("Manage applications");

    // Define the subcommands
    this.addCreateCommand();
  }

  private addCreateCommand() {
    this.command("create <name>")
      .description("Create a new application")
      .action(async (name: string) => {
        try {
          // Check if too many arguments are passed
          if (this.args.length > 2) {
            throw new CommanderError(
              "Too many arguments provided. Expected usage: arken application create NAME"
            );
          }

          const caller = createAppCaller({});
          await caller.application.create(name);
        } catch (error) {
          handleError(error);
        }
      });
  }
}
