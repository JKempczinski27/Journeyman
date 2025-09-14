const VaultService = require('../../services/vaultService');

const ADOBE_ANALYTICS_CONFIG = {
  async getConfig() {
    try {
      const secrets = await VaultService.getSecret('adobe-analytics');
      return {
        edgeConfigId: secrets.edgeConfigId,
        orgId: secrets.orgId,
        reportSuiteId: process.env.NODE_ENV === 'production'
          ? secrets.prodReportSuiteId
          : secrets.devReportSuiteId,
        trackingServer: secrets.trackingServer,
        environment: process.env.NODE_ENV || 'development'
      };
    } catch (error) {
      console.error('Failed to load Adobe Analytics configuration:', error);
      throw new Error('Failed to load Adobe Analytics configuration');
    }
  },

  // Fallback configuration for development/testing
  getFallbackConfig() {
    return {
      edgeConfigId: process.env.ADOBE_EDGE_CONFIG_ID || 'dev-config-id',
      orgId: process.env.ADOBE_ORG_ID || 'dev-org-id',
      reportSuiteId: process.env.ADOBE_REPORT_SUITE_ID || 'dev-report-suite',
      trackingServer: process.env.ADOBE_TRACKING_SERVER || 'dev.sc.omtrdc.net',
      environment: process.env.NODE_ENV || 'development'
    };
  },

  // Get configuration with fallback
  async getConfigSafe() {
    try {
      return await this.getConfig();
    } catch (error) {
      console.warn('Using fallback Adobe Analytics configuration:', error.message);
      return this.getFallbackConfig();
    }
  }
};
