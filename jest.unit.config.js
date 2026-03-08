module.exports = {
  preset: "ts-jest",
  testEnvironment: "node",
  roots: ["<rootDir>/test"],
  collectCoverageFrom: [
    "<rootDir>/**/*.ts",
    "!<rootDir>/build/**",
    "!<rootDir>/test/**",
    "!<rootDir>/bin/**",
    "!<rootDir>/jest.unit.config.js",
  ],
  coverageDirectory: "./coverage",
  testMatch: ["<rootDir>/test/**/*.test.ts", "<rootDir>/test/**/*.test.tsx"],
  moduleFileExtensions: ["ts", "tsx", "js", "jsx", "json", "node"],
  transform: {
    "^.+\\.tsx?$": "ts-jest",
  },
  moduleNameMapper: {
    "^vitest$": "<rootDir>/test/vitest.ts",
  },
  testPathIgnorePatterns: ["<rootDir>/build/"],
  testTimeout: 30000,
};
