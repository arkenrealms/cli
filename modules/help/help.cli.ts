import { createCli } from "../..";
import Service from "./help.service";
import { createRouter } from "./help.router";
import { link } from "../../router";

const router = createRouter(new Service());

void createCli({ router, link }).run();
