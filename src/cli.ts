import { createCli, type TrpcCliMeta, trpcServer, z } from "./";
import ApplicationService from "./modules/application/application.service";
import { createRouter as createApplicationRouter } from "./modules/application/application.router";
import ConfigService from "./modules/config/config.service";
import { createRouter as createConfigRouter } from "./modules/config/config.router";
import MathService from "./modules/math/math.service";
import { createRouter as createMathRouter } from "./modules/math/math.router";
import HelpService from "./modules/help/help.service";
import { createRouter as createHelpRouter } from "./modules/help/help.router";

const trpc = trpcServer.initTRPC.meta<TrpcCliMeta>().create();

const router = trpc.router({
  application: createApplicationRouter(new ApplicationService()),
  config: createConfigRouter(new ConfigService()),
  math: createMathRouter(new MathService()),
  help: createHelpRouter(new HelpService()),
});

void createCli({ router }).run();
