import fs from "fs";
import { setConfig } from "../../../src/commands/config/set";

describe("Set Config Command", () => {
  let writeFileSyncSpy: jest.SpyInstance;
  let consoleSpy: jest.SpyInstance;
  let existsSyncSpy: jest.SpyInstance;
  let readFileSyncSpy: jest.SpyInstance;

  beforeEach(() => {
    writeFileSyncSpy = jest
      .spyOn(fs, "writeFileSync")
      .mockImplementation(() => {});
    consoleSpy = jest.spyOn(console, "log").mockImplementation(() => {});
    existsSyncSpy = jest.spyOn(fs, "existsSync").mockReturnValue(true);
    readFileSyncSpy = jest.spyOn(fs, "readFileSync").mockReturnValue(
      JSON.stringify({
        metaverse: "DefaultMetaverse",
        applications: [],
        agents: [],
      })
    );
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("should update the configuration with a new value", () => {
    setConfig(["metaverse=NewMetaverse"]);

    expect(writeFileSyncSpy).toHaveBeenCalledWith(
      expect.anything(),
      JSON.stringify(
        { metaverse: "NewMetaverse", applications: [], agents: [] },
        null,
        2
      )
    );
    expect(consoleSpy).toHaveBeenCalledWith(
      "Configuration updated: metaverse=NewMetaverse"
    );
  });

  it("should fail when an invalid key is provided", () => {
    setConfig(["invalidKey=SomeValue"]);

    expect(consoleSpy).toHaveBeenCalledWith(
      'Invalid key. Only "metaverse" can be set.'
    );
    expect(writeFileSyncSpy).not.toHaveBeenCalled();
  });

  it("should fail when no value is provided for metaverse", () => {
    setConfig(["metaverse="]);

    expect(consoleSpy).toHaveBeenCalledWith("Value for metaverse is required.");
    expect(writeFileSyncSpy).not.toHaveBeenCalled();
  });

  it("should fail when no arguments are provided", () => {
    const exitSpy = jest
      .spyOn(process, "exit")
      .mockImplementation((code?: string | number | null) => {
        throw new Error(`process.exit called with code ${code}`);
      });

    expect(() => setConfig([])).toThrow("process.exit called with code 1");
    expect(consoleSpy).toHaveBeenCalledWith(
      "Invalid usage. Expected format: arken config set key=value"
    );
    expect(writeFileSyncSpy).not.toHaveBeenCalled();

    exitSpy.mockRestore();
  });

  it("should create a new config file if it does not exist", () => {
    existsSyncSpy.mockReturnValue(false);

    setConfig(["metaverse=NewMetaverse"]);

    expect(writeFileSyncSpy).toHaveBeenCalledWith(
      expect.anything(),
      JSON.stringify({ metaverse: "NewMetaverse" }, null, 2)
    );
    expect(consoleSpy).toHaveBeenCalledWith(
      "Configuration updated: metaverse=NewMetaverse"
    );
  });
});
