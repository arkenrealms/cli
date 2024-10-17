import { createCli } from "./";
import { router, combinedLink } from "./router";

void createCli({ router: router, link: combinedLink }).run();
