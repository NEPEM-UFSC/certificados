import { TextEncoder, TextDecoder } from 'util';

// Polyfill TextEncoder and TextDecoder for JSDOM environment
// @ts-ignore
global.TextEncoder = TextEncoder;
// @ts-ignore
global.TextDecoder = TextDecoder;

import '@testing-library/jest-dom';

// Mock lucide.createIcons() as it's used in main.ts and not available in JSDOM
declare global {
  namespace NodeJS {
    interface Global {
      lucide: {
        createIcons: jest.Mock;
      };
    }
  }
}

global.lucide = {
  createIcons: jest.fn(),
};
