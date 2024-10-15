import { createCli } from "../../";
import Service from "./config.service";
import { createRouter } from "./config.router";

const router = createRouter(new Service());

void createCli({
  router,
  alias: (name, { command }) => {
    if (command === "ls") {
      return "list";
    }
    return undefined;
  },
}).run();
