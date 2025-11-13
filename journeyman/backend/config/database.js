// backend/config/database.js
const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');

// Determine if we're running on Railway or locally
const isProduction = process.env.NODE_ENV === 'production';
const isRailway = process.env.RAILWAY_ENVIRONMENT === 'production';

// Production SSL configuration with certificate support
function getSSLConfig() {
  if (!isProduction && !process.env.DATABASE_URL) {
    return false; // No SSL for local development
  }

  const sslConfig = {
    rejectUnauthorized: process.env.DB_SSL_REJECT_UNAUTHORIZED !== 'false'
  };

  // Load SSL certificates if provided
  try {
    if (process.env.DB_CA_CERT) {
      const caPath = process.env.DB_CA_CERT;
      if (fs.existsSync(caPath)) {
        sslConfig.ca = fs.readFileSync(caPath).toString();
      }
    }

    if (process.env.DB_CLIENT_CERT && process.env.DB_CLIENT_KEY) {
      const certPath = process.env.DB_CLIENT_CERT;
      const keyPath = process.env.DB_CLIENT_KEY;

      if (fs.existsSync(certPath) && fs.existsSync(keyPath)) {
        sslConfig.cert = fs.readFileSync(certPath).toString();
        sslConfig.key = fs.readFileSync(keyPath).toString();
      }
    }
  } catch (error) {
    console.warn('⚠️  Failed to load SSL certificates:', error.message);
  }

  return sslConfig;
}

// Database configuration
const dbConfig = {
  // For local development
  development: {
    host: process.env.DB_HOST || 'localhost',
    port: process.env.DB_PORT || 5432,
    user: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD || 'postgres',
    database: process.env.DB_NAME || 'journeyman_dev',
    ssl: false
  },

  // For Railway production
  production: {
    // Railway provides DATABASE_URL automatically
    connectionString: process.env.DATABASE_URL,
    ssl: getSSLConfig()
  },

  // For local testing with Railway database (optional)
  railway_local: {
    host: process.env.RAILWAY_DB_HOST, // Use the public host from Railway
    port: process.env.RAILWAY_DB_PORT || 5432,
    user: process.env.RAILWAY_DB_USER,
    password: process.env.RAILWAY_DB_PASSWORD,
    database: process.env.RAILWAY_DB_NAME,
    ssl: {
      rejectUnauthorized: false
    }
  }
};

// Select appropriate configuration
let poolConfig;

if (process.env.DATABASE_URL) {
  // If DATABASE_URL is provided (Railway production or manual setup)
  poolConfig = {
    connectionString: process.env.DATABASE_URL,
    ssl: getSSLConfig(),
    // Production connection pool settings
    max: parseInt(process.env.DB_POOL_MAX) || 20,
    min: parseInt(process.env.DB_POOL_MIN) || 5,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 10000,
    // Retry configuration
    maxUses: 7500, // Connections are recycled after this many uses
    allowExitOnIdle: false,
    // Statement timeout to prevent long-running queries
    statement_timeout: 30000,
    query_timeout: 30000,
  };
} else if (isProduction || isRailway) {
  // Production environment without DATABASE_URL
  poolConfig = {
    ...dbConfig.production,
    max: 20,
    min: 5,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 10000,
    statement_timeout: 30000,
    query_timeout: 30000,
  };
} else {
  // Local development
  poolConfig = {
    ...dbConfig.development,
    max: 5,
    min: 1,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 2000,
  };
}

// Create pool with error handling
const pool = new Pool(poolConfig);

// Test database connection
pool.on('connect', () => {
  console.log('✅ Database pool: Client connected');
});

pool.on('error', (err, client) => {
  console.error('❌ Database pool error:', err.message);
  // Don't exit the process, just log the error
});

// Test connection function
async function testConnection() {
  try {
    const client = await pool.connect();
    const result = await client.query('SELECT NOW() as current_time, current_database() as db_name');
    console.log('✅ Database connected successfully!');
    console.log(`   Database: ${result.rows[0].db_name}`);
    console.log(`   Time: ${result.rows[0].current_time}`);
    client.release();
    return true;
  } catch (error) {
    console.error('❌ Database connection test failed:', error.message);
    console.error('   Config:', {
      host: poolConfig.host || 'Using CONNECTION_STRING',
      port: poolConfig.port,
      database: poolConfig.database,
      ssl: poolConfig.ssl ? 'enabled' : 'disabled'
    });
    return false;
  }
}

module.exports = pool;
module.exports.testConnection = testConnection;