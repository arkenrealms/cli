module.exports = {
  preset: "ts-jest",
  testEnvironment: "node",
  roots: ["<rootDir>/tests"], // Point to the 'tests' directory in the root
  collectCoverageFrom: ["<rootDir>/src/**/*.{ts,tsx}"], // Collect coverage from source files
  coverageDirectory: "./coverage",
  testMatch: ["**/*.test.ts", "**/*.test.tsx"], // Match test files in 'tests' directory
  moduleFileExtensions: ["ts", "tsx", "js", "jsx", "json", "node"],
  transform: {
    "^.+\\.tsx?$": "ts-jest", // Use ts-jest for transforming TypeScript files
  },
};
