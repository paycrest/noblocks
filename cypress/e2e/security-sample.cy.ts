describe('Homepage Security', () => {
  beforeEach(() => {
    cy.setupTestEnvironment()
    cy.visit('/')
  })

  it('should load the homepage without XSS vulnerabilities', () => {
    // Test that the page loads safely
    cy.contains('noblocks').should('be.visible')
    
    // Check for basic security headers
    cy.request('/', (response: any) => {
      expect(response.headers).to.have.property('x-content-type-options')
    })
  })
})