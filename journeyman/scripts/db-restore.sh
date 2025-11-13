#!/bin/bash

# Database Restore Script for Journeyman Application
# This script restores encrypted backups of the PostgreSQL database

set -e

# Configuration
BACKUP_DIR="${BACKUP_DIR:-/var/backups/journeyman}"
S3_BUCKET="${BACKUP_S3_BUCKET:-journeyman-backups}"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Logging functions
log() {
    echo -e "${GREEN}[$(date +'%Y-%m-%d %H:%M:%S')]${NC} $1"
}

error() {
    echo -e "${RED}[$(date +'%Y-%m-%d %H:%M:%S')] ERROR:${NC} $1" >&2
}

warning() {
    echo -e "${YELLOW}[$(date +'%Y-%m-%d %H:%M:%S')] WARNING:${NC} $1"
}

info() {
    echo -e "${BLUE}[$(date +'%Y-%m-%d %H:%M:%S')] INFO:${NC} $1"
}

# Usage information
usage() {
    cat << EOF
Usage: $0 [OPTIONS]

Options:
    -f, --file FILE         Restore from specific backup file
    -l, --list              List available backups
    -s, --s3                Download from S3
    -d, --date DATE         Restore backup from specific date (YYYYMMDD)
    -h, --help              Display this help message

Environment Variables:
    DATABASE_URL            PostgreSQL connection string
    ENCRYPTION_KEY          Encryption key for backup files
    AWS_ENABLED             Enable AWS S3 (true/false)
    BACKUP_S3_BUCKET        S3 bucket name for backups

Examples:
    $0 --list                                      # List available backups
    $0 --file backup.sql.gpg                       # Restore from specific file
    $0 --date 20240115                             # Restore backup from Jan 15, 2024
    $0 --s3 --date 20240115                        # Download and restore from S3

EOF
    exit 1
}

# Check requirements
check_requirements() {
    if [ -z "$DATABASE_URL" ]; then
        error "DATABASE_URL environment variable is not set"
        exit 1
    fi

    if [ -z "$ENCRYPTION_KEY" ]; then
        error "ENCRYPTION_KEY environment variable is not set"
        exit 1
    fi

    # Check required tools
    command -v psql >/dev/null 2>&1 || {
        error "psql is not installed"
        exit 1
    }

    command -v gpg >/dev/null 2>&1 || {
        error "gpg is not installed"
        exit 1
    }
}

# List available backups
list_backups() {
    info "Available local backups:"
    echo ""

    if [ -d "$BACKUP_DIR" ]; then
        ls -lh "$BACKUP_DIR"/journeyman_backup_*.sql.gpg 2>/dev/null | \
            awk '{print $9, "(" $5 ")", $6, $7, $8}' | \
            sed 's|.*/||' || echo "No local backups found"
    else
        echo "No backup directory found"
    fi

    echo ""

    if [ "$1" = "s3" ] && [ "$AWS_ENABLED" = "true" ] && command -v aws >/dev/null 2>&1; then
        info "Available S3 backups:"
        echo ""
        aws s3 ls "s3://${S3_BUCKET}/backups/" --human-readable | \
            grep "journeyman_backup_" || echo "No S3 backups found"
    fi
}

# Download backup from S3
download_from_s3() {
    local backup_file=$1

    if [ "$AWS_ENABLED" != "true" ]; then
        error "AWS is not enabled"
        exit 1
    fi

    if ! command -v aws >/dev/null 2>&1; then
        error "AWS CLI is not installed"
        exit 1
    fi

    log "Downloading backup from S3: $backup_file"

    mkdir -p "$BACKUP_DIR"

    if aws s3 cp "s3://${S3_BUCKET}/backups/${backup_file}" "${BACKUP_DIR}/${backup_file}"; then
        log "Downloaded backup from S3"
        echo "${BACKUP_DIR}/${backup_file}"
    else
        error "Failed to download backup from S3"
        exit 1
    fi
}

# Find backup by date
find_backup_by_date() {
    local date=$1
    local source=$2

    if [ "$source" = "s3" ]; then
        aws s3 ls "s3://${S3_BUCKET}/backups/" | \
            grep "journeyman_backup_${date}" | \
            head -1 | \
            awk '{print $4}'
    else
        find "$BACKUP_DIR" -name "journeyman_backup_${date}*.sql.gpg" | head -1
    fi
}

# Decrypt backup
decrypt_backup() {
    local encrypted_file=$1
    local decrypted_file="${encrypted_file%.gpg}"

    log "Decrypting backup file..."

    if echo "$ENCRYPTION_KEY" | gpg \
        --batch \
        --yes \
        --passphrase-fd 0 \
        --decrypt \
        --output "$decrypted_file" \
        "$encrypted_file"; then

        log "Backup decrypted successfully"
        echo "$decrypted_file"
    else
        error "Failed to decrypt backup"
        exit 1
    fi
}

# Create database backup before restore
create_pre_restore_backup() {
    warning "Creating pre-restore backup as safety measure..."

    local pre_restore_file="${BACKUP_DIR}/pre_restore_$(date +%Y%m%d_%H%M%S).sql"

    if pg_dump "$DATABASE_URL" --format=plain --file="$pre_restore_file" --no-owner --no-acl; then
        log "Pre-restore backup created: $pre_restore_file"
    else
        warning "Failed to create pre-restore backup, continuing anyway..."
    fi
}

# Restore database
restore_database() {
    local backup_file=$1

    log "Starting database restore from: $backup_file"

    # Confirm with user
    warning "This will overwrite the current database!"
    read -p "Are you sure you want to continue? (yes/no): " -r
    echo

    if [[ ! $REPLY =~ ^[Yy][Ee][Ss]$ ]]; then
        info "Restore cancelled by user"
        exit 0
    fi

    # Create pre-restore backup
    create_pre_restore_backup

    # Drop existing connections
    log "Dropping existing database connections..."
    psql "$DATABASE_URL" -c "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = current_database() AND pid <> pg_backend_pid();" 2>/dev/null || true

    # Restore the backup
    log "Restoring database..."

    if psql "$DATABASE_URL" < "$backup_file"; then
        log "Database restored successfully"

        # Run post-restore checks
        post_restore_checks

        return 0
    else
        error "Database restore failed"
        return 1
    fi
}

# Post-restore checks
post_restore_checks() {
    log "Running post-restore checks..."

    # Check if we can connect
    if psql "$DATABASE_URL" -c "SELECT 1;" > /dev/null 2>&1; then
        log "✓ Database connection successful"
    else
        error "✗ Database connection failed"
        return 1
    fi

    # Check table count
    local table_count=$(psql "$DATABASE_URL" -t -c "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = 'public';")
    log "✓ Found $table_count tables"

    # Check if critical tables exist
    local critical_tables=("users" "games" "players" "game_data")
    for table in "${critical_tables[@]}"; do
        if psql "$DATABASE_URL" -t -c "SELECT 1 FROM information_schema.tables WHERE table_name = '$table';" | grep -q 1; then
            log "✓ Table '$table' exists"
        else
            warning "✗ Table '$table' not found"
        fi
    done

    log "Post-restore checks completed"
}

# Cleanup temporary files
cleanup() {
    log "Cleaning up temporary files..."
    find "$BACKUP_DIR" -name "*.sql" -type f -mmin +60 -delete 2>/dev/null || true
}

# Main execution
main() {
    local backup_file=""
    local use_s3=false
    local backup_date=""
    local list_only=false

    # Parse arguments
    while [[ $# -gt 0 ]]; do
        case $1 in
            -f|--file)
                backup_file="$2"
                shift 2
                ;;
            -l|--list)
                list_only=true
                shift
                ;;
            -s|--s3)
                use_s3=true
                shift
                ;;
            -d|--date)
                backup_date="$2"
                shift 2
                ;;
            -h|--help)
                usage
                ;;
            *)
                error "Unknown option: $1"
                usage
                ;;
        esac
    done

    log "=== Journeyman Database Restore ==="

    check_requirements

    # List backups and exit
    if [ "$list_only" = true ]; then
        if [ "$use_s3" = true ]; then
            list_backups "s3"
        else
            list_backups
        fi
        exit 0
    fi

    # Find backup file
    if [ -z "$backup_file" ]; then
        if [ -n "$backup_date" ]; then
            if [ "$use_s3" = true ]; then
                backup_file=$(find_backup_by_date "$backup_date" "s3")
                if [ -n "$backup_file" ]; then
                    backup_file=$(download_from_s3 "$backup_file")
                fi
            else
                backup_file=$(find_backup_by_date "$backup_date" "local")
            fi
        else
            error "No backup file specified. Use -f, -d, or -l option"
            usage
        fi
    else
        # If file doesn't have full path, assume it's in BACKUP_DIR
        if [[ "$backup_file" != /* ]]; then
            backup_file="${BACKUP_DIR}/${backup_file}"
        fi

        # Download from S3 if requested
        if [ "$use_s3" = true ]; then
            backup_file=$(download_from_s3 "$(basename "$backup_file")")
        fi
    fi

    # Check if backup file exists
    if [ ! -f "$backup_file" ]; then
        error "Backup file not found: $backup_file"
        exit 1
    fi

    log "Using backup file: $backup_file"

    # Decrypt if encrypted
    if [[ "$backup_file" == *.gpg ]]; then
        decrypted_file=$(decrypt_backup "$backup_file")
    else
        decrypted_file="$backup_file"
    fi

    # Restore database
    if restore_database "$decrypted_file"; then
        log "=== Restore Completed Successfully ==="
        cleanup
        exit 0
    else
        error "=== Restore Failed ==="
        cleanup
        exit 1
    fi
}

# Run main function
main "$@"
