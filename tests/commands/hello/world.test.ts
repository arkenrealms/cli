import { world } from "../../../src/commands/hello/world";

describe("World Subcommand", () => {
  it('should print "Hello, World!"', () => {
    const consoleSpy = jest.spyOn(console, "log").mockImplementation();
    world();
    expect(consoleSpy).toHaveBeenCalledWith("Hello, World!");
    consoleSpy.mockRestore();
  });
});
