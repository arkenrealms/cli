import fs from "fs";
import path from "path";

const CONFIG_PATH = path.resolve(__dirname, "../../../arken.config.json");

export const setConfig = (args: string[]) => {
  if (args.length === 0 || !args[0].includes("=")) {
    console.log("Invalid usage. Expected format: arken config set key=value");
    process.exit(1);
  }

  const [key, value] = args[0].split("=");

  if (key !== "metaverse") {
    console.log(`Invalid key. Only "metaverse" can be set.`);
    return;
  }

  if (!value) {
    console.log("Value for metaverse is required.");
    return;
  }

  let config = {};
  if (fs.existsSync(CONFIG_PATH)) {
    config = JSON.parse(fs.readFileSync(CONFIG_PATH, "utf-8"));
  }

  // update the config object with the new key-value pair
  config = {
    ...config,
    [key]: value,
  };

  // write the updated config object back to the file

  fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2));
  console.log(`Configuration updated: ${key}=${value}`);
};
