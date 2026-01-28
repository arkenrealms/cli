import fs from 'fs';
import path from 'path';
import { prompt } from 'enquirer';

const CONFIG_PATH = path.resolve(__dirname, '../../../arken.config.json');

type Config = {
  option?: {
    metaverse?: string;
    applications?: string[];
  };
};

export default class Service {
  async create(input) {
    const [name] = input;
    const loadConfig = (): Config => {
      if (fs.existsSync(CONFIG_PATH)) {
        return JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf-8'));
      }
      throw new Error('Config file does not exist.');
    };

    const saveConfig = (config: Config) => {
      fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2));
    };

    const promptMetaverse = async (): Promise<string> => {
      const response = await prompt<{ metaverse: string }>({
        type: 'input',
        name: 'metaverse',
        message: 'No metaverse is set. Please enter the metaverse name:',
      });
      return response.metaverse;
    };

    const config = loadConfig();

    let metaverse = config.option?.metaverse;
    if (!metaverse) {
      metaverse = await promptMetaverse();
      if (!config.option) config.option = {};
      config.option.metaverse = metaverse;
      saveConfig(config);
    }

    // Check if application already exists from db
    // (This is where you'll add the database check logic later)
    //
    //
    //

    // Create application in the db
    // (This is where you'll add the application creation logic later)
    //
    //
    //

    // Ensure the applications array exists
    if (!config.option) {
      config.option = {};
    }
    if (!config.option.applications) {
      config.option.applications = [];
    }

    if (config.option.applications.includes(name)) {
      console.log(`Application "${name}" already exists in the configuration.`);
      process.exit(1);
    }

    config.option.applications.push(name);
    saveConfig(config);

    console.log(`Application created: ${name}`);
  }
}
