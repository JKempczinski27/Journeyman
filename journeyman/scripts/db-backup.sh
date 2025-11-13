#!/bin/bash

# Database Backup Script for Journeyman Application
# This script creates encrypted backups of the PostgreSQL database

set -e

# Configuration
BACKUP_DIR="${BACKUP_DIR:-/var/backups/journeyman}"
RETENTION_DAYS="${RETENTION_DAYS:-30}"
TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
BACKUP_FILE="journeyman_backup_${TIMESTAMP}.sql"
ENCRYPTED_FILE="${BACKUP_FILE}.gpg"
S3_BUCKET="${BACKUP_S3_BUCKET:-journeyman-backups}"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Logging function
log() {
    echo -e "${GREEN}[$(date +'%Y-%m-%d %H:%M:%S')]${NC} $1"
}

error() {
    echo -e "${RED}[$(date +'%Y-%m-%d %H:%M:%S')] ERROR:${NC} $1" >&2
}

warning() {
    echo -e "${YELLOW}[$(date +'%Y-%m-%d %H:%M:%S')] WARNING:${NC} $1"
}

# Check if required environment variables are set
check_requirements() {
    if [ -z "$DATABASE_URL" ]; then
        error "DATABASE_URL environment variable is not set"
        exit 1
    fi

    if [ -z "$ENCRYPTION_KEY" ]; then
        error "ENCRYPTION_KEY environment variable is not set"
        exit 1
    fi

    # Check if required tools are installed
    command -v pg_dump >/dev/null 2>&1 || {
        error "pg_dump is not installed"
        exit 1
    }

    command -v gpg >/dev/null 2>&1 || {
        error "gpg is not installed"
        exit 1
    }
}

# Create backup directory if it doesn't exist
create_backup_dir() {
    if [ ! -d "$BACKUP_DIR" ]; then
        log "Creating backup directory: $BACKUP_DIR"
        mkdir -p "$BACKUP_DIR"
    fi
}

# Perform database backup
backup_database() {
    log "Starting database backup..."

    cd "$BACKUP_DIR"

    # Perform the backup
    if pg_dump "$DATABASE_URL" \
        --format=plain \
        --verbose \
        --file="$BACKUP_FILE" \
        --no-owner \
        --no-acl \
        2>&1 | tee backup.log; then

        log "Database backup completed: $BACKUP_FILE"

        # Get backup size
        BACKUP_SIZE=$(du -h "$BACKUP_FILE" | cut -f1)
        log "Backup size: $BACKUP_SIZE"
    else
        error "Database backup failed"
        exit 1
    fi
}

# Encrypt backup file
encrypt_backup() {
    log "Encrypting backup file..."

    if echo "$ENCRYPTION_KEY" | gpg \
        --batch \
        --yes \
        --passphrase-fd 0 \
        --symmetric \
        --cipher-algo AES256 \
        --output "$ENCRYPTED_FILE" \
        "$BACKUP_FILE"; then

        log "Backup encrypted: $ENCRYPTED_FILE"

        # Remove unencrypted backup
        rm "$BACKUP_FILE"
        log "Removed unencrypted backup file"
    else
        error "Backup encryption failed"
        exit 1
    fi
}

# Upload to S3 (if AWS is enabled)
upload_to_s3() {
    if [ "$AWS_ENABLED" = "true" ]; then
        log "Uploading backup to S3..."

        if command -v aws >/dev/null 2>&1; then
            if aws s3 cp "$ENCRYPTED_FILE" "s3://${S3_BUCKET}/backups/${ENCRYPTED_FILE}" \
                --storage-class STANDARD_IA \
                --server-side-encryption AES256; then

                log "Backup uploaded to S3: s3://${S3_BUCKET}/backups/${ENCRYPTED_FILE}"
            else
                warning "Failed to upload backup to S3"
            fi
        else
            warning "AWS CLI not installed, skipping S3 upload"
        fi
    else
        log "AWS upload disabled, skipping S3 upload"
    fi
}

# Clean up old backups
cleanup_old_backups() {
    log "Cleaning up backups older than $RETENTION_DAYS days..."

    # Local cleanup
    find "$BACKUP_DIR" -name "journeyman_backup_*.sql.gpg" -mtime +$RETENTION_DAYS -delete

    local deleted_count=$(find "$BACKUP_DIR" -name "journeyman_backup_*.sql.gpg" -mtime +$RETENTION_DAYS 2>/dev/null | wc -l)
    log "Removed $deleted_count local backup(s)"

    # S3 cleanup (if AWS is enabled)
    if [ "$AWS_ENABLED" = "true" ] && command -v aws >/dev/null 2>&1; then
        log "Cleaning up old S3 backups..."

        CUTOFF_DATE=$(date -d "$RETENTION_DAYS days ago" +%Y-%m-%d)

        aws s3 ls "s3://${S3_BUCKET}/backups/" | while read -r line; do
            BACKUP_DATE=$(echo $line | awk '{print $1}')
            BACKUP_FILE=$(echo $line | awk '{print $4}')

            if [[ "$BACKUP_DATE" < "$CUTOFF_DATE" ]]; then
                aws s3 rm "s3://${S3_BUCKET}/backups/${BACKUP_FILE}"
                log "Removed S3 backup: $BACKUP_FILE"
            fi
        done
    fi
}

# Verify backup integrity
verify_backup() {
    log "Verifying backup integrity..."

    # Test if the file can be decrypted
    if echo "$ENCRYPTION_KEY" | gpg \
        --batch \
        --yes \
        --passphrase-fd 0 \
        --decrypt \
        "$ENCRYPTED_FILE" > /dev/null 2>&1; then

        log "Backup integrity verified successfully"
        return 0
    else
        error "Backup integrity verification failed"
        return 1
    fi
}

# Send notification (optional)
send_notification() {
    local status=$1
    local message=$2

    if [ -n "$WEBHOOK_URL" ]; then
        curl -X POST "$WEBHOOK_URL" \
            -H "Content-Type: application/json" \
            -d "{\"status\": \"$status\", \"message\": \"$message\", \"timestamp\": \"$(date -Iseconds)\"}" \
            2>/dev/null || true
    fi
}

# Main execution
main() {
    log "=== Journeyman Database Backup Started ==="

    check_requirements
    create_backup_dir
    backup_database
    encrypt_backup

    if verify_backup; then
        upload_to_s3
        cleanup_old_backups

        log "=== Backup Completed Successfully ==="
        send_notification "success" "Database backup completed: $ENCRYPTED_FILE"
        exit 0
    else
        error "=== Backup Failed ==="
        send_notification "failure" "Database backup verification failed"
        exit 1
    fi
}

# Run main function
main "$@"
