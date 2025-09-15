// This file is processed and loaded automatically before your test files.
// You can put global configuration or behavior that modifies Cypress here.

// import custom commands if you have any
// import './commands'
import 'cypress-axe'
 import { addMatchImageSnapshotCommand } from '@simonsmith/cypress-image-snapshot/command'

 addMatchImageSnapshotCommand()

 Cypress.Commands.add('helloWorld', () => {
   cy.log('Hello, World!')
 })
