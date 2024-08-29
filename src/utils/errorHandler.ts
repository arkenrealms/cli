import { TRPCError } from "@trpc/server";

// Define a custom error class for Commander.js errors if needed
export class CommanderError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CommanderError";
  }
}

export function handleError(error: unknown): void {
  if (error instanceof TRPCError) {
    console.error(`tRPC Error: ${error.message}`);
  } else if (error instanceof CommanderError) {
    console.error(`Commander Error: ${error.message}`);
  } else if (error instanceof Error) {
    console.error(`Error: ${error.message}`);
  } else {
    console.error("An unexpected error occurred:", error);
  }
  process.exit(1); // Exit with an error code
}
