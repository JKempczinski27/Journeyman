describe('Journeyman App – basic flow', () => {
  beforeEach(() => {
    cy.visit('/');
  });

  it('shows validation when no name/email', () => {
    cy.contains('Start').click();
    cy.contains('Please enter both name and email.').should('be.visible');
  });

  it('navigates to mode selection on valid form submit', () => {
    cy.contains('Name').parent().find('input').type('Jane Doe');
    cy.contains('Email').parent().find('input').type('jane@example.com');
    cy.contains('Start').click();
    cy.contains('Choose your mode').should('be.visible');
  });

  it('can start an Easy Mode game and display the header & logos', () => {
    cy.contains('Name').parent().find('input').type('Jane Doe');
    cy.contains('Email').parent().find('input').type('jane@example.com');
    cy.contains('Start').click();

    // USE THE NEW DATA-CY HOOK
    cy.get('[data-cy=easy-mode]').click();
    cy.get('[data-cy=game-header]').should('be.visible');
    cy.get('img[alt]').its('length').should('be.gt', 0);
  });
});
