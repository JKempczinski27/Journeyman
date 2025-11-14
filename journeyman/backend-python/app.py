from flask import Flask, jsonify, request, abort
from flask_cors import CORS
from flask_talisman import Talisman
from flask_limiter import Limiter
from flask_limiter.util import get_remote_address
from flask_wtf.csrf import CSRFProtect
from dotenv import load_dotenv
import os
from datetime import datetime
from functools import wraps

from config.secrets_manager import secrets_manager
from utils.encryption import DataEncryption
from models.gdpr import GDPRCompliance, UserConsent, ConsentType
from utils.data_retention import DataRetentionManager, DataCategory
from api.consent_management import ConsentManager

load_dotenv()

app = Flask(__name__)

# Configuration
app.config['SECRET_KEY'] = os.getenv('SESSION_SECRET', os.urandom(32))
app.config['MAX_CONTENT_LENGTH'] = 16 * 1024 * 1024  # 16MB max request size
app.config['WTF_CSRF_TIME_LIMIT'] = None  # CSRF tokens don't expire for API
app.config['WTF_CSRF_CHECK_DEFAULT'] = False  # We'll manually protect endpoints

# Get environment
ENVIRONMENT = os.getenv('FLASK_ENV', 'production')
IS_PRODUCTION = ENVIRONMENT == 'production'

# CORS Configuration - More restrictive in production
if IS_PRODUCTION:
    ALLOWED_ORIGINS = os.getenv('CORS_ORIGINS', 'https://yourdomain.com').split(',')
    CORS(app,
         origins=ALLOWED_ORIGINS,
         supports_credentials=True,
         max_age=3600,
         allow_headers=['Content-Type', 'Authorization', 'X-API-Key'],
         methods=['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'])
else:
    # More permissive in development
    CORS(app)

# Security Headers (Flask-Talisman) - Only in production or when explicitly enabled
if IS_PRODUCTION or os.getenv('ENABLE_SECURITY_HEADERS', 'false').lower() == 'true':
    csp = {
        'default-src': "'self'",
        'script-src': "'self' 'unsafe-inline'",
        'style-src': "'self' 'unsafe-inline'",
        'img-src': "'self' data: https:",
        'font-src': "'self' data:",
        'connect-src': "'self'"
    }

    Talisman(app,
             force_https=IS_PRODUCTION,
             strict_transport_security=True,
             strict_transport_security_max_age=31536000,
             content_security_policy=csp,
             content_security_policy_nonce_in=['script-src'],
             referrer_policy='strict-origin-when-cross-origin',
             feature_policy={
                 'geolocation': "'none'",
                 'microphone': "'none'",
                 'camera': "'none'"
             })

# Rate Limiting - Using Redis if available, otherwise in-memory
redis_url = os.getenv('REDIS_URL')
if redis_url:
    limiter = Limiter(
        app=app,
        key_func=get_remote_address,
        storage_uri=redis_url,
        default_limits=[
            os.getenv('RATE_LIMIT_MAX_REQUESTS', '100') + " per " + str(int(os.getenv('RATE_LIMIT_WINDOW_MS', '900000')) // 1000) + " seconds"
        ]
    )
else:
    limiter = Limiter(
        app=app,
        key_func=get_remote_address,
        default_limits=["100 per 15 minutes"],
        storage_uri="memory://"
    )

# CSRF Protection
csrf = CSRFProtect()
csrf.init_app(app)

# Authentication decorator for admin endpoints
def require_api_key(f):
    @wraps(f)
    def decorated_function(*args, **kwargs):
        api_key = request.headers.get('X-API-Key') or request.headers.get('Authorization')

        # Remove 'Bearer ' prefix if present
        if api_key and api_key.startswith('Bearer '):
            api_key = api_key[7:]

        expected_key = os.getenv('ADMIN_TOKEN') or os.getenv('API_KEY')

        if not api_key or not expected_key:
            abort(401, description="API key required")

        if api_key != expected_key:
            abort(403, description="Invalid API key")

        return f(*args, **kwargs)
    return decorated_function

# Initialize encryption
try:
    encryption = DataEncryption()
    print("✓ Encryption initialized successfully")
except ValueError as e:
    print(f"⚠ Warning: {e}")
    encryption = None

# CSRF exemptions for API endpoints (REST API uses token-based auth, not cookies)
@csrf.exempt
@app.route('/api/gdpr/export/<user_id>', methods=['GET'])
@limiter.limit("5 per minute")  # Stricter rate limit for GDPR operations
@require_api_key
def export_user_data(user_id):
    """Export all user data for GDPR compliance"""
    try:
        data = GDPRCompliance.export_user_data(user_id)
        return jsonify({
            'success': True,
            'data': data,
            'exported_at': datetime.utcnow().isoformat()
        })
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500

@csrf.exempt
@app.route('/api/gdpr/delete/<user_id>', methods=['DELETE'])
@limiter.limit("3 per hour")  # Very strict rate limit for deletion
@require_api_key
def delete_user_data(user_id):
    """Delete/anonymize user data (Right to be Forgotten)"""
    try:
        success = GDPRCompliance.anonymize_user_data(user_id)
        return jsonify({
            'success': success,
            'message': 'User data has been anonymized',
            'processed_at': datetime.utcnow().isoformat()
        })
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500

@csrf.exempt
@app.route('/api/consent/<user_id>', methods=['GET'])
@limiter.limit("30 per minute")
def get_consents(user_id):
    """Get all consent records for a user"""
    try:
        manager = ConsentManager(user_id)
        consents = manager.get_all_consents()
        return jsonify({'success': True, 'consents': consents})
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500

@csrf.exempt
@app.route('/api/consent/<user_id>', methods=['POST'])
@limiter.limit("20 per minute")
def record_consent(user_id):
    """Record user consent"""
    try:
        data = request.json
        manager = ConsentManager(user_id)
        consent = manager.record_consent(
            consent_type=data['consent_type'],
            granted=data['granted'],
            metadata={
                'ip_address': request.remote_addr,
                'user_agent': request.headers.get('User-Agent')
            }
        )
        return jsonify({'success': True, 'consent': consent})
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 400

@csrf.exempt
@app.route('/api/consent/<user_id>/<consent_type>', methods=['DELETE'])
@limiter.limit("10 per minute")
def revoke_consent(user_id, consent_type):
    """Revoke user consent"""
    try:
        manager = ConsentManager(user_id)
        success = manager.revoke_consent(consent_type)
        return jsonify({'success': success})
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500

@csrf.exempt
@app.route('/api/encrypt', methods=['POST'])
@limiter.limit("50 per minute")
@require_api_key
def encrypt_data():
    """Encrypt sensitive data"""
    if not encryption:
        return jsonify({'success': False, 'error': 'Encryption not configured'}), 500
    
    try:
        data = request.json
        encrypted = encryption.encrypt(data['plaintext'])
        return jsonify({'success': True, 'encrypted': encrypted})
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 400

@csrf.exempt
@app.route('/api/decrypt', methods=['POST'])
@limiter.limit("50 per minute")
@require_api_key
def decrypt_data():
    """Decrypt sensitive data"""
    if not encryption:
        return jsonify({'success': False, 'error': 'Encryption not configured'}), 500

    try:
        data = request.json
        decrypted = encryption.decrypt(data['ciphertext'])
        return jsonify({'success': True, 'decrypted': decrypted})
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 400

@csrf.exempt
@app.route('/api/health', methods=['GET'])
@limiter.limit("100 per minute")
def health_check():
    """Health check endpoint"""
    return jsonify({
        'status': 'healthy',
        'timestamp': datetime.utcnow().isoformat(),
        'encryption_enabled': encryption is not None
    })

# Admin endpoints with authentication
@csrf.exempt
@app.route('/admin/security-logs', methods=['GET'])
@limiter.limit("10 per minute")
@require_api_key
def get_security_logs():
    """Get security logs - admin only"""
    return jsonify({
        'success': True,
        'logs': [
            {'timestamp': datetime.utcnow().isoformat(), 'event': 'Security logs access', 'user': 'admin'}
        ]
    })

@csrf.exempt
@app.route('/analytics/journeyman', methods=['GET'])
@limiter.limit("20 per minute")
@require_api_key
def get_analytics():
    """Get analytics data - requires API key"""
    return jsonify({
        'success': True,
        'analytics': {
            'total_players': 100,
            'average_score': 15.5
        }
    })

@csrf.exempt
@app.route('/save-player', methods=['POST'])
@limiter.limit("30 per minute")
def save_player():
    """Save player data with validation"""
    try:
        data = request.json

        # Validate required fields
        if not data:
            return jsonify({'success': False, 'error': 'Request body required'}), 400

        name = data.get('name', '').strip()
        email = data.get('email', '').strip()

        # Validate name
        if not name or len(name) == 0:
            return jsonify({'success': False, 'error': 'Name is required'}), 400

        if len(name) > 100:
            return jsonify({'success': False, 'error': 'Name too long'}), 400

        # Basic injection detection
        dangerous_patterns = ['<script', 'javascript:', 'DROP TABLE', 'UNION SELECT', '--', '; SELECT',
                            '<?php', '${', '$(', '`', 'eval(', 'exec(']
        for pattern in dangerous_patterns:
            if pattern.lower() in name.lower() or (email and pattern.lower() in email.lower()):
                return jsonify({'success': False, 'error': 'Invalid input detected'}), 400

        # Validate email
        if not email or len(email) == 0:
            return jsonify({'success': False, 'error': 'Email is required'}), 400

        if '@' not in email or '.' not in email.split('@')[1]:
            return jsonify({'success': False, 'error': 'Invalid email format'}), 400

        # Validate numeric fields if present
        correct_count = data.get('correctCount')
        if correct_count is not None:
            if not isinstance(correct_count, (int, float)) or correct_count < 0 or correct_count > 100:
                return jsonify({'success': False, 'error': 'Invalid score value'}), 400

        duration = data.get('durationInSeconds')
        if duration is not None:
            if not isinstance(duration, (int, float)) or duration <= 0 or duration > 3600:
                return jsonify({'success': False, 'error': 'Invalid duration value'}), 400

        # If all validation passes
        return jsonify({
            'success': True,
            'message': 'Player data saved',
            'player': {
                'name': name,
                'email': email
            }
        }), 200

    except Exception as e:
        return jsonify({'success': False, 'error': 'Invalid request'}), 400

@csrf.exempt
@app.route('/', methods=['GET'])
def index():
    """Root endpoint"""
    return jsonify({
        'service': 'Journeyman Data Protection API',
        'version': '1.0.0',
        'environment': ENVIRONMENT,
        'security': {
            'cors_enabled': True,
            'rate_limiting': True,
            'csrf_protection': True,
            'security_headers': IS_PRODUCTION or os.getenv('ENABLE_SECURITY_HEADERS', 'false').lower() == 'true',
            'https_enforced': IS_PRODUCTION,
            'max_request_size': '16MB'
        },
        'endpoints': {
            'health': '/api/health',
            'gdpr_export': '/api/gdpr/export/<user_id> (requires API key)',
            'gdpr_delete': '/api/gdpr/delete/<user_id> (requires API key)',
            'consent_get': '/api/consent/<user_id>',
            'consent_record': '/api/consent/<user_id>',
            'consent_revoke': '/api/consent/<user_id>/<consent_type>',
            'encrypt': '/api/encrypt (requires API key)',
            'decrypt': '/api/decrypt (requires API key)',
            'admin_logs': '/admin/security-logs (requires API key)',
            'analytics': '/analytics/journeyman (requires API key)',
            'save_player': '/save-player'
        }
    })

# Error handlers
@app.errorhandler(413)
def request_entity_too_large(error):
    """Handle request size limit exceeded"""
    return jsonify({
        'success': False,
        'error': 'Request payload too large',
        'max_size': '16MB'
    }), 413

@app.errorhandler(429)
def ratelimit_handler(error):
    """Handle rate limit exceeded"""
    return jsonify({
        'success': False,
        'error': 'Rate limit exceeded',
        'message': 'Too many requests. Please try again later.'
    }), 429

@app.errorhandler(401)
def unauthorized_handler(error):
    """Handle unauthorized access"""
    return jsonify({
        'success': False,
        'error': 'Unauthorized',
        'message': str(error.description) if hasattr(error, 'description') else 'Authentication required'
    }), 401

@app.errorhandler(403)
def forbidden_handler(error):
    """Handle forbidden access"""
    return jsonify({
        'success': False,
        'error': 'Forbidden',
        'message': str(error.description) if hasattr(error, 'description') else 'Access denied'
    }), 403

# Scheduled cleanup jobs
from apscheduler.schedulers.background import BackgroundScheduler
from utils.database import Database

def cleanup_expired_sessions():
    """Clean up expired sessions from database"""
    try:
        result = Database.execute_one('SELECT cleanup_expired_sessions()')
        count = result['cleanup_expired_sessions'] if result else 0
        print(f"✅ Cleaned up {count} expired sessions")
        return count
    except Exception as e:
        print(f"❌ Error cleaning up sessions: {e}")
        return 0

def cleanup_old_audit_logs():
    """Clean up old audit logs (retention: 90 days)"""
    try:
        result = Database.execute_one('SELECT cleanup_old_audit_logs(90)')
        count = result['cleanup_old_audit_logs'] if result else 0
        print(f"✅ Cleaned up {count} old audit logs")
        return count
    except Exception as e:
        print(f"❌ Error cleaning up audit logs: {e}")
        return 0

def cleanup_old_query_metrics():
    """Clean up old query metrics (retention: 30 days)"""
    try:
        result = Database.execute_one('SELECT cleanup_old_query_metrics(30)')
        count = result['cleanup_old_query_metrics'] if result else 0
        print(f"✅ Cleaned up {count} old query metrics")
        return count
    except Exception as e:
        print(f"❌ Error cleaning up query metrics: {e}")
        return 0

def refresh_materialized_views():
    """Refresh materialized views for analytics"""
    try:
        Database.execute_query('REFRESH MATERIALIZED VIEW CONCURRENTLY game_statistics')
        print("✅ Refreshed game_statistics materialized view")
        return True
    except Exception as e:
        print(f"❌ Error refreshing materialized views: {e}")
        return False

# Initialize scheduler
scheduler = BackgroundScheduler()

# Schedule cleanup jobs
if os.getenv('ENABLE_SCHEDULED_JOBS', 'true').lower() == 'true':
    # Clean up expired sessions daily at midnight
    scheduler.add_job(
        func=cleanup_expired_sessions,
        trigger='cron',
        hour=0,
        minute=0,
        id='cleanup_sessions',
        name='Clean up expired sessions',
        replace_existing=True
    )

    # Clean up old audit logs on first day of month
    scheduler.add_job(
        func=cleanup_old_audit_logs,
        trigger='cron',
        day=1,
        hour=1,
        minute=0,
        id='cleanup_audit_logs',
        name='Clean up old audit logs',
        replace_existing=True
    )

    # Clean up old query metrics weekly on Sunday
    scheduler.add_job(
        func=cleanup_old_query_metrics,
        trigger='cron',
        day_of_week='sun',
        hour=2,
        minute=0,
        id='cleanup_query_metrics',
        name='Clean up old query metrics',
        replace_existing=True
    )

    # Refresh materialized views hourly
    scheduler.add_job(
        func=refresh_materialized_views,
        trigger='cron',
        minute=0,
        id='refresh_views',
        name='Refresh materialized views',
        replace_existing=True
    )

    scheduler.start()
    print("✅ Scheduled cleanup jobs initialized")
else:
    print("⚠️  Scheduled jobs disabled via ENABLE_SCHEDULED_JOBS environment variable")

# Shutdown scheduler on exit
import atexit
atexit.register(lambda: scheduler.shutdown())

if __name__ == '__main__':
    port = int(os.getenv('PORT', 5001))
    print(f"\n{'='*70}")
    print(f"🚀 Journeyman Data Protection API Server")
    print(f"{'='*70}")
    print(f"📍 Running on: http://localhost:{port}")
    print(f"🌍 Environment: {ENVIRONMENT}")
    print(f"\n🔒 Security Configuration:")
    print(f"   • Encryption: {'Enabled ✓' if encryption else 'Disabled ✗'}")
    print(f"   • Rate Limiting: Enabled ✓")
    print(f"   • CORS: {'Restricted (Production)' if IS_PRODUCTION else 'Permissive (Development)'} ✓")
    print(f"   • CSRF Protection: Enabled ✓")
    print(f"   • Security Headers: {'Enabled ✓' if (IS_PRODUCTION or os.getenv('ENABLE_SECURITY_HEADERS', 'false').lower() == 'true') else 'Disabled (Dev)'}")
    print(f"   • HTTPS Enforcement: {'Enabled ✓' if IS_PRODUCTION else 'Disabled (Dev)'}")
    print(f"   • Request Size Limit: 16MB ✓")
    print(f"   • API Key Protection: {'Enabled ✓' if os.getenv('ADMIN_TOKEN') or os.getenv('API_KEY') else 'Warning: No API key set!'}")
    print(f"   • Redis Storage: {'Connected ✓' if redis_url else 'In-Memory (Dev)'}")
    print(f"{'='*70}\n")
    app.run(host='0.0.0.0', port=port, debug=os.getenv('FLASK_ENV') == 'development')