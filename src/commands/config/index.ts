import { listConfig } from "./list";
import { setConfig } from "./set";

export const configCommands = (args: string[]) => {
  const subcommand = args[0];

  switch (subcommand) {
    case "list":
    case "ls":
      listConfig();
      break;
    case "set":
      setConfig(args.slice(1));
      break;
    default:
      console.log(
        "Unknown subcommand. Use `config list` to view the current configuration."
      );
      break;
  }
};
