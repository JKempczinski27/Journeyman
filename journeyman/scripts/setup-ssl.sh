#!/bin/bash

# SSL Certificate Setup Script for Journeyman Application
# Supports Let's Encrypt (Certbot) or manual certificate installation

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
SSL_DIR="${SSL_DIR:-/etc/nginx/ssl}"
DOMAIN="${DOMAIN:-yourdomain.com}"
EMAIL="${SSL_EMAIL:-admin@${DOMAIN}}"
METHOD="${SSL_METHOD:-letsencrypt}"

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
    -m, --method METHOD      Certificate method: letsencrypt, manual, self-signed (default: letsencrypt)
    -d, --domain DOMAIN      Domain name (default: yourdomain.com)
    -e, --email EMAIL        Email for Let's Encrypt notifications
    -p, --path PATH          SSL certificate directory (default: /etc/nginx/ssl)
    -h, --help               Display this help message

Methods:
    letsencrypt     Use Let's Encrypt with Certbot (recommended for production)
    manual          Install manually provided certificates
    self-signed     Generate self-signed certificates (for testing only)

Examples:
    $0 --method letsencrypt --domain example.com --email admin@example.com
    $0 --method self-signed --domain localhost
    $0 --method manual --domain example.com --path /etc/ssl/certs

Environment Variables:
    DOMAIN          Domain name for SSL certificate
    SSL_EMAIL       Email for certificate notifications
    SSL_DIR         Directory to store certificates
    SSL_METHOD      Certificate installation method

EOF
    exit 1
}

# Check if running as root
check_root() {
    if [ "$EUID" -ne 0 ]; then
        error "This script must be run as root (use sudo)"
        exit 1
    fi
}

# Install required dependencies
install_dependencies() {
    log "Checking and installing dependencies..."

    if [ "$METHOD" = "letsencrypt" ]; then
        if ! command -v certbot >/dev/null 2>&1; then
            info "Installing Certbot..."

            if command -v apt-get >/dev/null 2>&1; then
                apt-get update
                apt-get install -y certbot python3-certbot-nginx
            elif command -v yum >/dev/null 2>&1; then
                yum install -y certbot python3-certbot-nginx
            elif command -v apk >/dev/null 2>&1; then
                apk add --no-cache certbot certbot-nginx
            else
                error "Unsupported package manager. Please install certbot manually."
                exit 1
            fi

            log "Certbot installed successfully"
        else
            log "Certbot is already installed"
        fi
    fi

    if ! command -v openssl >/dev/null 2>&1; then
        error "OpenSSL is not installed. Please install it first."
        exit 1
    fi
}

# Create SSL directory
create_ssl_dir() {
    if [ ! -d "$SSL_DIR" ]; then
        log "Creating SSL directory: $SSL_DIR"
        mkdir -p "$SSL_DIR"
        chmod 700 "$SSL_DIR"
    fi
}

# Setup Let's Encrypt SSL
setup_letsencrypt() {
    log "Setting up Let's Encrypt SSL certificate for $DOMAIN..."

    # Check if domain is accessible
    info "Verifying domain is accessible..."

    # Stop nginx temporarily if running
    if systemctl is-active --quiet nginx 2>/dev/null; then
        warning "Stopping nginx temporarily for certificate generation..."
        systemctl stop nginx
        NGINX_WAS_RUNNING=true
    fi

    # Obtain certificate
    log "Obtaining SSL certificate from Let's Encrypt..."

    if certbot certonly \
        --standalone \
        --non-interactive \
        --agree-tos \
        --email "$EMAIL" \
        --domains "$DOMAIN" \
        --rsa-key-size 4096 \
        --must-staple; then

        log "SSL certificate obtained successfully!"

        # Create symlinks for easier access
        ln -sf "/etc/letsencrypt/live/$DOMAIN/fullchain.pem" "$SSL_DIR/certificate.crt"
        ln -sf "/etc/letsencrypt/live/$DOMAIN/privkey.pem" "$SSL_DIR/private.key"
        ln -sf "/etc/letsencrypt/live/$DOMAIN/chain.pem" "$SSL_DIR/ca-bundle.crt"

        log "Certificate symlinks created in $SSL_DIR"

        # Setup auto-renewal
        setup_auto_renewal

        # Restart nginx if it was running
        if [ "$NGINX_WAS_RUNNING" = true ]; then
            log "Starting nginx..."
            systemctl start nginx
        fi

        display_certificate_info
    else
        error "Failed to obtain SSL certificate"
        exit 1
    fi
}

# Setup auto-renewal for Let's Encrypt
setup_auto_renewal() {
    log "Setting up automatic certificate renewal..."

    # Create renewal hook script
    cat > /etc/letsencrypt/renewal-hooks/deploy/nginx-reload.sh << 'EOF'
#!/bin/bash
# Reload nginx after certificate renewal
if systemctl is-active --quiet nginx; then
    systemctl reload nginx
    echo "Nginx reloaded after certificate renewal"
fi
EOF

    chmod +x /etc/letsencrypt/renewal-hooks/deploy/nginx-reload.sh

    # Test renewal process
    if certbot renew --dry-run; then
        log "Auto-renewal test successful"
    else
        warning "Auto-renewal test failed. Please check certbot configuration."
    fi

    # Add cron job for renewal (twice daily)
    CRON_CMD="0 0,12 * * * certbot renew --quiet --post-hook 'systemctl reload nginx'"

    if ! crontab -l 2>/dev/null | grep -q "certbot renew"; then
        (crontab -l 2>/dev/null; echo "$CRON_CMD") | crontab -
        log "Added cron job for automatic certificate renewal"
    else
        log "Cron job for certificate renewal already exists"
    fi
}

# Generate self-signed certificate
setup_self_signed() {
    log "Generating self-signed SSL certificate for $DOMAIN..."

    warning "Self-signed certificates are only for testing! Use Let's Encrypt for production."

    # Generate private key
    openssl genrsa -out "$SSL_DIR/private.key" 4096

    # Generate certificate signing request
    openssl req -new \
        -key "$SSL_DIR/private.key" \
        -out "$SSL_DIR/certificate.csr" \
        -subj "/C=US/ST=State/L=City/O=Organization/OU=Department/CN=$DOMAIN"

    # Generate self-signed certificate (valid for 365 days)
    openssl x509 -req \
        -days 365 \
        -in "$SSL_DIR/certificate.csr" \
        -signkey "$SSL_DIR/private.key" \
        -out "$SSL_DIR/certificate.crt" \
        -extfile <(printf "subjectAltName=DNS:$DOMAIN,DNS:*.$DOMAIN")

    # Set permissions
    chmod 600 "$SSL_DIR/private.key"
    chmod 644 "$SSL_DIR/certificate.crt"

    log "Self-signed certificate generated successfully"

    display_certificate_info
}

# Setup manual certificates
setup_manual() {
    log "Setting up manual SSL certificates..."

    info "Please provide the following certificate files:"
    echo "  1. Certificate file (certificate.crt)"
    echo "  2. Private key file (private.key)"
    echo "  3. CA bundle file (ca-bundle.crt) - optional"
    echo ""

    read -p "Enter path to certificate file: " CERT_FILE
    read -p "Enter path to private key file: " KEY_FILE
    read -p "Enter path to CA bundle file (optional): " CA_FILE

    # Validate files exist
    if [ ! -f "$CERT_FILE" ]; then
        error "Certificate file not found: $CERT_FILE"
        exit 1
    fi

    if [ ! -f "$KEY_FILE" ]; then
        error "Private key file not found: $KEY_FILE"
        exit 1
    fi

    # Copy files to SSL directory
    cp "$CERT_FILE" "$SSL_DIR/certificate.crt"
    cp "$KEY_FILE" "$SSL_DIR/private.key"

    if [ -n "$CA_FILE" ] && [ -f "$CA_FILE" ]; then
        cp "$CA_FILE" "$SSL_DIR/ca-bundle.crt"
    fi

    # Set permissions
    chmod 600 "$SSL_DIR/private.key"
    chmod 644 "$SSL_DIR/certificate.crt"

    log "Manual certificates installed successfully"

    display_certificate_info
}

# Display certificate information
display_certificate_info() {
    log "Certificate Information:"
    echo ""

    if [ -f "$SSL_DIR/certificate.crt" ]; then
        openssl x509 -in "$SSL_DIR/certificate.crt" -noout -text | grep -E "Subject:|Issuer:|Not Before|Not After|DNS:"
    fi

    echo ""
    log "Certificate files location:"
    echo "  Certificate: $SSL_DIR/certificate.crt"
    echo "  Private Key: $SSL_DIR/private.key"
    echo "  CA Bundle:   $SSL_DIR/ca-bundle.crt"
    echo ""
}

# Test SSL configuration
test_ssl_config() {
    log "Testing SSL configuration..."

    if [ -f "$SSL_DIR/certificate.crt" ] && [ -f "$SSL_DIR/private.key" ]; then
        # Verify private key matches certificate
        CERT_MD5=$(openssl x509 -noout -modulus -in "$SSL_DIR/certificate.crt" | openssl md5)
        KEY_MD5=$(openssl rsa -noout -modulus -in "$SSL_DIR/private.key" | openssl md5)

        if [ "$CERT_MD5" = "$KEY_MD5" ]; then
            log "✓ Private key matches certificate"
        else
            error "✗ Private key does NOT match certificate"
            exit 1
        fi

        # Check certificate expiration
        EXPIRY_DATE=$(openssl x509 -in "$SSL_DIR/certificate.crt" -noout -enddate | cut -d= -f2)
        EXPIRY_EPOCH=$(date -d "$EXPIRY_DATE" +%s)
        CURRENT_EPOCH=$(date +%s)
        DAYS_UNTIL_EXPIRY=$(( ($EXPIRY_EPOCH - $CURRENT_EPOCH) / 86400 ))

        if [ $DAYS_UNTIL_EXPIRY -lt 30 ]; then
            warning "Certificate expires in $DAYS_UNTIL_EXPIRY days!"
        else
            log "✓ Certificate is valid for $DAYS_UNTIL_EXPIRY more days"
        fi

        log "SSL configuration test passed!"
    else
        error "SSL certificate files not found"
        exit 1
    fi
}

# Update environment file
update_env_file() {
    local ENV_FILE="${1:-.env.production}"

    if [ -f "$ENV_FILE" ]; then
        log "Updating environment file: $ENV_FILE"

        # Update or add SSL configuration
        if grep -q "^SSL_CERT=" "$ENV_FILE"; then
            sed -i "s|^SSL_CERT=.*|SSL_CERT=$SSL_DIR/certificate.crt|" "$ENV_FILE"
        else
            echo "SSL_CERT=$SSL_DIR/certificate.crt" >> "$ENV_FILE"
        fi

        if grep -q "^SSL_KEY=" "$ENV_FILE"; then
            sed -i "s|^SSL_KEY=.*|SSL_KEY=$SSL_DIR/private.key|" "$ENV_FILE"
        else
            echo "SSL_KEY=$SSL_DIR/private.key" >> "$ENV_FILE"
        fi

        if [ -f "$SSL_DIR/ca-bundle.crt" ]; then
            if grep -q "^SSL_CA=" "$ENV_FILE"; then
                sed -i "s|^SSL_CA=.*|SSL_CA=$SSL_DIR/ca-bundle.crt|" "$ENV_FILE"
            else
                echo "SSL_CA=$SSL_DIR/ca-bundle.crt" >> "$ENV_FILE"
            fi
        fi

        log "Environment file updated"
    fi
}

# Main execution
main() {
    # Parse arguments
    while [[ $# -gt 0 ]]; do
        case $1 in
            -m|--method)
                METHOD="$2"
                shift 2
                ;;
            -d|--domain)
                DOMAIN="$2"
                shift 2
                ;;
            -e|--email)
                EMAIL="$2"
                shift 2
                ;;
            -p|--path)
                SSL_DIR="$2"
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

    log "=== SSL Certificate Setup for Journeyman ==="
    log "Domain: $DOMAIN"
    log "Method: $METHOD"
    log "SSL Directory: $SSL_DIR"
    echo ""

    check_root
    install_dependencies
    create_ssl_dir

    case $METHOD in
        letsencrypt)
            setup_letsencrypt
            ;;
        self-signed)
            setup_self_signed
            ;;
        manual)
            setup_manual
            ;;
        *)
            error "Invalid method: $METHOD"
            usage
            ;;
    esac

    test_ssl_config
    update_env_file

    log "=== SSL Setup Completed Successfully ==="
    echo ""
    info "Next steps:"
    echo "  1. Update nginx configuration to use HTTPS (uncomment HTTPS server block)"
    echo "  2. Reload nginx: systemctl reload nginx"
    echo "  3. Test your site: https://$DOMAIN"
    echo ""
}

# Run main function
main "$@"
