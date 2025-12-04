import './commands'

// Import Cypress commands
declare global {
  namespace Cypress {
    interface Chainable {
      /**
       * Custom command to connect a test wallet
       * @example cy.connectTestWallet('0x1234...5678')
       */
      connectTestWallet(address: string): Chainable<Element>
      
      /**
       * Custom command to mock JWT authentication
       * @example cy.mockAuth('test-user-id')
       */
      mockAuth(userId: string): Chainable<Element>
      
      /**
       * Custom command to intercept transaction API calls
       * @example cy.mockTransactionAPI()
       */
      mockTransactionAPI(): Chainable<Element>
      
      /**
       * Custom command to set up test environment
       * @example cy.setupTestEnvironment()
       */
      setupTestEnvironment(): Chainable<Element>
    }
  }
}

// Global test configuration
beforeEach(() => {
  // Clear localStorage and sessionStorage before each test
  cy.clearLocalStorage()
  cy.clearCookies()
  
  // Set up test environment
  cy.window().then((win) => {
    // Mock window.ethereum for wallet tests
    win.ethereum = {
      request: cy.stub().resolves(['0x742d35Cc6634C0532925a3b8D87C8c86e3f8ba8C']),
      on: cy.stub(),
      removeListener: cy.stub(),
    }
  })
})

// Global error handling
Cypress.on('uncaught:exception', (err, runnable) => {
  // Prevent Cypress from failing tests on uncaught exceptions that are not related to our test assertions
  if (err.message.includes('ResizeObserver loop limit exceeded')) {
    return false
  }
  if (err.message.includes('Non-Error promise rejection captured')) {
    return false
  }
  // Let other errors fail the test
  return true
})