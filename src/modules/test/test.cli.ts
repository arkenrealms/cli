import { createCli } from '../..';
import Service from './test.service';
import { createRouter } from './test.router';
import { link } from '../../router';

const router = createRouter(new Service());

void createCli({ router, link }).run();
