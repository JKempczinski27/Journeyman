# Production Setup Guide

This guide covers the complete production infrastructure setup for the Journeyman application.

## Overview

Journeyman is a full-stack web application with:
- **Frontend**: React 18 + Material-UI
- **Backend**: Express.js (Node.js) + Flask (Python)
- **Database**: PostgreSQL + Redis
- **Deployment**: Kubernetes
- **CDN**: AWS CloudFront
- **CI/CD**: GitHub Actions

## Quick Start

```bash
# 1. Build Docker images
docker-compose -f journeyman/docker-compose.yml build

# 2. Start services
docker-compose -f journeyman/docker-compose.yml up -d

# 3. Initialize database
psql $DATABASE_URL < journeyman/scripts/init-db.sql

# 4. Setup SSL (production)
sudo ./journeyman/scripts/setup-ssl.sh --method letsencrypt --domain yourdomain.com

# 5. Setup CDN (production)
./journeyman/scripts/setup-cdn.sh
```

## Production Configuration Files

### Docker & Containerization

| File | Purpose |
|------|---------|
| `Dockerfile` | Frontend (React + Nginx) |
| `backend/Dockerfile` | Backend API (Express.js) |
| `backend-python/Dockerfile` | Python backend (Flask) |
| `dashboard/Dockerfile` | Dashboard service |
| `docker-compose.yml` | Multi-service orchestration |
| `.dockerignore` | Exclude files from Docker build |
| `nginx.conf` | Nginx reverse proxy configuration |

### CI/CD Workflows

| File | Purpose |
|------|---------|
| `.github/workflows/ci.yml` | Build, test, and validate code |
| `.github/workflows/docker-build.yml` | Build and push Docker images |
| `.github/workflows/deploy.yml` | Deploy to Kubernetes |
| `.github/workflows/codeql.yml` | Security scanning |

### Database

| File | Purpose |
|------|---------|
| `scripts/init-db.sql` | Database schema and initialization |
| `scripts/db-backup.sh` | Automated backup script |
| `scripts/db-restore.sh` | Database recovery script |
| `scripts/crontab.production` | Scheduled maintenance tasks |
| `backend/config/database.js` | Enhanced connection pooling |

### SSL/TLS

| File | Purpose |
|------|---------|
| `scripts/setup-ssl.sh` | SSL certificate installation |
| `scripts/check-ssl-expiry.sh` | Monitor certificate expiration |

### CDN & Assets

| File | Purpose |
|------|---------|
| `scripts/setup-cdn.sh` | CloudFront CDN setup |
| `scripts/optimize-assets.sh` | Asset optimization for CDN |

### Documentation

| File | Purpose |
|------|---------|
| `docs/BACKUP_RECOVERY.md` | Backup and disaster recovery |
| `docs/PRODUCTION_DEPLOYMENT.md` | Deployment procedures |
| `.env.production.example` | Production environment template |

## Environment Variables

Copy and configure:

```bash
cp .env.production.example .env.production
nano .env.production
```

### Required Variables

```bash
# Server
NODE_ENV=production
PORT=3001
FRONTEND_URL=https://yourdomain.com

# Database
DATABASE_URL=postgresql://user:pass@host:5432/journeyman_prod

# Security (generate with: openssl rand -base64 32)
SESSION_SECRET=<generate-32-char-random-string>
API_KEY=<generate-api-key>
ENCRYPTION_KEY=<generate-32-byte-key>

# SSL
SSL_CERT=/etc/nginx/ssl/certificate.crt
SSL_KEY=/etc/nginx/ssl/private.key

# AWS (optional)
AWS_ENABLED=true
AWS_ACCESS_KEY_ID=<your-key>
AWS_SECRET_ACCESS_KEY=<your-secret>
S3_BUCKET_NAME=journeyman-prod-data
```

## Infrastructure Setup

### 1. PostgreSQL Database

```bash
# Using Docker
docker run -d \
  --name journeyman-postgres \
  -e POSTGRES_DB=journeyman_prod \
  -e POSTGRES_PASSWORD=securepassword \
  -p 5432:5432 \
  -v postgres_data:/var/lib/postgresql/data \
  postgres:15-alpine

# Initialize schema
psql postgresql://postgres:securepassword@localhost:5432/journeyman_prod \
  < journeyman/scripts/init-db.sql
```

### 2. Redis Cache

```bash
docker run -d \
  --name journeyman-redis \
  -p 6379:6379 \
  redis:7-alpine \
  redis-server --requirepass securepassword
```

### 3. SSL Certificates

#### Production (Let's Encrypt)

```bash
sudo ./journeyman/scripts/setup-ssl.sh \
  --method letsencrypt \
  --domain yourdomain.com \
  --email admin@yourdomain.com
```

#### Development (Self-Signed)

```bash
sudo ./journeyman/scripts/setup-ssl.sh \
  --method self-signed \
  --domain localhost
```

### 4. CDN Setup

```bash
# Configure AWS credentials
aws configure

# Setup CloudFront CDN
./journeyman/scripts/setup-cdn.sh

# Upload assets
./journeyman/scripts/setup-cdn.sh --upload
```

### 5. Kubernetes Deployment

```bash
# Create namespace
kubectl create namespace roster-recall

# Create secrets
kubectl create secret generic journeyman-secrets \
  --from-env-file=.env.production \
  --namespace=roster-recall

# Deploy services
kubectl apply -f journeyman/kubernetes/

# Verify
kubectl get pods -n roster-recall
```

## CI/CD Setup

### GitHub Actions Secrets

Configure in GitHub repository settings:

```
KUBE_CONFIG              # Base64 encoded kubeconfig
DATABASE_URL             # Production database URL
REDIS_URL                # Production Redis URL
SESSION_SECRET           # Session encryption key
API_KEY                  # API authentication key
ENCRYPTION_KEY           # Data encryption key
AWS_ACCESS_KEY_ID        # AWS access key
AWS_SECRET_ACCESS_KEY    # AWS secret key
```

### Deployment Workflow

1. **Push to main** → Triggers CI/CD pipeline
2. **Build & Test** → Runs tests and security scans
3. **Docker Build** → Builds and pushes images
4. **Deploy** → Updates Kubernetes deployments
5. **Verify** → Runs smoke tests

## Backup Configuration

### Automated Daily Backups

```bash
# Install cron jobs (as root)
sudo crontab journeyman/scripts/crontab.production

# Verify cron jobs
sudo crontab -l
```

Backup schedule:
- **Database**: Daily at 2 AM
- **Session cleanup**: Hourly
- **Audit logs**: Daily at 3 AM
- **Materialized views**: Every 6 hours

### Manual Backup

```bash
# Create backup
./journeyman/scripts/db-backup.sh

# List backups
./journeyman/scripts/db-restore.sh --list

# Restore backup
./journeyman/scripts/db-restore.sh --date 20240115
```

## Monitoring & Maintenance

### Health Checks

```bash
# Backend API
curl http://localhost:3001/health

# Dashboard
curl http://localhost:3002/health

# Python backend
curl http://localhost:5001/api/health

# Frontend
curl http://localhost/
```

### SSL Certificate Monitoring

```bash
# Check expiry (add to crontab)
./journeyman/scripts/check-ssl-expiry.sh

# Add to crontab for weekly checks
0 9 * * 1 /app/scripts/check-ssl-expiry.sh >> /var/log/journeyman/ssl-check.log
```

### Database Maintenance

```bash
# Vacuum and analyze
vacuumdb --analyze $DATABASE_URL

# Check size
psql $DATABASE_URL -c "SELECT pg_size_pretty(pg_database_size(current_database()));"

# Clean expired sessions
psql $DATABASE_URL -c "SELECT cleanup_expired_sessions();"

# Clean old audit logs (90 days retention)
psql $DATABASE_URL -c "SELECT cleanup_old_audit_logs(90);"
```

### Log Management

```bash
# View logs
tail -f /var/log/journeyman/backup.log
tail -f /var/log/journeyman/ssl-check.log

# Kubernetes logs
kubectl logs -f deployment/backend-deployment -n roster-recall
kubectl logs -f deployment/dashboard-deployment -n roster-recall
```

## Scaling

### Horizontal Scaling

```bash
# Scale backend replicas
kubectl scale deployment/backend-deployment --replicas=20 -n roster-recall

# Scale dashboard
kubectl scale deployment/dashboard-deployment --replicas=5 -n roster-recall

# View autoscaler
kubectl get hpa -n roster-recall
```

### Vertical Scaling

Edit Kubernetes deployment resource limits:

```yaml
resources:
  requests:
    memory: "512Mi"
    cpu: "500m"
  limits:
    memory: "1Gi"
    cpu: "1000m"
```

## Security Checklist

- [x] SSL/TLS certificates configured
- [x] Database connections encrypted
- [x] Secrets stored in environment variables
- [x] Rate limiting enabled
- [x] CORS properly configured
- [x] Input validation enabled
- [x] CSRF protection enabled
- [x] Security headers configured
- [x] WAF rules enabled
- [x] Regular security scans (CodeQL, Trivy, Semgrep)
- [x] Audit logging enabled
- [x] Encrypted backups

## Troubleshooting

### Common Issues

**Docker build fails:**
```bash
# Clear build cache
docker builder prune -a

# Rebuild without cache
docker build --no-cache -t journeyman-backend:latest -f backend/Dockerfile backend/
```

**Database connection issues:**
```bash
# Test connection
psql $DATABASE_URL -c "SELECT 1;"

# Check SSL settings
psql "$DATABASE_URL?sslmode=require" -c "SELECT 1;"
```

**SSL certificate issues:**
```bash
# Check certificate
openssl x509 -in /etc/nginx/ssl/certificate.crt -text -noout

# Verify private key matches
openssl x509 -noout -modulus -in certificate.crt | openssl md5
openssl rsa -noout -modulus -in private.key | openssl md5
```

**Kubernetes pod not starting:**
```bash
# Describe pod
kubectl describe pod <pod-name> -n roster-recall

# Check logs
kubectl logs <pod-name> -n roster-recall

# Check events
kubectl get events -n roster-recall --sort-by='.lastTimestamp'
```

## Performance Optimization

### Database

- Connection pooling configured (20 max connections)
- Indexes on frequently queried columns
- Materialized views for analytics
- Regular VACUUM and ANALYZE

### Frontend

- Asset optimization (minification, compression)
- CDN for static assets
- Browser caching headers
- Gzip compression enabled

### Backend

- Response caching with Redis
- Rate limiting to prevent abuse
- Horizontal pod autoscaling
- Load balancing with Nginx

## Cost Optimization

### AWS

- Use S3 Intelligent-Tiering for backups
- CloudFront PriceClass_100 (North America & Europe)
- Right-size EC2/ECS instances
- Use Reserved Instances for predictable workloads

### Kubernetes

- Set appropriate resource limits
- Use horizontal pod autoscaling
- Schedule non-critical workloads during off-peak
- Use spot instances for non-critical pods

## Support & Resources

### Documentation

- [Backup & Recovery](./docs/BACKUP_RECOVERY.md)
- [Production Deployment](./docs/PRODUCTION_DEPLOYMENT.md)
- [Security Configuration](./backend/middleware/security.js)

### Scripts

- Database: `./scripts/db-*.sh`
- SSL: `./scripts/setup-ssl.sh`, `./scripts/check-ssl-expiry.sh`
- CDN: `./scripts/setup-cdn.sh`, `./scripts/optimize-assets.sh`

### Monitoring

- Health endpoints: `/health`, `/api/health`
- Kubernetes: `kubectl get pods -n roster-recall`
- Logs: `/var/log/journeyman/`

---

## Next Steps

After completing this setup:

1. ✅ Run smoke tests to verify all services
2. ✅ Test backup and restore procedures
3. ✅ Configure monitoring and alerting
4. ✅ Set up log aggregation
5. ✅ Document runbooks for common issues
6. ✅ Schedule regular security audits
7. ✅ Plan disaster recovery drills

---

**Version:** 1.0
**Last Updated:** $(date +%Y-%m-%d)
**Maintained by:** DevOps Team
