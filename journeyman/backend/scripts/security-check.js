const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

/**
 * Security validation script for Journeyman backend
 * Checks configuration and validates security settings
 */

console.log('🔍 Running security validation for Journeyman backend...\n');

let issuesFound = 0;
const warnings = [];
const errors = [];

// Check if .env file exists and has required variables
const envPath = path.join(__dirname, '..', '.env');
if (!fs.existsSync(envPath)) {
  errors.push('❌ .env file not found. Run: npm run setup-security');
  issuesFound++;
} else {
  const envContent = fs.readFileSync(envPath, 'utf8');

  // Check required environment variables
  const requiredVars = [
    'SESSION_SECRET',
    'API_KEY',
    'ENCRYPTION_KEY',
    'WEBHOOK_SECRET'
  ];

  requiredVars.forEach(varName => {
    const regex = new RegExp(`^${varName}=(.+)$`, 'm');
    const match = envContent.match(regex);

    if (!match) {
      errors.push(`❌ Missing required environment variable: ${varName}`);
      issuesFound++;
    } else {
      const value = match[1].trim();

      // Check key strength
      if (varName === 'SESSION_SECRET' && value.length < 64) {
        warnings.push(`⚠️  ${varName} should be at least 64 characters for production`);
      }

      if (varName === 'ENCRYPTION_KEY' && value.length < 64) {
        warnings.push(`⚠️  ${varName} should be at least 64 characters for production`);
      }

      if (varName === 'API_KEY' && value.length < 32) {
        warnings.push(`⚠️  ${varName} should be at least 32 characters for production`);
      }
    }
  });
}

// Check if security middleware file exists
const securityMiddlewarePath = path.join(__dirname, '..', 'middleware', 'security.js');
if (!fs.existsSync(securityMiddlewarePath)) {
  errors.push('❌ Security middleware not found: middleware/security.js');
  issuesFound++;
} else {
  console.log('✅ Security middleware found');
}

// Check package.json for security-related dependencies
const packageJsonPath = path.join(__dirname, '..', 'package.json');
if (fs.existsSync(packageJsonPath)) {
  const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
  const dependencies = { ...packageJson.dependencies, ...packageJson.devDependencies };

  const securityDeps = [
    'helmet',
    'express-rate-limit',
    'express-mongo-sanitize',
    'xss-clean',
    'hpp',
    'bcrypt'
  ];

  const missingDeps = securityDeps.filter(dep => !dependencies[dep]);
  if (missingDeps.length > 0) {
    warnings.push(`⚠️  Missing recommended security dependencies: ${missingDeps.join(', ')}`);
  }
} else {
  warnings.push('⚠️  package.json not found');
}

// Check file permissions (Unix-like systems)
if (process.platform !== 'win32') {
  try {
    const envStats = fs.statSync(envPath);
    const permissions = '0' + (envStats.mode & parseInt('777', 8)).toString(8);

    if (permissions !== '0600' && permissions !== '0644') {
      warnings.push(`⚠️  .env file permissions are ${permissions}. Consider: chmod 600 .env`);
    }
  } catch (error) {
    // File doesn't exist or permission error
  }
}

// Check Node.js version
const nodeVersion = process.version;
const majorVersion = parseInt(nodeVersion.substring(1).split('.')[0]);

if (majorVersion < 16) {
  warnings.push(`⚠️  Node.js ${nodeVersion} detected. Consider upgrading to Node.js 18+ for better security`);
}

// Output results
console.log('📊 Security Validation Results:');
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

if (errors.length === 0 && warnings.length === 0) {
  console.log('🎉 All security checks passed!');
  console.log('✅ Your Journeyman backend is properly configured');
} else {
  if (errors.length > 0) {
    console.log('\n🚨 CRITICAL ISSUES:');
    errors.forEach(error => console.log(`   ${error}`));
  }

  if (warnings.length > 0) {
    console.log('\n⚠️  WARNINGS:');
    warnings.forEach(warning => console.log(`   ${warning}`));
  }
}

console.log('\n🛡️  Security Recommendations:');
console.log('   • Regularly update dependencies: npm audit fix');
console.log('   • Use HTTPS in production');
console.log('   • Implement proper logging and monitoring');
console.log('   • Regular security audits and penetration testing');
console.log('   • Keep Node.js and dependencies up to date');
console.log('   • Use environment-specific configurations');

console.log('\n📚 Additional Security Resources:');
console.log('   • OWASP Top 10: https://owasp.org/www-project-top-ten/');
console.log('   • Node.js Security Best Practices: https://nodejs.org/en/docs/guides/security/');
console.log('   • Express Security Best Practices: https://expressjs.com/en/advanced/best-practice-security.html');

if (issuesFound > 0) {
  console.log(`\n❌ Found ${issuesFound} critical issue(s) that need immediate attention`);
  process.exit(1);
} else {
  console.log('\n✅ Security validation complete!');
  process.exit(0);
}
