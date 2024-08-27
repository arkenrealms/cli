import { hello } from "../../../src/commands/hello/index";

describe("Hello Command", () => {
  it('should print "Hello, World!" if no arguments are provided', () => {
    const consoleSpy = jest.spyOn(console, "log").mockImplementation();
    hello([]);
    expect(consoleSpy).toHaveBeenCalledWith("Hello!");
    consoleSpy.mockRestore();
  });

  it('should print "Hello, World!" when "world" is provided as an argument', () => {
    const consoleSpy = jest.spyOn(console, "log").mockImplementation();
    hello(["world"]);
    expect(consoleSpy).toHaveBeenCalledWith("Hello, World!");
    consoleSpy.mockRestore();
  });

  it('should print a generic "Hello!" if an unknown subcommand is provided', () => {
    const consoleSpy = jest.spyOn(console, "log").mockImplementation();
    hello(["unknown"]);
    expect(consoleSpy).toHaveBeenCalledWith("Hello!");
    consoleSpy.mockRestore();
  });
});
