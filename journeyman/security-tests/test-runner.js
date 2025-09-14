#!/usr/bin/env node

const SecurityTester = require('./penetration-tests');
const path = require('path');
const fs = require('fs');

class SecurityTestRunner {
  constructor() {
    this.config = this.loadConfig();
  }

  loadConfig() {
    const configPath = path.join(__dirname, 'config.json');

    if (fs.existsSync(configPath)) {
      return JSON.parse(fs.readFileSync(configPath, 'utf8'));
    }

    // Default configuration
    return {
      targets: [
        { name: 'Local Development', url: 'http://localhost:3001' },
        { name: 'Production', url: 'https://journeyman-production.up.railway.app' }
      ],
      options: {
        timeout: 15000,
        verbose: true,
        maxRetries: 3
      }
    };
  }

  async runTests(targetUrl, options = {}) {
    console.log(`\n🎯 Testing: ${targetUrl}`);
    console.log('─'.repeat(50));

    const tester = new SecurityTester(targetUrl, {
      ...this.config.options,
      ...options
    });

    try {
      const report = await tester.runAllTests();
      return report;
    } catch (error) {
      console.error(`❌ Test failed for ${targetUrl}: ${error.message}`);
      return null;
    }
  }

  async runAllTargets() {
    const reports = [];

    for (const target of this.config.targets) {
      const outputFile = `security-report-${target.name.toLowerCase().replace(/\s+/g, '-')}-${Date.now()}.json`;

      const report = await this.runTests(target.url, {
        outputFile,
        targetName: target.name
      });

      if (report) {
        reports.push({ ...report, target: target.name, url: target.url });
      }
    }

    this.generateSummaryReport(reports);
    return reports;
  }

  generateSummaryReport(reports) {
    console.log('\n' + '='.repeat(80));
    console.log('📋 SECURITY TEST SUMMARY - ALL TARGETS');
    console.log('='.repeat(80));

    reports.forEach(report => {
      console.log(`\n🎯 ${report.target} (${report.url})`);
      console.log(`   Risk Level: ${report.summary.riskLevel}`);
      console.log(`   Tests: ${report.summary.totalTests} | Passed: ${report.summary.passed} | Failed: ${report.summary.failed} | Critical: ${report.summary.critical}`);
    });

    // Overall security status
    const totalCritical = reports.reduce((sum, r) => sum + r.summary.critical, 0);
    const totalFailed = reports.reduce((sum, r) => sum + r.summary.failed, 0);

    console.log(`\n🎯 OVERALL SECURITY STATUS:`);
    if (totalCritical > 0) {
      console.log(`   🚨 CRITICAL: ${totalCritical} critical vulnerabilities across all targets`);
    } else if (totalFailed > 10) {
      console.log(`   ❌ HIGH RISK: ${totalFailed} failed tests across all targets`);
    } else if (totalFailed > 5) {
      console.log(`   ⚠️  MEDIUM RISK: ${totalFailed} failed tests across all targets`);
    } else if (totalFailed > 0) {
      console.log(`   ✅ LOW RISK: ${totalFailed} failed tests across all targets`);
    } else {
      console.log(`   🎉 EXCELLENT: All security tests passed!`);
    }

    console.log('='.repeat(80));
  }

  async quickTest(url) {
    console.log(`🚀 Running quick security check for: ${url}`);

    const tester = new SecurityTester(url, {
      timeout: 5000,
      verbose: false,
      maxRetries: 1
    });

    // Run only critical tests
    await tester.testAccessControl();
    await tester.testInjectionAttacks();

    const report = tester.generateReport();

    console.log(`\n📊 Quick Test Results:`);
    console.log(`   Risk Level: ${report.summary.riskLevel}`);
    console.log(`   Critical Issues: ${report.summary.critical}`);
    console.log(`   Failed Tests: ${report.summary.failed}`);

    if (report.summary.critical > 0) {
      console.log(`\n🚨 Critical vulnerabilities found! Run full test for details.`);
      return false;
    }

    return report.summary.failed === 0;
  }
}

// CLI interface
async function main() {
  const runner = new SecurityTestRunner();
  const args = process.argv.slice(2);
  const command = args[0];
  const target = args[1];

  switch (command) {
    case 'quick':
      if (!target) {
        console.error('Usage: node test-runner.js quick <url>');
        process.exit(1);
      }
      const passed = await runner.quickTest(target);
      process.exit(passed ? 0 : 1);

    case 'single':
      if (!target) {
        console.error('Usage: node test-runner.js single <url>');
        process.exit(1);
      }
      const report = await runner.runTests(target, { outputFile: `security-report-${Date.now()}.json` });
      process.exit(report && report.summary.critical === 0 ? 0 : 1);

    case 'all':
    default:
      const reports = await runner.runAllTargets();
      const totalCritical = reports.reduce((sum, r) => sum + r.summary.critical, 0);
      process.exit(totalCritical === 0 ? 0 : 1);
  }
}

if (require.main === module) {
  main().catch(console.error);
}

module.exports = SecurityTestRunner;
