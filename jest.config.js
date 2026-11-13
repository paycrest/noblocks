const nextJest = require('next/jest')

const createJestConfig = nextJest({
  // Provide the path to your Next.js app to load next.config.js and .env files
  dir: './',
})

// Add any custom config to be passed to Jest
const customJestConfig = {
  setupFilesAfterEnv: ['<rootDir>/jest.setup.js'],
  testEnvironment: 'jest-environment-jsdom',
  testPathIgnorePatterns: [
    '<rootDir>/.next/',
    '<rootDir>/node_modules/',
    '<rootDir>/__tests__/historyResolverHarness.ts',
  ],
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/app/$1',
  },
  collectCoverageFrom: [
    'app/**/*.{js,jsx,ts,tsx}',
    '!app/**/*.d.ts',
    '!app/node_modules/**',
  ],
  testMatch: [
    '**/__tests__/**/*.(js|jsx|ts|tsx)',
    '**/*.(test|spec).(js|jsx|ts|tsx)'
  ],
  moduleDirectories: ['node_modules', '<rootDir>/'],
  testTimeout: 10000,
}

// createJestConfig is exported this way to ensure that next/jest can load the Next.js config which is async
// jose v6 and ofetch are ESM-only (ofetch is pulled in transitively by
// @privy-io/react-auth/smart-wallets, which BalanceContext.tsx imports) —
// next/jest APPENDS user transformIgnorePatterns after its
// blanket '/node_modules/' ignore (any-match wins), so the exemption must
// REPLACE the resolved patterns instead. Both plain and pnpm layouts covered.
module.exports = async () => {
  const config = await createJestConfig(customJestConfig)()
  config.transformIgnorePatterns = [
    '/node_modules/(?!\\.pnpm)(?!jose)(?!ofetch)',
    '/node_modules/\\.pnpm/(?!jose@)(?!ofetch@)',
    '^.+\\.module\\.(css|sass|scss)$',
  ]
  return config
}