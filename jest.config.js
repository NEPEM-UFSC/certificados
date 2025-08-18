module.exports = {
  projects: [
    {
      displayName: 'netlify-functions',
      preset: 'ts-jest',
      transform: {
        '^.+\\.(ts|tsx|js|jsx)$': 'babel-jest',
      },
      testEnvironment: 'node',
      testMatch: ['<rootDir>/netlify/functions/__tests__/**/*.test.ts'],
      transformIgnorePatterns: [
        "node_modules/(?!(node-fetch|data-uri-to-buffer|fetch-blob|formdata-polyfill)/)",
      ],
      moduleFileExtensions: ['ts', 'js', 'json', 'node'],
    },
    {
      displayName: 'vite-app',
      preset: 'ts-jest',
      testEnvironment: 'jsdom',
      testMatch: ['<rootDir>/src/__tests__/**/*.test.ts'],
      moduleFileExtensions: ['ts', 'js', 'json', 'node'],
      setupFilesAfterEnv: ['<rootDir>/jest.setup.ts'],
    },
  ],
};
