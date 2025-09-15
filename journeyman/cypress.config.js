// cypress.config.js
const { defineConfig } = require("cypress");
const { addMatchImageSnapshotPlugin } = 
  require("@simonsmith/cypress-image-snapshot/plugin");

module.exports = defineConfig({
  e2e: {
    baseUrl: "http://localhost:3000",
    specPattern: "cypress/e2e/**/*.spec.js",
    supportFile: "cypress/support/e2e.js",
    setupNodeEvents(on, config) {
      addMatchImageSnapshotPlugin(on, config);
      return config;
    },
  },
});
