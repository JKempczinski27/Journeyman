// filepath: cypress/e2e/visual.spec.js
describe('Visual Regression', () => {
  it('Home page should match previous snapshot', () => {
    cy.visit('/');
    cy.matchImageSnapshot('home-page');
  });
});
