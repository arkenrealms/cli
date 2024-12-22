import fs from 'fs';
import path from 'path';
import { TRPCError } from '@trpc/server';

const CONFIG_PATH = path.resolve(__dirname, '../../../arken.config.json');

type Config = {
  option?: {
    metaverse?: string;
    applications?: string[];
  };
};

function checkConfigFileExists() {
  if (!fs.existsSync(CONFIG_PATH)) {
    console.log('No configuration file found.');
    process.exit(1);
  }

  const config = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf-8'));
  console.log('Current Configuration:');
  console.log(JSON.stringify(config, null, 2));
}

export default class Service {
  async list(input) {
    checkConfigFileExists();

    const config = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf-8'));
    console.log('Current Configuration:');
    console.log(JSON.stringify(config, null, 2));
  }

  async set(input) {
    const [key, value] = input;

    checkConfigFileExists();

    if (key !== 'metaverse') {
      // console.log(`Invalid key. Only "metaverse" can be set.`);
      throw new TRPCError({
        code: 'BAD_REQUEST',
        message: `Invalid key. Only "metaverse" can be set.`,
      });
      return;
    }

    if (!value) {
      throw new TRPCError({
        code: 'BAD_REQUEST',
        message: 'Value for metaverse is required.',
      });
    }

    let config: Config = {};
    if (fs.existsSync(CONFIG_PATH)) {
      config = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf-8'));
    } else {
      throw new Error('Config file does not exist.');
    }

    // Ensure that the config object has an "option" key
    if (!config.option) {
      config.option = {};
    }

    // Update the "option" object with the new key-value pair
    config.option[key] = value;

    // write the updated config object back to the file

    fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2));
    console.log(`Configuration updated: ${key}=${value}`);
  }
}
