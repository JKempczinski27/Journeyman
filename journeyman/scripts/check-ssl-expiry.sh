#!/bin/bash

# SSL Certificate Expiry Checker
# Checks SSL certificate expiration and sends alerts

set -e

# Configuration
SSL_DIR="${SSL_DIR:-/etc/nginx/ssl}"
CERT_FILE="${SSL_DIR}/certificate.crt"
WARNING_DAYS="${SSL_WARNING_DAYS:-30}"
CRITICAL_DAYS="${SSL_CRITICAL_DAYS:-7}"

# Colors
RED='\033[0;31m'
YELLOW='\033[1;33m'
GREEN='\033[0;32m'
NC='\033[0m'

# Check if certificate exists
if [ ! -f "$CERT_FILE" ]; then
    echo -e "${RED}ERROR: Certificate file not found: $CERT_FILE${NC}"
    exit 1
fi

# Get certificate expiration date
EXPIRY_DATE=$(openssl x509 -in "$CERT_FILE" -noout -enddate | cut -d= -f2)
EXPIRY_EPOCH=$(date -d "$EXPIRY_DATE" +%s 2>/dev/null || date -j -f "%b %d %T %Y %Z" "$EXPIRY_DATE" +%s)
CURRENT_EPOCH=$(date +%s)
DAYS_UNTIL_EXPIRY=$(( ($EXPIRY_EPOCH - $CURRENT_EPOCH) / 86400 ))

# Display status
echo "SSL Certificate Expiry Check"
echo "============================="
echo "Certificate: $CERT_FILE"
echo "Expires: $EXPIRY_DATE"
echo "Days until expiry: $DAYS_UNTIL_EXPIRY"
echo ""

# Send alerts based on days remaining
if [ $DAYS_UNTIL_EXPIRY -lt 0 ]; then
    echo -e "${RED}CRITICAL: Certificate has EXPIRED!${NC}"
    STATUS="expired"
    EXIT_CODE=2
elif [ $DAYS_UNTIL_EXPIRY -lt $CRITICAL_DAYS ]; then
    echo -e "${RED}CRITICAL: Certificate expires in $DAYS_UNTIL_EXPIRY days!${NC}"
    STATUS="critical"
    EXIT_CODE=2
elif [ $DAYS_UNTIL_EXPIRY -lt $WARNING_DAYS ]; then
    echo -e "${YELLOW}WARNING: Certificate expires in $DAYS_UNTIL_EXPIRY days${NC}"
    STATUS="warning"
    EXIT_CODE=1
else
    echo -e "${GREEN}OK: Certificate is valid for $DAYS_UNTIL_EXPIRY more days${NC}"
    STATUS="ok"
    EXIT_CODE=0
fi

# Send webhook notification if URL is configured
if [ -n "$WEBHOOK_URL" ]; then
    curl -X POST "$WEBHOOK_URL" \
        -H "Content-Type: application/json" \
        -d "{
            \"status\": \"$STATUS\",
            \"days_until_expiry\": $DAYS_UNTIL_EXPIRY,
            \"expiry_date\": \"$EXPIRY_DATE\",
            \"certificate\": \"$CERT_FILE\"
        }" \
        2>/dev/null || true
fi

exit $EXIT_CODE
