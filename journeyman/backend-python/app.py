from flask import Flask, jsonify, request
from flask_cors import CORS
from dotenv import load_dotenv
import os
from datetime import datetime

from config.secrets_manager import secrets_manager
from utils.encryption import DataEncryption
from models.gdpr import GDPRCompliance, UserConsent, ConsentType
from utils.data_retention import DataRetentionManager, DataCategory
from api.consent_management import ConsentManager

load_dotenv()

app = Flask(__name__)
CORS(app)

# Initialize encryption
try:
    encryption = DataEncryption()
    print("✓ Encryption initialized successfully")
except ValueError as e:
    print(f"⚠ Warning: {e}")
    encryption = None

@app.route('/api/gdpr/export/<user_id>', methods=['GET'])
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

@app.route('/api/gdpr/delete/<user_id>', methods=['DELETE'])
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

@app.route('/api/consent/<user_id>', methods=['GET'])
def get_consents(user_id):
    """Get all consent records for a user"""
    try:
        manager = ConsentManager(user_id)
        consents = manager.get_all_consents()
        return jsonify({'success': True, 'consents': consents})
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500

@app.route('/api/consent/<user_id>', methods=['POST'])
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

@app.route('/api/consent/<user_id>/<consent_type>', methods=['DELETE'])
def revoke_consent(user_id, consent_type):
    """Revoke user consent"""
    try:
        manager = ConsentManager(user_id)
        success = manager.revoke_consent(consent_type)
        return jsonify({'success': success})
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500

@app.route('/api/encrypt', methods=['POST'])
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

@app.route('/api/decrypt', methods=['POST'])
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

@app.route('/api/health', methods=['GET'])
def health_check():
    """Health check endpoint"""
    return jsonify({
        'status': 'healthy',
        'timestamp': datetime.utcnow().isoformat(),
        'encryption_enabled': encryption is not None
    })

@app.route('/', methods=['GET'])
def index():
    """Root endpoint"""
    return jsonify({
        'service': 'Journeyman Data Protection API',
        'version': '1.0.0',
        'endpoints': {
            'health': '/api/health',
            'gdpr_export': '/api/gdpr/export/<user_id>',
            'gdpr_delete': '/api/gdpr/delete/<user_id>',
            'consent_get': '/api/consent/<user_id>',
            'consent_record': '/api/consent/<user_id>',
            'consent_revoke': '/api/consent/<user_id>/<consent_type>',
            'encrypt': '/api/encrypt',
            'decrypt': '/api/decrypt'
        }
    })

if __name__ == '__main__':
    port = int(os.getenv('PORT', 5001))
    print(f"\n{'='*60}")
    print(f"🚀 Journeyman Data Protection API Server")
    print(f"{'='*60}")
    print(f"📍 Running on: http://localhost:{port}")
    print(f"🔐 Encryption: {'Enabled ✓' if encryption else 'Disabled ✗'}")
    print(f"🌍 Environment: {os.getenv('FLASK_ENV', 'production')}")
    print(f"{'='*60}\n")
    app.run(host='0.0.0.0', port=port, debug=os.getenv('FLASK_ENV') == 'development')