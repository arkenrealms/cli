import fs from "fs";
import path from "path";

const CONFIG_PATH = path.resolve(__dirname, "../../../arken.config.json");

export const listConfig = async () => {
  if (!fs.existsSync(CONFIG_PATH)) {
    console.log("No configuration file found.");
    process.exit(1);
  }

  const config = JSON.parse(fs.readFileSync(CONFIG_PATH, "utf-8"));
  console.log("Current Configuration:");
  console.log(JSON.stringify(config, null, 2));
};
