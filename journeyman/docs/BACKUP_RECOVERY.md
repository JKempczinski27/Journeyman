# Backup and Recovery Procedures

This document outlines the backup and disaster recovery procedures for the Journeyman application.

## Table of Contents

1. [Backup Strategy](#backup-strategy)
2. [Automated Backups](#automated-backups)
3. [Manual Backups](#manual-backups)
4. [Recovery Procedures](#recovery-procedures)
5. [Testing Backups](#testing-backups)
6. [Monitoring and Alerts](#monitoring-and-alerts)

## Backup Strategy

### Backup Types

1. **Database Backups**
   - Full PostgreSQL database dumps
   - Encrypted with GPG
   - Stored locally and in S3
   - Retention: 30 days

2. **Application Code**
   - Git repository (primary source of truth)
   - Tagged releases for each deployment

3. **Static Assets**
   - Synced to S3 bucket
   - CloudFront CDN for distribution

4. **Configuration Files**
   - Environment variables backed up securely
   - Kubernetes secrets and configmaps

### Backup Schedule

| Backup Type | Frequency | Retention | Location |
|-------------|-----------|-----------|----------|
| Database | Daily at 2 AM | 30 days | Local + S3 |
| Session Cleanup | Hourly | N/A | N/A |
| Audit Logs | Daily at 3 AM | 90 days | Database |
| Static Assets | On deployment | Indefinite | S3 |
| Config | On change | Version controlled | Git |

## Automated Backups

### Database Backup

Automated database backups run daily at 2 AM via cron:

```bash
# View cron jobs
crontab -l

# Install cron jobs
crontab journeyman/scripts/crontab.production
```

The backup script:
- Creates PostgreSQL dump
- Encrypts with GPG using `ENCRYPTION_KEY`
- Uploads to S3 (if AWS is enabled)
- Removes backups older than retention period
- Verifies backup integrity

### Running Manual Backup

```bash
# Set environment variables
export DATABASE_URL="postgresql://user:pass@host:5432/journeyman_prod"
export ENCRYPTION_KEY="your-encryption-key"
export AWS_ENABLED="true"
export BACKUP_S3_BUCKET="journeyman-backups"

# Run backup
./journeyman/scripts/db-backup.sh
```

### Backup Locations

**Local Backups:**
```
/var/backups/journeyman/
├── journeyman_backup_20240115_020000.sql.gpg
├── journeyman_backup_20240116_020000.sql.gpg
└── ...
```

**S3 Backups:**
```
s3://journeyman-backups/backups/
├── journeyman_backup_20240115_020000.sql.gpg
├── journeyman_backup_20240116_020000.sql.gpg
└── ...
```

## Manual Backups

### Before Major Changes

Always create a backup before:
- Database migrations
- Major deployments
- Configuration changes
- Data cleanup operations

```bash
# Create named backup
DATE=$(date +%Y%m%d_%H%M%S)
./journeyman/scripts/db-backup.sh
mv /var/backups/journeyman/journeyman_backup_*.sql.gpg \
   /var/backups/journeyman/pre_migration_${DATE}.sql.gpg
```

### Kubernetes Resources

```bash
# Backup all resources in namespace
kubectl get all -n roster-recall -o yaml > k8s-backup-$(date +%Y%m%d).yaml

# Backup secrets
kubectl get secrets -n roster-recall -o yaml > secrets-backup-$(date +%Y%m%d).yaml

# Backup configmaps
kubectl get configmaps -n roster-recall -o yaml > configmaps-backup-$(date +%Y%m%d).yaml
```

## Recovery Procedures

### Database Recovery

#### List Available Backups

```bash
# List local backups
./journeyman/scripts/db-restore.sh --list

# List S3 backups
./journeyman/scripts/db-restore.sh --list --s3
```

#### Restore from Local Backup

```bash
# Restore specific file
./journeyman/scripts/db-restore.sh --file journeyman_backup_20240115_020000.sql.gpg

# Restore by date
./journeyman/scripts/db-restore.sh --date 20240115
```

#### Restore from S3

```bash
# Download and restore from S3
./journeyman/scripts/db-restore.sh --s3 --date 20240115
```

#### Post-Restore Verification

The restore script automatically runs checks:
- ✓ Database connection
- ✓ Table count
- ✓ Critical tables exist (users, games, players, game_data)

Manual verification:

```bash
# Connect to database
psql $DATABASE_URL

# Check row counts
SELECT
  'users' as table, COUNT(*) as count FROM users
UNION ALL
SELECT 'games', COUNT(*) FROM games
UNION ALL
SELECT 'players', COUNT(*) FROM players
UNION ALL
SELECT 'game_data', COUNT(*) FROM game_data;

# Check recent data
SELECT * FROM games ORDER BY created_at DESC LIMIT 5;
```

### Application Recovery

#### Rollback Kubernetes Deployment

```bash
# View rollout history
kubectl rollout history deployment/backend-deployment -n roster-recall

# Rollback to previous version
kubectl rollout undo deployment/backend-deployment -n roster-recall

# Rollback to specific revision
kubectl rollout undo deployment/backend-deployment -n roster-recall --to-revision=3
```

#### Restore from Git

```bash
# Find the last known good commit
git log --oneline

# Revert to specific commit
git checkout <commit-hash>

# Create new branch from good commit
git checkout -b recovery/<commit-hash>

# Rebuild and redeploy
npm run build:prod
docker build -t journeyman:recovery .
# Push and deploy...
```

### CDN Recovery

#### Clear CloudFront Cache

```bash
# Invalidate all cached content
aws cloudfront create-invalidation \
  --distribution-id $CLOUDFRONT_DISTRIBUTION_ID \
  --paths "/*"
```

#### Re-upload Static Assets

```bash
# Build fresh assets
cd journeyman
npm run build:prod

# Upload to S3
./scripts/setup-cdn.sh --upload
```

## Disaster Recovery Scenarios

### Complete Database Loss

1. **Stop application services** to prevent data corruption

```bash
kubectl scale deployment/backend-deployment --replicas=0 -n roster-recall
```

2. **Restore database from latest backup**

```bash
./journeyman/scripts/db-restore.sh --s3 --date $(date +%Y%m%d)
```

3. **Verify database integrity**

```bash
psql $DATABASE_URL -c "SELECT COUNT(*) FROM users;"
```

4. **Restart application services**

```bash
kubectl scale deployment/backend-deployment --replicas=10 -n roster-recall
```

### Complete Cluster Failure

1. **Provision new Kubernetes cluster**
2. **Apply infrastructure configs**

```bash
kubectl apply -f journeyman/kubernetes/
```

3. **Restore secrets and configmaps**

```bash
kubectl apply -f secrets-backup-YYYYMMDD.yaml
kubectl apply -f configmaps-backup-YYYYMMDD.yaml
```

4. **Deploy application**

```bash
# Use latest docker images
kubectl set image deployment/backend-deployment \
  backend=ghcr.io/your-org/journeyman-backend:latest \
  -n roster-recall
```

5. **Restore database**

```bash
./journeyman/scripts/db-restore.sh --s3 --date YYYYMMDD
```

### S3 Data Loss

1. **Check S3 versioning** (if enabled)

```bash
aws s3api list-object-versions --bucket journeyman-backups
```

2. **Restore from versioned objects**

```bash
aws s3api get-object \
  --bucket journeyman-backups \
  --key backups/journeyman_backup.sql.gpg \
  --version-id <version-id> \
  journeyman_backup.sql.gpg
```

3. **If versioning not enabled**, use local backups

```bash
# Upload local backups to S3
aws s3 sync /var/backups/journeyman/ s3://journeyman-backups/backups/
```

## Testing Backups

### Monthly Backup Testing

Perform recovery testing monthly:

1. **Create test database**

```bash
# Create test database
psql postgresql://localhost/postgres -c "CREATE DATABASE journeyman_test_recovery;"
```

2. **Restore to test database**

```bash
# Export test DATABASE_URL
export DATABASE_URL="postgresql://user:pass@localhost:5432/journeyman_test_recovery"

# Restore backup
./journeyman/scripts/db-restore.sh --date YYYYMMDD
```

3. **Verify data integrity**

```bash
# Run queries to verify
psql $DATABASE_URL -c "SELECT COUNT(*) FROM users;"
psql $DATABASE_URL -c "SELECT COUNT(*) FROM games;"
```

4. **Document results**

```bash
echo "Backup test on $(date): SUCCESS" >> /var/log/journeyman/backup-tests.log
```

5. **Cleanup**

```bash
psql postgresql://localhost/postgres -c "DROP DATABASE journeyman_test_recovery;"
```

## Monitoring and Alerts

### Backup Monitoring

1. **Check backup logs**

```bash
tail -f /var/log/journeyman/backup.log
```

2. **Verify recent backups exist**

```bash
# Local
ls -lh /var/backups/journeyman/ | head -10

# S3
aws s3 ls s3://journeyman-backups/backups/ | tail -10
```

3. **Check backup size trends**

```bash
# Monitor for unexpected size changes
du -h /var/backups/journeyman/* | tail -5
```

### SSL Certificate Expiry

```bash
# Add to crontab for weekly checks
0 9 * * 1 /app/scripts/check-ssl-expiry.sh >> /var/log/journeyman/ssl-check.log 2>&1
```

### Database Health

```bash
# Monitor database size
psql $DATABASE_URL -c "SELECT pg_size_pretty(pg_database_size(current_database()));"

# Check for bloat
psql $DATABASE_URL -c "SELECT schemaname, tablename,
  pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename)) AS size
FROM pg_tables
WHERE schemaname = 'public'
ORDER BY pg_total_relation_size(schemaname||'.'||tablename) DESC
LIMIT 10;"
```

### Webhook Notifications

Configure webhook URL for automated notifications:

```bash
export WEBHOOK_URL="https://your-monitoring-service.com/webhook"
```

Notifications are sent for:
- Backup completion/failure
- SSL certificate expiry warnings
- Recovery operations

## Recovery Time Objectives (RTO)

| Scenario | Target RTO | Actual Steps |
|----------|------------|--------------|
| Single service failure | 5 minutes | Kubernetes auto-restart |
| Database corruption | 30 minutes | Restore from backup |
| Complete cluster failure | 2 hours | Rebuild cluster + restore |
| Data center failure | 4 hours | Failover to backup region |

## Recovery Point Objectives (RPO)

| Data Type | Target RPO | Backup Frequency |
|-----------|------------|------------------|
| Database | 24 hours | Daily |
| Static assets | 0 (continuous) | On deployment |
| Configuration | 0 (versioned) | Git commits |

## Contact Information

**Incident Response Team:**
- On-call Engineer: [Contact info]
- Database Admin: [Contact info]
- DevOps Lead: [Contact info]

**Emergency Procedures:**
1. Notify incident response team
2. Assess scope of issue
3. Follow appropriate recovery procedure
4. Document incident in post-mortem

## Appendix

### Backup Script Environment Variables

```bash
# Required
DATABASE_URL="postgresql://user:pass@host:5432/dbname"
ENCRYPTION_KEY="32-character-encryption-key"

# Optional
BACKUP_DIR="/var/backups/journeyman"
RETENTION_DAYS="30"
AWS_ENABLED="true"
BACKUP_S3_BUCKET="journeyman-backups"
WEBHOOK_URL="https://your-webhook-url.com"
```

### Useful Commands Reference

```bash
# Database operations
pg_dump $DATABASE_URL > backup.sql
psql $DATABASE_URL < backup.sql
vacuumdb --analyze $DATABASE_URL

# Kubernetes operations
kubectl get pods -n roster-recall
kubectl logs -f deployment/backend-deployment -n roster-recall
kubectl describe pod <pod-name> -n roster-recall

# S3 operations
aws s3 ls s3://journeyman-backups/
aws s3 cp s3://journeyman-backups/file.gpg .
aws s3 sync local/ s3://journeyman-backups/

# CloudFront operations
aws cloudfront create-invalidation --distribution-id ID --paths "/*"
aws cloudfront list-distributions

# GPG operations
gpg --encrypt --recipient key file
gpg --decrypt file.gpg > file
```

---

**Document Version:** 1.0
**Last Updated:** $(date +%Y-%m-%d)
**Next Review:** Monthly
