describe('Journeyman Accessibility Audits', () => {
  beforeEach(() => {
    cy.visit('/');
    cy.injectAxe();
  });

  it('has no critical/serious a11y violations on load', () => {
    cy.checkA11y(null, {
      includedImpacts: ['critical', 'serious'],
      // temporarily disable image-alt if you still have decorative images
      rules: { 'image-alt': { enabled: false } },
    });
  });

  it('remains accessible on mode selection', () => {
    // fill and submit the form to get to the landing page
    cy.contains('Name').parent().find('input').type('Jane Doe');
    cy.contains('Email').parent().find('input').type('jane@example.com');
    cy.contains('Start').click();

    // now click Easy Mode
    cy.get('[data-cy=easy-mode]').should('be.visible').click();

    // re-inject axe after navigation
    cy.injectAxe();
    cy.checkA11y(null, {
      includedImpacts: ['critical', 'serious'],
      rules: { 'image-alt': { enabled: false } },
    });
  });
});