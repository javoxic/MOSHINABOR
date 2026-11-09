/** @type {import('jest').Config} */
const common = {
  transform: { '^.+\\.ts$': ['ts-jest', { tsconfig: '<rootDir>/tsconfig.test.json' }] },
  moduleFileExtensions: ['ts', 'js', 'json'],
  testEnvironment: 'node',
  moduleNameMapper: { '^@moshina/shared$': '<rootDir>/../packages/shared/src/index.ts' },
};
module.exports = {
  projects: [
    { ...common, displayName: 'unit', rootDir: __dirname, testMatch: ['<rootDir>/src/**/*.spec.ts'] },
    {
      ...common,
      displayName: 'e2e',
      rootDir: __dirname,
      testMatch: ['<rootDir>/test/**/*.e2e-spec.ts'],
      globalSetup: '<rootDir>/test/global-setup.ts',
      setupFiles: ['<rootDir>/test/env-setup.ts'],
    },
  ],
};
