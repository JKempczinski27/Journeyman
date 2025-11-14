# Journeyman Codebase - Key Files Reference

## Quick Navigation Guide

### Configuration & Setup
- **Kubernetes**: `/home/user/Journeyman/journeyman/kubernetes/`
  - `backend-deployment.yaml` - 10 replicas, 256-512Mi memory, liveness/readiness probes
  - `hpa.yaml` - HPA config (5-15 replicas, 70% CPU trigger)
  - `services.yaml` - K8s service definitions
  - `dashboard-deployment.yaml` - Dashboard service deployment

- **Docker**: 
  - `/home/user/Journeyman/journeyman/Dockerfile` - React frontend with Nginx
  - `/home/user/Journeyman/journeyman/backend/Dockerfile` - Node.js Express (dumb-init, non-root user)
  - `/home/user/Journeyman/journeyman/backend-python/Dockerfile` - Python Flask with Gunicorn (4 workers)
  - `/home/user/Journeyman/journeyman/docker-compose.yml` - Local development orchestration

- **Nginx**:
  - `/home/user/Journeyman/journeyman/nginx.conf` - Reverse proxy config (rate limiting, compression, SSL)
    - General limit: 100 req/s
    - API limit: 10 req/s
    - Gzip level 6, client max body 20MB

- **Database**:
  - `/home/user/Journeyman/journeyman/scripts/init-db.sql` - Schema (9 tables, 12 indexes, materialized views)
  - `/home/user/Journeyman/journeyman/.env.production.example` - Environment variables template

### Backend - Node.js/Express
- **Main Server**: `/home/user/Journeyman/journeyman/backend/server.js` (600 lines)
  - Express app initialization
  - Middleware setup (security, CORS, session, compression)
  - Health check endpoint
  - Game data endpoint with validation

- **Secure Server**: `/home/user/Journeyman/journeyman/backend/server-secure.js` (823 lines)
  - Enhanced security configuration
  - Multiple rate limiters (general, strict, auth)
  - Request verification with HMAC
  - Suspicious activity monitoring

- **Middleware**: `/home/user/Journeyman/journeyman/backend/middleware/security.js`
  - Authentication & API key validation
  - AES-256-GCM encryption/decryption
  - Input validation & sanitization
  - Secure session management
  - CSRF protection
  - Helmet security headers
  - Account lockout mechanism
  - Data integrity verification
  - Security event logging
  - Parameter pollution protection
  - SSRF protection

- **Configuration**:
  - `/home/user/Journeyman/journeyman/backend/config/database.js` - Connection pooling (20 max, 30s idle timeout)
  - `/home/user/Journeyman/journeyman/backend/config/awsConfig.js` - S3 bucket configuration

- **Services**:
  - `/home/user/Journeyman/journeyman/backend/services/dataService.js` - Data persistence with S3 fallback
  - `/home/user/Journeyman/journeyman/backend/services/dataServices.js` - Game data handling

- **Routes**:
  - `/home/user/Journeyman/journeyman/backend/routes/dataProtection.js` - Data protection endpoints

- **Dependencies** (package.json):
  - Security: helmet, express-rate-limit, hpp, xss-clean, express-mongo-sanitize, bcryptjs, jsonwebtoken
  - Database: pg, connect-mongo
  - Compression: compression
  - Utilities: axios, dotenv, validator

### Backend - Python/Flask
- **Main App**: `/home/user/Journeyman/journeyman/backend-python/app.py` (414 lines)
  - Flask GDPR/data protection API
  - CORS configuration (restrictive in production)
  - Flask-Limiter for rate limiting
  - CSRF protection with Flask-WTF
  - Security headers with Flask-Talisman
  - Endpoints:
    - `/api/gdpr/export/<user_id>` - Export user data
    - `/api/gdpr/delete/<user_id>` - Delete user data
    - `/api/consent/*` - Consent management
    - `/api/encrypt` & `/api/decrypt` - Data encryption
    - `/save-player` - Player data saving with validation

- **Dependencies** (requirements.txt):
  ```
  cryptography>=41.0.0
  python-dotenv>=1.0.0
  flask>=3.0.0
  flask-cors>=4.0.0
  flask-talisman>=1.1.0
  flask-limiter>=3.5.0
  flask-wtf>=1.2.0
  psycopg2-binary>=2.9.0
  redis>=5.0.0
  APScheduler>=3.10.0
  gunicorn>=21.2.0 (in Dockerfile)
  ```

- **Models**: `/home/user/Journeyman/journeyman/backend-python/models/gdpr.py`
  - GDPR compliance data models
  - User consent management
  - Data retention policies

- **Utilities**: `/home/user/Journeyman/journeyman/backend-python/utils/`
  - `encryption.py` - Data encryption utilities
  - `data_retention.py` - Retention policy management

### Frontend - React
- **Main App**: `/home/user/Journeyman/journeyman/src/App.js`
  - React 18.3.1 with Material-UI
  - Game tracking interface
  - Player form handling

- **Components**: `/home/user/Journeyman/journeyman/src/components/`
  - Reusable React components

- **Configuration**: `/home/user/Journeyman/journeyman/src/config/`
  - Frontend API endpoints
  - Adobe Analytics setup

- **Testing**:
  - `/home/user/Journeyman/journeyman/src/App.test.js` - Unit tests
  - `/home/user/Journeyman/journeyman/src/App.a11y.test.js` - Accessibility tests
  - `/home/user/Journeyman/journeyman/cypress/` - E2E tests

- **Dependencies** (package.json):
  - React ecosystem: react, react-dom, react-scripts
  - UI: @mui/material, @mui/icons-material, @emotion/react, @emotion/styled
  - Forms: validator
  - Security: bcrypt, express-validator, joi
  - Rate limiting: rate-limiter-flexible
  - Database: pg

### Testing & CI/CD
- **Tests**:
  - `/home/user/Journeyman/journeyman/backend/__tests__/api.test.js` - API tests
  - `/home/user/Journeyman/journeyman/backend/__tests__/s3-upload.test.js` - S3 upload tests
  - `/home/user/Journeyman/journeyman/backend/__tests__/s3-retry.test.js` - Retry logic tests

- **GitHub Workflows**: `/home/user/Journeyman/.github/workflows/`
  - CI/CD pipeline configurations

### Documentation
- `/home/user/Journeyman/journeyman/README.md` - Create React App documentation
- `/home/user/Journeyman/journeyman/PRODUCTION_SETUP.md` - Production deployment guide
- `/home/user/Journeyman/journeyman/GAME_TRACKING_README.md` - Game tracking documentation

---

## Architecture Overview

### Service Ports
- Frontend: 80 (HTTP), 443 (HTTPS)
- Node.js Backend: 3001
- Dashboard: 3002
- Python Flask: 5001
- PostgreSQL: 5432
- Redis: 6379

### Rate Limiting Tiers

| Layer | Endpoint | Limit | Window |
|-------|----------|-------|--------|
| Nginx | API paths | 10 req/s | Per IP |
| Nginx | General | 100 req/s | Per IP |
| Express | General | 100 | 15 minutes |
| Express | Admin/Analytics | 10 | 15 minutes |
| Express | Auth | 5 | 15 minutes |
| Flask | GDPR Export | 5 | 1 minute |
| Flask | GDPR Delete | 3 | 1 hour |
| Flask | Consents | 10-30 | 1 minute |
| Flask | Encryption | 50 | 1 minute |

### Database Tables Summary
1. **users** - User accounts with auth data
2. **games** - Game records with metadata
3. **players** - NFL player master data
4. **game_data** - Game statistics (JSONB)
5. **user_consents** - GDPR consent tracking
6. **audit_logs** - Security audit trail (90-day retention)
7. **sessions** - Express session store
8. **data_exports** - GDPR data export requests
9. **data_deletions** - GDPR deletion requests

### Materialized Views
- **game_statistics** - Pre-aggregated game stats by type and month
- **active_users** - View of active, verified users
- **recent_games** - Games from last 30 days

---

## Performance Configuration Details

### Connection Pooling (Node.js pg)
```javascript
Production:
  max: 20, min: 5
  idle timeout: 30s
  connection timeout: 10s
  statement timeout: 30s
  maxUses: 7500 (recycling)
```

### Compression (Express)
```javascript
Level: 6 (CPU efficient)
Threshold: 1KB (only compress >1KB responses)
Filter: Skip encrypted responses
```

### Session Management
- Secret: Env variable (min 32 chars)
- Cookie: httpOnly, secure (prod), sameSite=strict
- MaxAge: 24 hours
- Custom session ID generation
- Store: PostgreSQL via connect-mongo or Redis

### Kubernetes Scaling
```yaml
Min Replicas: 5
Max Replicas: 15
CPU Trigger: 70% average utilization
Memory: No trigger (future enhancement)
Readiness: 15s interval, 10s initial delay
Liveness: 30s interval, 30s initial delay
```

---

## Key Security Implementations

### Encryption
- AES-256-GCM symmetric encryption
- HMAC-SHA256 signatures
- Bcrypt hashing (12 rounds)

### Rate Limiting Hierarchy
1. Nginx (network level) - 10/100 req/s
2. Express middleware - 100 req/15min
3. Flask decorators - Variable per endpoint

### Input Validation Layers
1. Content-Type validation (application/json only)
2. Request body size limit (10-20MB)
3. Schema validation (email regex, name length)
4. Injection detection (SQL, XSS, script patterns)
5. NoSQL injection prevention
6. Parameter pollution protection

### Security Headers
- CSP with nonce-in support
- HSTS (1 year, includeSubDomains)
- X-Frame-Options: SAMEORIGIN
- X-Content-Type-Options: nosniff
- Referrer-Policy: strict-origin-when-cross-origin

### HTTPS/TLS
- TLS 1.2 & 1.3 only
- Strong cipher suites
- Session caching (10 minutes)
- HSTS preload ready

---

## File Statistics

| Category | Files | Lines |
|----------|-------|-------|
| Node Backend | Core (3 main files) | 2,223 |
| Python Backend | Core (1 main file) | 414 |
| Database Schema | init-db.sql | 235 |
| Configuration | docker-compose, Dockerfiles, K8s | ~800 |
| Tests | E2E + Unit | ~500 |

