import { createCli } from "../../";
import Service from "./math.service";
import { createRouter } from "./math.router";

const router = createRouter(new Service());

void createCli({ router }).run();
