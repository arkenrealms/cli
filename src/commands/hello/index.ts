import { world } from "./world";

export const hello = (args: string[]) => {
  const subcommand = args[0];

  switch (subcommand) {
    case "world":
      world();
      break;
    default:
      console.log("Hello!");
      break;
  }
};
