import '@testing-library/jest-dom'
import { TextEncoder, TextDecoder } from 'util'

jest.mock('@sentry/react', () => ({
  init: jest.fn(),
  captureException: jest.fn(),
  ErrorBoundary: ({ children }) => children,
}))

jest.mock('@datadog/browser-rum', () => ({
  datadogRum: {
    init: jest.fn(),
    startView: jest.fn(),
    addAction: jest.fn(),
    setUser: jest.fn(),
  },
}))

// Mock environment variables for tests
process.env.SUPABASE_URL = 'https://test.supabase.co'
process.env.SUPABASE_SECRET_KEY = 'sb_secret_test_placeholder'
process.env.NEXT_PUBLIC_PRIVY_APP_ID = 'test-privy-app-id'
process.env.INTERNAL_API_KEY = 'test-internal-api-key'

// Polyfill TextEncoder/TextDecoder for Node.js environment
global.TextEncoder = TextEncoder
global.TextDecoder = TextDecoder
// Keep Uint8Array in the same realm as the polyfilled TextEncoder: the Node
// encoder emits Node-realm arrays, and cross-realm `instanceof Uint8Array`
// checks (e.g. inside jose) fail against jsdom's own constructor.
global.Uint8Array = new TextEncoder().encode('').constructor

// Polyfill structuredClone for jsdom (jose's JWT builder uses it). v8
// serialize/deserialize is a faithful structured clone for plain data.
if (typeof global.structuredClone !== 'function') {
  const v8 = require('v8')
  global.structuredClone = (value) => v8.deserialize(v8.serialize(value))
}

// jsdom's crypto lacks subtle and randomUUID (jose needs both for HMAC JWTs)
// — use Node's WebCrypto wholesale.
if (typeof globalThis.crypto?.subtle === 'undefined') {
  Object.defineProperty(globalThis, 'crypto', {
    value: require('crypto').webcrypto,
    configurable: true,
  })
}

// Mock fetch for tests
global.fetch = jest.fn()

// Mock window.ethereum for wallet tests
Object.defineProperty(window, 'ethereum', {
  writable: true,
  value: {
    request: jest.fn(),
    on: jest.fn(),
    removeListener: jest.fn(),
  },
})

// Mock localStorage
Object.defineProperty(window, 'localStorage', {
  value: {
    getItem: jest.fn(),
    setItem: jest.fn(),
    removeItem: jest.fn(),
    clear: jest.fn(),
  },
  writable: true,
})

// Suppress console warnings in tests
console.warn = jest.fn()
console.error = jest.fn()