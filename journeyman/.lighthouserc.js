module.exports = {
  ci: {
    collect: {
      staticDistDir: null,
      url: ["http://localhost:3000"],
      startServerCommand: "npm start",
      startServerReadyPattern: "Compiled successfully",
      numberOfRuns: 1
    },
    upload: { target: "temporary-public-storage" }
  }
};
