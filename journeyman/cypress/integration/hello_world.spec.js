describe('Hello World Test', () => {
    it('should display the correct message', () => {
        cy.visit('http://localhost:3000'); // Adjust the URL as needed
        cy.contains('Hello World!'); // Adjust the text as needed
    });
});