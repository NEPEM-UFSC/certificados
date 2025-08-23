module.exports = {
  projects: [
    {
      displayName: 'netlify-functions',
      preset: 'ts-jest',
      testEnvironment: 'node',
      testMatch: ['<rootDir>/netlify/functions/__tests__/**/*.test.ts'],
      testPathIgnorePatterns: ['<rootDir>/netlify/functions/__tests__/integration/'],
      transform: {
        '^.+\\.ts$': ['ts-jest', { diagnostics: false }],
      },
      transformIgnorePatterns: [
        "node_modules/(?!(node-fetch|fetch-blob|data-uri-to-buffer|formdata-polyfill)/)"
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
      moduleDirectories: ['node_modules', '<rootDir>'],
      transform: {
        '^.+\\.(ts|tsx)$': 'ts-jest',
        '^.+\\.(js|jsx)$': 'babel-jest',
      },
      transformIgnorePatterns: [
        "node_modules/(?!(whatwg-fetch)/)"
      ],
      moduleNameMapper: {
        '\\.(css|less|scss|sass)$': 'identity-obj-proxy',
      },
      testEnvironmentOptions: {
        url: 'http://localhost/',
      },
    },
  ],
};
