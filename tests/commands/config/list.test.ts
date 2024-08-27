import fs from "fs";
import { listConfig } from "../../../src/commands/config/list";

describe("List Config Command", () => {
  let consoleSpy: jest.SpyInstance;
  let existsSyncSpy: jest.SpyInstance;
  let readFileSyncSpy: jest.SpyInstance;
  let processExitSpy: jest.SpyInstance;

  beforeEach(() => {
    consoleSpy = jest.spyOn(console, "log").mockImplementation(() => {});
    existsSyncSpy = jest.spyOn(fs, "existsSync").mockReturnValue(true);
    readFileSyncSpy = jest.spyOn(fs, "readFileSync").mockReturnValue(
      JSON.stringify({
        metaverse: "DefaultMetaverse",
        applications: [],
        agents: [],
      })
    );
    processExitSpy = jest
      .spyOn(process, "exit")
      .mockImplementation((code?: number | string | null): never => {
        return undefined as never;
      });
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("should print the current configuration", async () => {
    await listConfig();

    expect(consoleSpy).toHaveBeenCalledWith("Current Configuration:");
    expect(consoleSpy).toHaveBeenCalledWith(
      JSON.stringify(
        { metaverse: "DefaultMetaverse", applications: [], agents: [] },
        null,
        2
      )
    );
    expect(processExitSpy).not.toHaveBeenCalled();
  });

  it("should fail if the configuration file does not exist", async () => {
    existsSyncSpy.mockReturnValue(false);

    // Mock process.exit to throw an error
    processExitSpy = jest
      .spyOn(process, "exit")
      .mockImplementation((code?: number | string | null): never => {
        throw new Error(`process.exit called with code ${code}`);
      });

    expect(() => listConfig()).toThrow("process.exit called with code 1");
    expect(consoleSpy).toHaveBeenCalledWith("No configuration file found.");
    expect(readFileSyncSpy).not.toHaveBeenCalled();
    expect(processExitSpy).toHaveBeenCalledWith(1);

    processExitSpy.mockRestore();
  });
});
