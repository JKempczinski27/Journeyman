#!/usr/bin/env node

/**
 * Scheduled Backup Script
 *
 * This script should be run daily via cron to create incremental backups
 * and rotate old backups.
 *
 * Usage:
 *   node scripts/scheduled-backup.js [backupType] [daysToKeep]
 *
 * Examples:
 *   node scripts/scheduled-backup.js                    # Incremental backup, keep 30 days
 *   node scripts/scheduled-backup.js incremental 30     # Incremental backup, keep 30 days
 *   node scripts/scheduled-backup.js full 90            # Full backup, keep 90 days
 *
 * Cron Setup (daily at 2 AM):
 *   0 2 * * * /usr/bin/node /path/to/journeyman/backend/scripts/scheduled-backup.js >> /var/log/journeyman-backup.log 2>&1
 */

require('dotenv').config();
const { S3Manager } = require('../config/awsConfig');

const s3Manager = new S3Manager();

async function runScheduledBackup() {
  const args = process.argv.slice(2);
  const backupType = args[0] || 'incremental';
  const daysToKeep = parseInt(args[1]) || 30;

  console.log('========================================');
  console.log('Journeyman Scheduled Backup');
  console.log(`Date: ${new Date().toISOString()}`);
  console.log(`Backup Type: ${backupType}`);
  console.log(`Days to Keep: ${daysToKeep}`);
  console.log('========================================\n');

  try {
    // Step 1: Create backup
    console.log('📦 Step 1: Creating backup...');
    const backupResult = await s3Manager.createBackup(backupType);

    if (backupResult.success) {
      console.log(`✅ Backup created successfully!`);
      console.log(`   - Backup Key: ${backupResult.backupKey}`);
      console.log(`   - Files Backed Up: ${backupResult.filesBackedUp}`);
      console.log(`   - Total Size: ${(backupResult.totalSize / 1024 / 1024).toFixed(2)} MB\n`);
    }

    // Step 2: Rotate old backups
    console.log(`🗑️  Step 2: Rotating old backups (keeping last ${daysToKeep} days)...`);
    const rotateResult = await s3Manager.rotateBackups(daysToKeep);

    console.log(`✅ Backup rotation completed!`);
    console.log(`   - Deleted: ${rotateResult.deleted} old backups`);
    console.log(`   - Kept: ${rotateResult.kept} backups\n`);

    // Step 3: Summary
    console.log('========================================');
    console.log('✅ Scheduled Backup Completed Successfully');
    console.log('========================================');

    process.exit(0);
  } catch (error) {
    console.error('\n❌ BACKUP FAILED:');
    console.error(`   Error: ${error.message}`);
    console.error(`   Stack: ${error.stack}`);
    console.error('\n========================================');
    console.error('❌ Scheduled Backup Failed');
    console.error('========================================');

    process.exit(1);
  }
}

// Run if called directly
if (require.main === module) {
  runScheduledBackup();
}

module.exports = { runScheduledBackup };
