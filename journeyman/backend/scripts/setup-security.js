const fs = require('fs');
const path = require('path');
const SecurityUtils = require('../utils/security-utils');

/**
 * Security setup script for Journeyman backend
 * Generates secure keys and environment configuration
 */

console.log('🔐 Setting up security configuration for Journeyman...\n');

// Generate secure keys
const sessionSecret = SecurityUtils.generateSessionSecret();
const apiKey = SecurityUtils.generateApiKey();
const encryptionKey = SecurityUtils.generateEncryptionKey();
const webhookSecret = SecurityUtils.generateSessionSecret(32);

// Create secure environment configuration
const envContent = `# Journeyman Backend Security Configuration
# Generated on ${new Date().toISOString()}

# Server Configuration
PORT=3001
NODE_ENV=development
FRONTEND_URL=http://localhost:3000

# Database Configuration
# DATABASE_URL=postgresql://username:password@localhost:5432/journeyman_db

# Security Keys (KEEP THESE SECRET!)
SESSION_SECRET=${sessionSecret}
API_KEY=${apiKey}
ENCRYPTION_KEY=${encryptionKey}
WEBHOOK_SECRET=${webhookSecret}

# Rate Limiting Configuration
RATE_LIMIT_WINDOW_MS=900000
RATE_LIMIT_MAX_REQUESTS=100
AUTH_RATE_LIMIT_MAX=5

# SSL Configuration (for production)
# SSL_CERT=/path/to/certificate.crt
# SSL_KEY=/path/to/private.key

# Database SSL (for production)
# DB_CA_CERT=/path/to/ca-certificate.crt
# DB_CLIENT_CERT=/path/to/client-certificate.crt
# DB_CLIENT_KEY=/path/to/client-key.key

# Monitoring and Logging
LOG_LEVEL=info
SECURITY_LOG_RETENTION_DAYS=90

# External Services (optional)
# SIEM_ENDPOINT=https://your-siem-service.com/api/logs
# DATADOG_API_KEY=your_datadog_api_key
# SPLUNK_HEC_URL=https://your-splunk-instance.com:8088
`;

// Write environment file
const envPath = path.join(__dirname, '..', '.env');
fs.writeFileSync(envPath, envContent);

console.log('✅ Generated secure environment configuration');
console.log(`📝 Environment file created: ${envPath}`);
console.log('\n🔑 Generated Security Keys:');
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.log(`Session Secret: ${sessionSecret.substring(0, 20)}...`);
console.log(`API Key: ${apiKey.substring(0, 20)}...`);
console.log(`Encryption Key: ${encryptionKey.substring(0, 20)}...`);
console.log(`Webhook Secret: ${webhookSecret.substring(0, 20)}...`);
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

console.log('\n⚠️  IMPORTANT SECURITY NOTES:');
console.log('1. Keep your .env file secure and never commit it to version control');
console.log('2. Use different keys for development, staging, and production');
console.log('3. Rotate keys regularly in production environments');
console.log('4. Configure your database connection string in .env');
console.log('5. For production, configure SSL certificates and enable HTTPS');

console.log('\n🚀 Next steps:');
console.log('1. Review and update the .env file with your database configuration');
console.log('2. Run: npm run dev (to start in development mode)');
console.log('3. Run: npm run security-check (to validate security configuration)');

console.log('\n✅ Security setup complete!');
