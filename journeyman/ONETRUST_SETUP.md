# OneTrust Integration Setup Guide

This guide will help you configure OneTrust cookie consent and privacy management for the Journeyman application.

## Table of Contents

1. [Overview](#overview)
2. [Prerequisites](#prerequisites)
3. [Getting OneTrust Credentials](#getting-onetrust-credentials)
4. [Frontend Configuration](#frontend-configuration)
5. [Backend Configuration](#backend-configuration)
6. [Testing the Integration](#testing-the-integration)
7. [Webhook Configuration](#webhook-configuration)
8. [Troubleshooting](#troubleshooting)

## Overview

The OneTrust integration provides:
- **Cookie Consent Management**: Automated cookie banner and preference center
- **Privacy Compliance**: GDPR, CCPA, and other privacy regulations
- **Consent Tracking**: Full audit trail of user consent decisions
- **Data Subject Requests**: Handle access, deletion, and portability requests
- **Adobe Analytics Integration**: Respect consent before tracking

## Prerequisites

1. **OneTrust Account**: You need an active OneTrust account
   - Sign up at: https://www.onetrust.com/
   - Or contact your OneTrust administrator

2. **OneTrust Cookies Solution**: Ensure you have access to:
   - Cookie Compliance module
   - Consent & Preferences Management
   - API access (for backend integration)

## Getting OneTrust Credentials

### Step 1: Get Domain Script ID (Frontend)

1. Log in to **OneTrust Admin Console**: https://app.onetrust.com/
2. Navigate to **Scripts** > **Cookie Compliance**
3. Find your script and copy the **Domain Script ID**
   - Format: `xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx`
   - Example: `01a23b45-6789-0abc-def1-23456789abcd`

### Step 2: Get API Credentials (Backend)

1. In OneTrust Admin Console, navigate to **Integrations** > **API**
2. Click **Create New API Key**
3. Give it a descriptive name (e.g., "Journeyman Backend API")
4. Select the following permissions:
   - **Consent Management**: Read, Write
   - **Data Subject Requests**: Read, Write
   - **Privacy Rights**: Read
5. Copy the **API Key** (you won't see it again!)
6. Copy your **Tenant ID** (found in Settings > Account)

### Step 3: Configure Webhook Secret (Optional)

1. In OneTrust Admin Console, navigate to **Integrations** > **Webhooks**
2. Click **Create Webhook**
3. Set the webhook URL: `https://your-domain.com/api/onetrust/webhook`
4. Select events to subscribe to:
   - Consent Granted
   - Consent Updated
   - Consent Revoked
   - DSAR Submitted
5. Copy the **Webhook Secret** for signature verification

## Frontend Configuration

### 1. Update Environment Variables

Edit your `.env.development` and `.env.production` files:

```bash
# Development (.env.development)
REACT_APP_ONETRUST_DOMAIN_SCRIPT_ID=your-domain-script-id-dev
REACT_APP_ONETRUST_ENABLED=true
REACT_APP_ONETRUST_TEST_MODE=true

# Production (.env.production)
REACT_APP_ONETRUST_DOMAIN_SCRIPT_ID=your-domain-script-id-prod
REACT_APP_ONETRUST_ENABLED=true
REACT_APP_ONETRUST_TEST_MODE=false
```

### 2. Update App.js to Initialize OneTrust

Add this to your `src/App.js`:

```javascript
import { useEffect } from 'react';
import { initializeOneTrust } from './config/oneTrustConfig';

function App() {
  useEffect(() => {
    // Initialize OneTrust on app load
    const initialized = initializeOneTrust();
    if (initialized) {
      console.log('OneTrust initialized successfully');
    }
  }, []);

  // ... rest of your App component
}
```

### 3. Files Created

The following files have been created for you:
- `src/config/oneTrustConfig.js` - OneTrust configuration
- `src/hooks/useOneTrust.js` - React hook for consent management
- `src/components/PrivacyConsent.js` - Updated with OneTrust integration
- `src/utils/adobeAnalytics.js` - Updated to respect OneTrust consent

## Backend Configuration

### Node.js/Express Backend

#### 1. Update Environment Variables

Edit `backend/.env`:

```bash
# OneTrust API Configuration
ONETRUST_API_KEY=your-onetrust-api-key
ONETRUST_API_BASE_URL=https://app.onetrust.com/api
ONETRUST_TENANT_ID=your-tenant-id
ONETRUST_ENABLED=true

# Webhook Secret (for signature verification)
WEBHOOK_SECRET=your-webhook-secret
```

#### 2. Register OneTrust Routes

Add to your `backend/server.js`:

```javascript
const oneTrustRoutes = require('./routes/oneTrust');

// Register OneTrust routes
app.use('/api/onetrust', oneTrustRoutes);
```

#### 3. Files Created

- `backend/services/oneTrustClient.js` - OneTrust API client
- `backend/routes/oneTrust.js` - Express routes for OneTrust

### Python Flask Backend

#### 1. Update Environment Variables

Edit `backend-python/.env`:

```bash
# OneTrust API Configuration
ONETRUST_API_KEY=your-onetrust-api-key
ONETRUST_API_BASE_URL=https://app.onetrust.com/api
ONETRUST_TENANT_ID=your-tenant-id
ONETRUST_ENABLED=true
```

#### 2. Install Required Dependencies

Add to `backend-python/requirements.txt` if not present:

```
requests>=2.31.0
```

Then install:

```bash
cd backend-python
pip install -r requirements.txt
```

#### 3. Register OneTrust Routes

Add to your `backend-python/app.py`:

```python
from api.onetrust_routes import onetrust_bp

# Register OneTrust blueprint
app.register_blueprint(onetrust_bp)
```

#### 4. Files Created

- `backend-python/utils/onetrust_client.py` - OneTrust API client
- `backend-python/api/onetrust_routes.py` - Flask routes for OneTrust

## Testing the Integration

### 1. Test Frontend Integration

1. Start your React app:
   ```bash
   npm start
   ```

2. Open browser DevTools Console

3. You should see:
   - `OneTrust SDK initialized` (if configured correctly)
   - OneTrust cookie banner appears on first visit
   - No errors in console

4. Test the banner:
   - Click "Accept All" → Check that consent is granted
   - Click "Reject All" → Check that consent is denied
   - Click "Cookie Settings" → Check preference center opens

### 2. Test Backend API Endpoints

#### Test Health Check

```bash
# Node.js backend
curl http://localhost:3001/api/onetrust/health

# Python backend
curl http://localhost:5001/api/onetrust/health
```

Expected response:
```json
{
  "success": true,
  "enabled": true,
  "configured": true,
  "timestamp": "2025-11-14T12:00:00.000Z"
}
```

#### Test Consent Recording

```bash
curl -X POST http://localhost:3001/api/onetrust/consent \
  -H "Content-Type: application/json" \
  -d '{
    "userId": "test@example.com",
    "purposes": ["C0002", "C0003"],
    "source": "web"
  }'
```

#### Test Consent Retrieval

```bash
curl http://localhost:3001/api/onetrust/consent/test@example.com
```

### 3. Test Adobe Analytics Integration

1. Grant analytics consent via OneTrust banner
2. Open DevTools Console
3. Navigate to a page or trigger an event
4. You should see: `Adobe Analytics: Event tracked - page_view`
5. Revoke consent and verify tracking stops

### 4. Before Production Deployment

- [ ] Test with real OneTrust credentials
- [ ] Verify consent banner appears correctly
- [ ] Test consent grant/deny flows
- [ ] Test Adobe Analytics respects consent
- [ ] Configure webhook endpoints
- [ ] Test DSAR workflows
- [ ] Verify all API endpoints work
- [ ] Check error handling and logging
- [ ] Test across different browsers
- [ ] Verify mobile responsiveness

## Webhook Configuration

### Setting Up Webhooks

1. **Configure Webhook URL** in OneTrust:
   - Development: `https://dev.your-domain.com/api/onetrust/webhook`
   - Production: `https://your-domain.com/api/onetrust/webhook`

2. **Select Events**:
   - `consent.granted` - User grants consent
   - `consent.updated` - User updates preferences
   - `consent.revoked` - User revokes consent
   - `dsar.submitted` - Data subject request submitted
   - `preference.updated` - Preference center updated

3. **Security**:
   - Webhook signatures are verified using HMAC SHA-256
   - Set `WEBHOOK_SECRET` in your .env file
   - Signatures are in the `X-OneTrust-Signature` header

### Testing Webhooks Locally

Use a tool like ngrok to expose your local server:

```bash
# Install ngrok: https://ngrok.com/
ngrok http 3001

# Use the ngrok URL in OneTrust webhook configuration
# Example: https://abc123.ngrok.io/api/onetrust/webhook
```

## Troubleshooting

### Issue: OneTrust banner doesn't appear

**Solutions:**
1. Check Domain Script ID is correct in `.env` file
2. Verify `REACT_APP_ONETRUST_ENABLED=true`
3. Check browser console for errors
4. Clear browser cache and cookies
5. Check if AdBlocker is interfering

### Issue: "OneTrust is not enabled" in console

**Solutions:**
1. Ensure `.env` file has correct credentials
2. Restart the development server after changing `.env`
3. Check `ONETRUST_ENABLED=true` in backend `.env`

### Issue: API returns 401 Unauthorized

**Solutions:**
1. Verify `ONETRUST_API_KEY` is correct
2. Check API key hasn't expired in OneTrust console
3. Ensure API key has correct permissions

### Issue: Adobe Analytics still tracking without consent

**Solutions:**
1. Check `hasAnalyticsConsent()` is being called before tracking
2. Verify OneTrust is initialized before Adobe Analytics
3. Check consent categories match your OneTrust configuration
4. Clear cookies and localStorage to reset consent state

### Issue: Webhook signature verification fails

**Solutions:**
1. Verify `WEBHOOK_SECRET` matches OneTrust configuration
2. Ensure raw request body is used for verification
3. Check webhook secret hasn't been rotated

## API Endpoints Reference

### Frontend API Calls

```javascript
// Record consent
fetch('/api/onetrust/consent', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    userId: 'user@example.com',
    purposes: ['C0002'], // Analytics consent
    source: 'web'
  })
});

// Get consent receipt
fetch('/api/onetrust/consent/user@example.com');

// Submit DSAR
fetch('/api/onetrust/dsar', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    userId: 'user@example.com',
    type: 'delete',
    firstName: 'John',
    lastName: 'Doe'
  })
});
```

### OneTrust Consent Categories

Default categories (customize in OneTrust Admin):
- `C0001` - Strictly Necessary (always active)
- `C0002` - Performance/Analytics
- `C0003` - Functional
- `C0004` - Targeting/Advertising
- `C0005` - Social Media

Update these in `src/config/oneTrustConfig.js` to match your configuration.

## Support and Resources

- **OneTrust Documentation**: https://developer.onetrust.com/
- **OneTrust Support**: https://support.onetrust.com/
- **GDPR Compliance**: https://gdpr.eu/
- **CCPA Compliance**: https://oag.ca.gov/privacy/ccpa

## Next Steps

1. ✅ Configure environment variables with real credentials
2. ✅ Test the integration in development
3. ⬜ Customize OneTrust banner in Admin Console
4. ⬜ Configure consent categories specific to your needs
5. ⬜ Set up webhooks for real-time consent updates
6. ⬜ Implement database storage for consent records
7. ⬜ Configure DSAR workflow automation
8. ⬜ Test in production environment
9. ⬜ Train team on privacy compliance procedures

---

**Questions?** Contact your OneTrust administrator or open an issue in this repository.
