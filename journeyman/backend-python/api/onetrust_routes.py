"""
OneTrust Routes for Flask Backend

Handles OneTrust webhook events and consent management operations
"""

from flask import Blueprint, request, jsonify
from utils.onetrust_client import onetrust_client
from datetime import datetime

# Create Blueprint
onetrust_bp = Blueprint('onetrust', __name__, url_prefix='/api/onetrust')


@onetrust_bp.route('/webhook', methods=['POST'])
def webhook():
    """
    Receive and process OneTrust webhook events

    Webhook events include:
    - Consent granted/updated/revoked
    - DSAR requests submitted
    - Preference center interactions
    """
    try:
        signature = request.headers.get('X-OneTrust-Signature') or request.headers.get('X-Webhook-Signature')
        raw_body = request.get_data(as_text=True)

        # Verify webhook signature for security
        if signature:
            is_valid = onetrust_client.verify_webhook_signature(signature, raw_body)
            if not is_valid:
                print('OneTrust webhook: Invalid signature')
                return jsonify({'error': 'Invalid webhook signature'}), 401

        event = request.get_json()
        print(f"OneTrust webhook received: {event.get('type')}")

        # Process different event types
        event_type = event.get('type')
        event_data = event.get('data', {})

        if event_type == 'consent.granted':
            handle_consent_granted(event_data)
        elif event_type == 'consent.updated':
            handle_consent_updated(event_data)
        elif event_type == 'consent.revoked':
            handle_consent_revoked(event_data)
        elif event_type == 'dsar.submitted':
            handle_dsar_submitted(event_data)
        elif event_type == 'preference.updated':
            handle_preference_updated(event_data)
        else:
            print(f'Unknown OneTrust event type: {event_type}')

        # Acknowledge receipt of webhook
        return jsonify({
            'received': True,
            'timestamp': datetime.utcnow().isoformat()
        }), 200

    except Exception as e:
        print(f'Error processing OneTrust webhook: {e}')
        return jsonify({'error': 'Failed to process webhook'}), 500


@onetrust_bp.route('/consent', methods=['POST'])
def record_consent():
    """Record consent from frontend"""
    try:
        data = request.get_json()
        user_id = data.get('userId')
        purposes = data.get('purposes', [])
        source = data.get('source', 'web')
        metadata = data.get('metadata', {})

        if not user_id:
            return jsonify({'error': 'userId is required'}), 400

        # Add request metadata
        metadata.update({
            'ipAddress': request.remote_addr,
            'userAgent': request.headers.get('User-Agent'),
            'timestamp': datetime.utcnow().isoformat()
        })

        result = onetrust_client.record_consent({
            'userId': user_id,
            'purposes': purposes,
            'source': source,
            'metadata': metadata
        })

        return jsonify({
            'success': True,
            'message': 'Consent recorded successfully',
            'data': result
        }), 200

    except Exception as e:
        print(f'Error recording consent: {e}')
        return jsonify({'error': 'Failed to record consent'}), 500


@onetrust_bp.route('/consent/<user_id>', methods=['GET'])
def get_consent(user_id):
    """Get consent receipt for a user"""
    try:
        receipt = onetrust_client.get_consent_receipt(user_id)

        if not receipt:
            return jsonify({'error': 'Consent receipt not found'}), 404

        return jsonify({
            'success': True,
            'data': receipt
        }), 200

    except Exception as e:
        print(f'Error getting consent receipt: {e}')
        return jsonify({'error': 'Failed to get consent receipt'}), 500


@onetrust_bp.route('/consent/<user_id>', methods=['PUT'])
def update_consent(user_id):
    """Update consent preferences for a user"""
    try:
        data = request.get_json()
        purposes = data.get('purposes', [])

        result = onetrust_client.update_consent(user_id, {'purposes': purposes})

        return jsonify({
            'success': True,
            'message': 'Consent updated successfully',
            'data': result
        }), 200

    except Exception as e:
        print(f'Error updating consent: {e}')
        return jsonify({'error': 'Failed to update consent'}), 500


@onetrust_bp.route('/consent/<user_id>/revoke', methods=['POST'])
def revoke_consent(user_id):
    """Revoke consent for a user"""
    try:
        data = request.get_json()
        purposes = data.get('purposes', [])

        result = onetrust_client.revoke_consent(user_id, purposes)

        return jsonify({
            'success': True,
            'message': 'Consent revoked successfully',
            'data': result
        }), 200

    except Exception as e:
        print(f'Error revoking consent: {e}')
        return jsonify({'error': 'Failed to revoke consent'}), 500


@onetrust_bp.route('/purposes', methods=['GET'])
def get_purposes():
    """Get list of available consent purposes"""
    try:
        purposes = onetrust_client.get_consent_purposes()

        return jsonify({
            'success': True,
            'data': purposes
        }), 200

    except Exception as e:
        print(f'Error getting consent purposes: {e}')
        return jsonify({'error': 'Failed to get consent purposes'}), 500


@onetrust_bp.route('/dsar', methods=['POST'])
def submit_dsar():
    """Submit a Data Subject Access Request"""
    try:
        data = request.get_json()
        user_id = data.get('userId')
        request_type = data.get('type')
        first_name = data.get('firstName', '')
        last_name = data.get('lastName', '')
        description = data.get('description', '')
        details = data.get('details', {})

        if not user_id or not request_type:
            return jsonify({'error': 'userId and type are required'}), 400

        valid_types = ['access', 'delete', 'portability', 'rectification']
        if request_type not in valid_types:
            return jsonify({'error': 'Invalid request type'}), 400

        result = onetrust_client.submit_data_subject_request({
            'userId': user_id,
            'type': request_type,
            'firstName': first_name,
            'lastName': last_name,
            'description': description,
            'details': details
        })

        return jsonify({
            'success': True,
            'message': 'DSAR submitted successfully',
            'data': result
        }), 200

    except Exception as e:
        print(f'Error submitting DSAR: {e}')
        return jsonify({'error': 'Failed to submit DSAR'}), 500


@onetrust_bp.route('/dsar/<request_id>', methods=['GET'])
def get_dsar_status(request_id):
    """Get status of a Data Subject Access Request"""
    try:
        status = onetrust_client.get_data_subject_request_status(request_id)

        if not status:
            return jsonify({'error': 'DSAR not found'}), 404

        return jsonify({
            'success': True,
            'data': status
        }), 200

    except Exception as e:
        print(f'Error getting DSAR status: {e}')
        return jsonify({'error': 'Failed to get DSAR status'}), 500


@onetrust_bp.route('/statistics', methods=['GET'])
def get_statistics():
    """Get consent statistics"""
    try:
        start_date = request.args.get('startDate')
        end_date = request.args.get('endDate')
        purpose = request.args.get('purpose')

        filters = {}
        if start_date:
            filters['startDate'] = start_date
        if end_date:
            filters['endDate'] = end_date
        if purpose:
            filters['purpose'] = purpose

        statistics = onetrust_client.get_consent_statistics(filters)

        return jsonify({
            'success': True,
            'data': statistics
        }), 200

    except Exception as e:
        print(f'Error getting consent statistics: {e}')
        return jsonify({'error': 'Failed to get consent statistics'}), 500


@onetrust_bp.route('/health', methods=['GET'])
def health_check():
    """Health check endpoint"""
    is_enabled = onetrust_client.is_enabled()

    return jsonify({
        'success': True,
        'enabled': is_enabled,
        'configured': is_enabled,
        'timestamp': datetime.utcnow().isoformat()
    }), 200


# Helper functions for webhook event handling

def handle_consent_granted(data):
    """Handle consent granted event"""
    print(f"Consent granted: {data}")
    # TODO: Update local database with consent grant
    # TODO: Trigger analytics initialization if needed
    # TODO: Send notification if required


def handle_consent_updated(data):
    """Handle consent updated event"""
    print(f"Consent updated: {data}")
    # TODO: Update local database with consent changes
    # TODO: Update user preferences


def handle_consent_revoked(data):
    """Handle consent revoked event"""
    print(f"Consent revoked: {data}")
    # TODO: Update local database
    # TODO: Stop data collection for user
    # TODO: Optionally delete user data based on policy


def handle_dsar_submitted(data):
    """Handle DSAR submitted event"""
    print(f"DSAR submitted: {data}")
    # TODO: Create DSAR record in database
    # TODO: Trigger data collection workflow
    # TODO: Send notification to privacy team


def handle_preference_updated(data):
    """Handle preference updated event"""
    print(f"Preference updated: {data}")
    # TODO: Update user preference settings
    # TODO: Sync with local database
