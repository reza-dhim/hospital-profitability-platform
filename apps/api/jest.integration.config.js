/** @type {import('jest').Config} */
module.exports = {
  rootDir: "src",
  testEnvironment: "node",
  transform: {
    "^.+\\.ts$": ["ts-jest", { tsconfig: "<rootDir>/../tsconfig.json" }],
  },
  testRegex: ".*\\.integration-spec\\.ts$",
  moduleFileExtensions: ["js", "json", "ts"],
  testTimeout: 120000,
};
