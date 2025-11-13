#!/bin/bash

# CDN Setup Script for Journeyman Application
# Configures AWS CloudFront for static asset delivery

set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

# Configuration
S3_BUCKET="${S3_BUCKET:-journeyman-static-assets}"
AWS_REGION="${AWS_REGION:-us-east-1}"
DOMAIN="${CDN_DOMAIN:-cdn.yourdomain.com}"
ORIGIN_DOMAIN="${ORIGIN_DOMAIN:-yourdomain.com}"

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

# Check requirements
check_requirements() {
    if ! command -v aws >/dev/null 2>&1; then
        error "AWS CLI is not installed. Please install it first."
        exit 1
    fi

    if ! aws sts get-caller-identity >/dev/null 2>&1; then
        error "AWS credentials not configured. Run 'aws configure' first."
        exit 1
    fi

    log "AWS CLI configured correctly"
}

# Create S3 bucket for static assets
create_s3_bucket() {
    log "Creating S3 bucket: $S3_BUCKET"

    if aws s3 ls "s3://$S3_BUCKET" 2>/dev/null; then
        log "S3 bucket already exists"
    else
        aws s3 mb "s3://$S3_BUCKET" --region "$AWS_REGION"
        log "S3 bucket created successfully"
    fi

    # Configure bucket for static website hosting
    log "Configuring bucket for static hosting..."

    aws s3 website "s3://$S3_BUCKET" \
        --index-document index.html \
        --error-document error.html

    # Set bucket policy for public read access
    cat > /tmp/bucket-policy.json << EOF
{
    "Version": "2012-10-17",
    "Statement": [
        {
            "Sid": "PublicReadGetObject",
            "Effect": "Allow",
            "Principal": "*",
            "Action": "s3:GetObject",
            "Resource": "arn:aws:s3:::$S3_BUCKET/*"
        }
    ]
}
EOF

    aws s3api put-bucket-policy \
        --bucket "$S3_BUCKET" \
        --policy file:///tmp/bucket-policy.json

    rm /tmp/bucket-policy.json

    log "S3 bucket configured for static hosting"
}

# Create CloudFront distribution
create_cloudfront_distribution() {
    log "Creating CloudFront distribution..."

    # Create distribution config
    cat > /tmp/cloudfront-config.json << EOF
{
    "CallerReference": "journeyman-$(date +%s)",
    "Comment": "Journeyman CDN Distribution",
    "Enabled": true,
    "Origins": {
        "Quantity": 1,
        "Items": [
            {
                "Id": "S3-$S3_BUCKET",
                "DomainName": "$S3_BUCKET.s3.$AWS_REGION.amazonaws.com",
                "S3OriginConfig": {
                    "OriginAccessIdentity": ""
                }
            }
        ]
    },
    "DefaultCacheBehavior": {
        "TargetOriginId": "S3-$S3_BUCKET",
        "ViewerProtocolPolicy": "redirect-to-https",
        "AllowedMethods": {
            "Quantity": 2,
            "Items": ["GET", "HEAD"],
            "CachedMethods": {
                "Quantity": 2,
                "Items": ["GET", "HEAD"]
            }
        },
        "Compress": true,
        "MinTTL": 0,
        "DefaultTTL": 86400,
        "MaxTTL": 31536000,
        "ForwardedValues": {
            "QueryString": false,
            "Cookies": {
                "Forward": "none"
            },
            "Headers": {
                "Quantity": 0
            }
        }
    },
    "CacheBehaviors": {
        "Quantity": 2,
        "Items": [
            {
                "PathPattern": "*.js",
                "TargetOriginId": "S3-$S3_BUCKET",
                "ViewerProtocolPolicy": "redirect-to-https",
                "AllowedMethods": {
                    "Quantity": 2,
                    "Items": ["GET", "HEAD"]
                },
                "Compress": true,
                "MinTTL": 0,
                "DefaultTTL": 31536000,
                "MaxTTL": 31536000,
                "ForwardedValues": {
                    "QueryString": false,
                    "Cookies": {"Forward": "none"}
                }
            },
            {
                "PathPattern": "*.css",
                "TargetOriginId": "S3-$S3_BUCKET",
                "ViewerProtocolPolicy": "redirect-to-https",
                "AllowedMethods": {
                    "Quantity": 2,
                    "Items": ["GET", "HEAD"]
                },
                "Compress": true,
                "MinTTL": 0,
                "DefaultTTL": 31536000,
                "MaxTTL": 31536000,
                "ForwardedValues": {
                    "QueryString": false,
                    "Cookies": {"Forward": "none"}
                }
            }
        ]
    },
    "PriceClass": "PriceClass_100",
    "ViewerCertificate": {
        "CloudFrontDefaultCertificate": true
    }
}
EOF

    DISTRIBUTION_ID=$(aws cloudfront create-distribution \
        --distribution-config file:///tmp/cloudfront-config.json \
        --query 'Distribution.Id' \
        --output text)

    rm /tmp/cloudfront-config.json

    log "CloudFront distribution created: $DISTRIBUTION_ID"

    # Get distribution domain name
    DISTRIBUTION_DOMAIN=$(aws cloudfront get-distribution \
        --id "$DISTRIBUTION_ID" \
        --query 'Distribution.DomainName' \
        --output text)

    log "CloudFront domain: $DISTRIBUTION_DOMAIN"
    echo "$DISTRIBUTION_ID" > /tmp/cloudfront-distribution-id.txt
}

# Upload build assets to S3
upload_assets() {
    local build_dir="${1:-./journeyman/build}"

    if [ ! -d "$build_dir" ]; then
        warning "Build directory not found: $build_dir"
        warning "Run 'npm run build:prod' first"
        return
    fi

    log "Uploading static assets to S3..."

    aws s3 sync "$build_dir" "s3://$S3_BUCKET" \
        --delete \
        --cache-control "public, max-age=31536000, immutable" \
        --exclude "*.html" \
        --exclude "service-worker.js" \
        --exclude "asset-manifest.json"

    # Upload HTML files with shorter cache
    aws s3 sync "$build_dir" "s3://$S3_BUCKET" \
        --cache-control "public, max-age=0, must-revalidate" \
        --exclude "*" \
        --include "*.html" \
        --include "service-worker.js" \
        --include "asset-manifest.json"

    log "Assets uploaded successfully"
}

# Create invalidation for CloudFront
invalidate_cache() {
    local distribution_id="${1:-$(cat /tmp/cloudfront-distribution-id.txt 2>/dev/null)}"

    if [ -z "$distribution_id" ]; then
        error "Distribution ID not provided"
        return 1
    fi

    log "Creating CloudFront cache invalidation..."

    INVALIDATION_ID=$(aws cloudfront create-invalidation \
        --distribution-id "$distribution_id" \
        --paths "/*" \
        --query 'Invalidation.Id' \
        --output text)

    log "Cache invalidation created: $INVALIDATION_ID"
    log "Waiting for invalidation to complete..."

    aws cloudfront wait invalidation-completed \
        --distribution-id "$distribution_id" \
        --id "$INVALIDATION_ID"

    log "Cache invalidation completed"
}

# Configure CORS for S3
configure_cors() {
    log "Configuring CORS for S3 bucket..."

    cat > /tmp/cors-config.json << EOF
{
    "CORSRules": [
        {
            "AllowedOrigins": ["https://$ORIGIN_DOMAIN", "https://www.$ORIGIN_DOMAIN"],
            "AllowedMethods": ["GET", "HEAD"],
            "AllowedHeaders": ["*"],
            "MaxAgeSeconds": 3600
        }
    ]
}
EOF

    aws s3api put-bucket-cors \
        --bucket "$S3_BUCKET" \
        --cors-configuration file:///tmp/cors-config.json

    rm /tmp/cors-config.json

    log "CORS configured successfully"
}

# Update environment file
update_env_file() {
    local env_file="${1:-.env.production}"
    local distribution_id=$(cat /tmp/cloudfront-distribution-id.txt 2>/dev/null)

    if [ -f "$env_file" ]; then
        log "Updating environment file: $env_file"

        # Get CloudFront domain
        local cdn_domain=$(aws cloudfront get-distribution \
            --id "$distribution_id" \
            --query 'Distribution.DomainName' \
            --output text 2>/dev/null || echo "")

        if [ -n "$cdn_domain" ]; then
            if grep -q "^CDN_URL=" "$env_file"; then
                sed -i "s|^CDN_URL=.*|CDN_URL=https://$cdn_domain|" "$env_file"
            else
                echo "CDN_URL=https://$cdn_domain" >> "$env_file"
            fi
        fi

        if [ -n "$distribution_id" ]; then
            if grep -q "^CLOUDFRONT_DISTRIBUTION_ID=" "$env_file"; then
                sed -i "s|^CLOUDFRONT_DISTRIBUTION_ID=.*|CLOUDFRONT_DISTRIBUTION_ID=$distribution_id|" "$env_file"
            else
                echo "CLOUDFRONT_DISTRIBUTION_ID=$distribution_id" >> "$env_file"
            fi
        fi

        log "Environment file updated"
    fi
}

# Display summary
display_summary() {
    local distribution_id=$(cat /tmp/cloudfront-distribution-id.txt 2>/dev/null)
    local cdn_domain=$(aws cloudfront get-distribution \
        --id "$distribution_id" \
        --query 'Distribution.DomainName' \
        --output text 2>/dev/null || echo "")

    log "=== CDN Setup Summary ==="
    echo ""
    echo "S3 Bucket: $S3_BUCKET"
    echo "CloudFront Distribution ID: $distribution_id"
    echo "CloudFront Domain: $cdn_domain"
    echo "CDN URL: https://$cdn_domain"
    echo ""
    info "Next steps:"
    echo "  1. Update your application to use CDN URL for static assets"
    echo "  2. Configure custom domain (optional): aws cloudfront update-distribution"
    echo "  3. Upload assets: ./scripts/setup-cdn.sh --upload"
    echo "  4. Test CDN: curl https://$cdn_domain"
    echo ""
}

# Main execution
main() {
    local action="setup"

    while [[ $# -gt 0 ]]; do
        case $1 in
            --upload)
                action="upload"
                shift
                ;;
            --invalidate)
                action="invalidate"
                shift
                ;;
            --help)
                cat << EOF
Usage: $0 [OPTIONS]

Options:
    --upload        Upload build assets to S3 and invalidate cache
    --invalidate    Invalidate CloudFront cache only
    --help          Display this help message

Environment Variables:
    S3_BUCKET               S3 bucket name for static assets
    AWS_REGION              AWS region (default: us-east-1)
    CDN_DOMAIN              Custom CDN domain name
    ORIGIN_DOMAIN           Origin domain for CORS

EOF
                exit 0
                ;;
            *)
                shift
                ;;
        esac
    done

    log "=== Journeyman CDN Setup ==="

    check_requirements

    case $action in
        setup)
            create_s3_bucket
            configure_cors
            create_cloudfront_distribution
            update_env_file
            display_summary
            ;;
        upload)
            upload_assets
            invalidate_cache
            log "Assets uploaded and cache invalidated"
            ;;
        invalidate)
            invalidate_cache
            ;;
    esac

    log "=== CDN Setup Completed ==="
}

main "$@"
