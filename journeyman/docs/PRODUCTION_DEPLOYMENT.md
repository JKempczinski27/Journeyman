# Production Deployment Guide

Complete guide for deploying Journeyman application to production.

## Prerequisites

- [x] Docker installed
- [x] Kubernetes cluster configured
- [x] PostgreSQL database provisioned
- [x] Redis cache provisioned
- [x] AWS account (for S3 and CloudFront)
- [x] SSL certificates obtained
- [x] Domain name configured

## Pre-Deployment Checklist

### Security

- [ ] All secrets stored in environment variables (never in code)
- [ ] SSL certificates installed and configured
- [ ] Database connections use SSL/TLS
- [ ] Rate limiting configured
- [ ] WAF rules enabled
- [ ] Security headers configured in Nginx
- [ ] CORS properly configured
- [ ] Input validation enabled
- [ ] CSRF protection enabled

### Infrastructure

- [ ] Kubernetes cluster running
- [ ] PostgreSQL database initialized
- [ ] Redis cache accessible
- [ ] S3 buckets created
- [ ] CloudFront distribution created
- [ ] Load balancer configured
- [ ] DNS records updated

### Application

- [ ] Environment variables configured
- [ ] Database migrations run
- [ ] Application built with `npm run build:prod`
- [ ] Docker images built and pushed
- [ ] Health check endpoints working
- [ ] Logging configured
- [ ] Monitoring configured

## Deployment Steps

### 1. Prepare Environment

```bash
# Clone repository
git clone https://github.com/your-org/journeyman.git
cd journeyman

# Switch to main branch
git checkout main
git pull origin main

# Copy environment template
cp journeyman/.env.production.example journeyman/.env.production

# Edit environment variables
nano journeyman/.env.production
```

### 2. Build Docker Images

```bash
# Build all images
docker build -t journeyman-frontend:latest -f journeyman/Dockerfile journeyman/
docker build -t journeyman-backend:latest -f journeyman/backend/Dockerfile journeyman/backend/
docker build -t journeyman-backend-python:latest -f journeyman/backend-python/Dockerfile journeyman/backend-python/
docker build -t journeyman-dashboard:latest -f journeyman/dashboard/Dockerfile journeyman/dashboard/

# Tag for registry
docker tag journeyman-frontend:latest ghcr.io/your-org/journeyman-frontend:latest
docker tag journeyman-backend:latest ghcr.io/your-org/journeyman-backend:latest
docker tag journeyman-backend-python:latest ghcr.io/your-org/journeyman-backend-python:latest
docker tag journeyman-dashboard:latest ghcr.io/your-org/journeyman-dashboard:latest

# Push to registry
docker push ghcr.io/your-org/journeyman-frontend:latest
docker push ghcr.io/your-org/journeyman-backend:latest
docker push ghcr.io/your-org/journeyman-backend-python:latest
docker push ghcr.io/your-org/journeyman-dashboard:latest
```

### 3. Initialize Database

```bash
# Set DATABASE_URL
export DATABASE_URL="postgresql://user:pass@host:5432/journeyman_prod"

# Run initialization script
psql $DATABASE_URL < journeyman/scripts/init-db.sql

# Verify database
psql $DATABASE_URL -c "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = 'public';"
```

### 4. Setup SSL Certificates

```bash
# For Let's Encrypt
sudo ./journeyman/scripts/setup-ssl.sh \
  --method letsencrypt \
  --domain yourdomain.com \
  --email admin@yourdomain.com

# For self-signed (testing only)
sudo ./journeyman/scripts/setup-ssl.sh \
  --method self-signed \
  --domain localhost
```

### 5. Configure CDN

```bash
# Setup CloudFront CDN
./journeyman/scripts/setup-cdn.sh

# Upload static assets
./journeyman/scripts/setup-cdn.sh --upload
```

### 6. Deploy to Kubernetes

```bash
# Create namespace
kubectl create namespace roster-recall

# Create secrets
kubectl create secret generic journeyman-secrets \
  --from-literal=DATABASE_URL="$DATABASE_URL" \
  --from-literal=REDIS_URL="$REDIS_URL" \
  --from-literal=SESSION_SECRET="$SESSION_SECRET" \
  --from-literal=API_KEY="$API_KEY" \
  --from-literal=ENCRYPTION_KEY="$ENCRYPTION_KEY" \
  --namespace=roster-recall

# Apply Kubernetes configs
kubectl apply -f journeyman/kubernetes/

# Wait for deployments
kubectl rollout status deployment/backend-deployment -n roster-recall
kubectl rollout status deployment/dashboard-deployment -n roster-recall

# Verify pods are running
kubectl get pods -n roster-recall
```

### 7. Setup Automated Backups

```bash
# Install cron jobs
sudo crontab journeyman/scripts/crontab.production

# Test backup script
sudo ./journeyman/scripts/db-backup.sh

# Verify backup created
ls -lh /var/backups/journeyman/
```

### 8. Configure Monitoring

```bash
# Deploy monitoring stack (if using Prometheus/Grafana)
kubectl apply -f journeyman/kubernetes/monitoring/

# Verify monitoring endpoints
curl http://backend:3001/health
curl http://dashboard:3002/health
curl http://backend-python:5001/api/health
```

### 9. Smoke Tests

```bash
# Get LoadBalancer IP
FRONTEND_IP=$(kubectl get service frontend-service -n roster-recall -o jsonpath='{.status.loadBalancer.ingress[0].ip}')

# Test frontend
curl -I http://$FRONTEND_IP

# Test backend health
curl http://backend:3001/health

# Test database connectivity
kubectl exec -it deployment/backend-deployment -n roster-recall -- \
  node -e "require('./config/database').testConnection()"
```

### 10. Post-Deployment Verification

```bash
# Check all pods are running
kubectl get pods -n roster-recall

# Check service endpoints
kubectl get services -n roster-recall

# Check logs for errors
kubectl logs -f deployment/backend-deployment -n roster-recall --tail=100

# Test API endpoints
curl http://$FRONTEND_IP/api/health

# Verify SSL
curl -I https://yourdomain.com
```

## Rollback Procedure

If deployment fails:

```bash
# Rollback all deployments
kubectl rollout undo deployment/backend-deployment -n roster-recall
kubectl rollout undo deployment/dashboard-deployment -n roster-recall

# Or restore from backup
./journeyman/scripts/db-restore.sh --date YYYYMMDD
```

## CI/CD Pipeline

The automated deployment pipeline is triggered on:
- Push to `main` branch
- Tagged releases (`v*`)

Pipeline stages:
1. **Build** - Compile and test code
2. **Security Scan** - CodeQL, Trivy, Semgrep
3. **Docker Build** - Build and push images
4. **Deploy** - Update Kubernetes deployments
5. **Smoke Tests** - Verify deployment

View workflows: `.github/workflows/`

## Scaling

### Manual Scaling

```bash
# Scale backend
kubectl scale deployment/backend-deployment --replicas=20 -n roster-recall

# Scale dashboard
kubectl scale deployment/dashboard-deployment --replicas=5 -n roster-recall
```

### Auto-Scaling

Horizontal Pod Autoscaler is configured:

```bash
# View HPA status
kubectl get hpa -n roster-recall

# Update HPA
kubectl edit hpa journeyman-hpa -n roster-recall
```

## Troubleshooting

### Pods not starting

```bash
# Check pod status
kubectl describe pod <pod-name> -n roster-recall

# Check logs
kubectl logs <pod-name> -n roster-recall

# Common issues:
# - ImagePullBackOff: Check image name and registry access
# - CrashLoopBackOff: Check application logs
# - Pending: Check resource limits and node capacity
```

### Database connection issues

```bash
# Test from pod
kubectl exec -it <pod-name> -n roster-recall -- \
  psql $DATABASE_URL -c "SELECT 1;"

# Check secrets
kubectl get secret journeyman-secrets -n roster-recall -o yaml

# Common issues:
# - Wrong DATABASE_URL
# - Firewall blocking connections
# - SSL certificate issues
```

### High memory/CPU usage

```bash
# Check resource usage
kubectl top pods -n roster-recall

# Check HPA status
kubectl get hpa -n roster-recall

# Scale up if needed
kubectl scale deployment/backend-deployment --replicas=20 -n roster-recall
```

## Maintenance

### Database Maintenance

```bash
# Vacuum and analyze
vacuumdb --analyze $DATABASE_URL

# Check database size
psql $DATABASE_URL -c "SELECT pg_size_pretty(pg_database_size(current_database()));"

# Refresh materialized views
psql $DATABASE_URL -c "SELECT refresh_game_statistics();"
```

### Certificate Renewal

```bash
# Check expiry
./journeyman/scripts/check-ssl-expiry.sh

# Renew (automatic with Let's Encrypt)
certbot renew

# Manual renewal
./journeyman/scripts/setup-ssl.sh --method letsencrypt --domain yourdomain.com
```

### Log Rotation

```bash
# Check log sizes
du -h /var/log/journeyman/

# Compress old logs
find /var/log/journeyman -name "*.log" -mtime +30 -exec gzip {} \;

# Remove very old logs
find /var/log/journeyman -name "*.log.gz" -mtime +90 -delete
```

## Support

For issues or questions:
- GitHub Issues: https://github.com/your-org/journeyman/issues
- Documentation: ./docs/
- Backup Procedures: ./docs/BACKUP_RECOVERY.md

---

**Last Updated:** $(date +%Y-%m-%d)
