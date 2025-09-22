// backend/config/database.js
const { Pool } = require('pg');

// Determine if we're running on Railway or locally
const isProduction = process.env.NODE_ENV === 'production';
const isRailway = process.env.RAILWAY_ENVIRONMENT === 'production';

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
    ssl: {
      rejectUnauthorized: false // Required for Railway PostgreSQL
    }
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
    ssl: {
      rejectUnauthorized: false
    },
    max: 10,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 5000,
  };
} else if (isProduction || isRailway) {
  // Production environment without DATABASE_URL
  poolConfig = {
    ...dbConfig.production,
    max: 10,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 5000,
  };
} else {
  // Local development
  poolConfig = {
    ...dbConfig.development,
    max: 5,
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