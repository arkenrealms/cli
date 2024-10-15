import { createCli } from "../../";
import Service from "./application.service";
import { createRouter } from "./application.router";

const router = createRouter(new Service());

void createCli({ router }).run();
