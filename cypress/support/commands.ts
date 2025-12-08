/// <reference types="cypress" />

// Custom command to connect a test wallet
Cypress.Commands.add('connectTestWallet', (address: string) => {
  cy.window().then((win: any) => {
    win.ethereum = {
      request: cy.stub().resolves([address]),
      on: cy.stub(),
      removeListener: cy.stub(),
    }
  })
  
  // Mock localStorage for wallet connection
  cy.window().then((win) => {
    win.localStorage.setItem('walletConnected', 'true')
    win.localStorage.setItem('walletAddress', address)
  })
})

// Custom command to mock JWT authentication
Cypress.Commands.add('mockAuth', (userId: string) => {
  const mockToken = `eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.${btoa(JSON.stringify({
    sub: userId,
    iss: 'privy.io',
    aud: 'test-app-id',
    exp: Math.floor(Date.now() / 1000) + 3600
  }))}.mock-signature`
  
  // Intercept API calls that require authentication
  cy.intercept('GET', '/api/v1/transactions*', {
    fixture: ''
  }).as('getTransactions')
  
  // Mock JWT in localStorage
  cy.window().then((win) => {
    win.localStorage.setItem('authToken', mockToken)
  })
})

// Custom command to mock transaction API
Cypress.Commands.add('mockTransactionAPI', () => {
  // Mock successful transaction creation
  cy.intercept('POST', '/api/v1/transactions', {
    statusCode: 201,
    body: {
      success: true,
      data: {
        id: 'test-transaction-id',
        wallet_address: '0x742d35Cc6634C0532925a3b8D87C8c86e3f8ba8C',
        status: 'completed'
      }
    }
  }).as('createTransaction')
  
  // Mock transaction history
  cy.intercept('GET', '/api/v1/transactions*', {
    fixture: ''
  }).as('getTransactions')
  
  // Mock KYC endpoints
  cy.intercept('POST', '/api/v1/account/verify', {
    statusCode: 200,
    body: {
      status: 'success',
      data: {
        url: 'https://test-kyc-url.com',
        expiresAt: new Date(Date.now() + 3600000).toISOString()
      }
    }
  }).as('initiateKYC')
})

// Custom command to set up test environment
Cypress.Commands.add('setupTestEnvironment', () => {
  // Clear any existing state
  cy.clearLocalStorage()
  cy.clearCookies()
  
  // Set test environment variables
  cy.window().then((win: any) => {
    win.process = { env: { NEXT_PUBLIC_TEST_MODE: 'true' } }
  })
  
  // Mock external services
  cy.intercept('GET', 'https://api.paycrest.io/**', { fixture: '' })
  cy.intercept('POST', 'https://api.paycrest.io/**', { statusCode: 200, body: { success: true } })
})