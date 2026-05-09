import '@testing-library/jest-dom'
import { TextEncoder, TextDecoder } from 'util'

jest.mock('@sentry/react', () => ({
  init: jest.fn(),
  captureException: jest.fn(),
  ErrorBoundary: ({ children }) => children,
}))

// Mock environment variables for tests
process.env.SUPABASE_URL = 'https://test.supabase.co'
process.env.SUPABASE_SECRET_KEY = 'sb_secret_test_placeholder'
process.env.NEXT_PUBLIC_PRIVY_APP_ID = 'test-privy-app-id'
process.env.INTERNAL_API_KEY = 'test-internal-api-key'

// Polyfill TextEncoder/TextDecoder for Node.js environment
global.TextEncoder = TextEncoder
global.TextDecoder = TextDecoder

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