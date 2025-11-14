"""
OneTrust API Client for Python Flask Backend

This client provides methods to interact with the OneTrust API
for consent management, data subject requests, and compliance operations.

API Documentation: https://developer.onetrust.com/onetrust/reference/

Setup Instructions:
1. Get your API credentials from OneTrust Admin Console:
   - Navigate to Integrations > API
   - Generate an API Key
   - Copy your Tenant ID
2. Add credentials to your .env file:
   - ONETRUST_API_KEY=your-api-key
   - ONETRUST_TENANT_ID=your-tenant-id
   - ONETRUST_API_BASE_URL=https://app.onetrust.com/api
"""

import os
import requests
import hmac
import hashlib
from typing import Dict, List, Optional, Any
from datetime import datetime


class OneTrustClient:
    """Client for interacting with OneTrust API"""

    def __init__(self, api_key: Optional[str] = None, tenant_id: Optional[str] = None,
                 base_url: Optional[str] = None, enabled: Optional[bool] = None):
        """
        Initialize OneTrust client

        Args:
            api_key: OneTrust API key (defaults to ONETRUST_API_KEY env var)
            tenant_id: OneTrust tenant ID (defaults to ONETRUST_TENANT_ID env var)
            base_url: API base URL (defaults to ONETRUST_API_BASE_URL env var)
            enabled: Whether OneTrust is enabled (defaults to ONETRUST_ENABLED env var)
        """
        self.api_key = api_key or os.getenv('ONETRUST_API_KEY')
        self.tenant_id = tenant_id or os.getenv('ONETRUST_TENANT_ID')
        self.base_url = base_url or os.getenv('ONETRUST_API_BASE_URL', 'https://app.onetrust.com/api')
        self.enabled = enabled if enabled is not None else os.getenv('ONETRUST_ENABLED', 'false').lower() == 'true'

        if self.enabled and (not self.api_key or not self.tenant_id):
            print('WARNING: OneTrust API credentials not configured. Set ONETRUST_API_KEY and ONETRUST_TENANT_ID in .env file.')

        self.session = requests.Session()
        self.session.headers.update({
            'Authorization': f'Bearer {self.api_key}',
            'Content-Type': 'application/json',
            'Accept': 'application/json'
        })
        self.session.timeout = 10  # 10 second timeout

    def is_enabled(self) -> bool:
        """Check if OneTrust is enabled and configured"""
        return self.enabled and bool(self.api_key) and bool(self.tenant_id)

    def _make_request(self, method: str, endpoint: str, **kwargs) -> Optional[Dict]:
        """
        Make HTTP request to OneTrust API

        Args:
            method: HTTP method (GET, POST, PUT, DELETE)
            endpoint: API endpoint path
            **kwargs: Additional arguments for requests

        Returns:
            Response data or None on error
        """
        if not self.is_enabled():
            print('OneTrust is not enabled')
            return None

        url = f"{self.base_url}{endpoint}"

        try:
            response = self.session.request(method, url, **kwargs)
            response.raise_for_status()
            return response.json() if response.content else None

        except requests.exceptions.RequestException as e:
            print(f'OneTrust API Error: {e}')
            if hasattr(e.response, 'json'):
                print(f'Response: {e.response.json()}')
            raise

    def get_consent_receipt(self, user_id: str) -> Optional[Dict]:
        """
        Get consent receipt for a user

        Args:
            user_id: The user ID or email

        Returns:
            Consent receipt data
        """
        try:
            from urllib.parse import quote
            endpoint = f'/consent/v1/users/{quote(user_id)}/receipt'
            return self._make_request('GET', endpoint)
        except Exception as e:
            print(f'Failed to get consent receipt for user {user_id}: {e}')
            raise

    def record_consent(self, consent_data: Dict) -> Optional[Dict]:
        """
        Record consent for a user

        Args:
            consent_data: Consent data containing:
                - userId: User ID or email
                - purposes: Array of consent purpose IDs
                - source: Source of consent (e.g., 'web', 'mobile')
                - metadata: Additional metadata

        Returns:
            API response
        """
        try:
            payload = {
                'identifier': consent_data['userId'],
                'requestInformation': {
                    'source': consent_data.get('source', 'web'),
                    'method': consent_data.get('method', 'banner'),
                    'timestamp': consent_data.get('timestamp', datetime.utcnow().isoformat())
                },
                'purposes': consent_data.get('purposes', []),
                'metadata': consent_data.get('metadata', {})
            }

            result = self._make_request('POST', '/consent/v1/receipts', json=payload)
            print(f"Consent recorded for user {consent_data['userId']}")
            return result

        except Exception as e:
            print(f"Failed to record consent for user {consent_data.get('userId')}: {e}")
            raise

    def update_consent(self, user_id: str, preferences: Dict) -> Optional[Dict]:
        """
        Update consent preferences for a user

        Args:
            user_id: User ID or email
            preferences: Updated consent preferences containing 'purposes' array

        Returns:
            API response
        """
        try:
            from urllib.parse import quote
            payload = {
                'purposes': preferences.get('purposes', []),
                'timestamp': datetime.utcnow().isoformat()
            }

            endpoint = f'/consent/v1/users/{quote(user_id)}'
            result = self._make_request('PUT', endpoint, json=payload)
            print(f'Consent updated for user {user_id}')
            return result

        except Exception as e:
            print(f'Failed to update consent for user {user_id}: {e}')
            raise

    def revoke_consent(self, user_id: str, purposes: Optional[List[str]] = None) -> Optional[Dict]:
        """
        Revoke consent for a user

        Args:
            user_id: User ID or email
            purposes: Array of purpose IDs to revoke

        Returns:
            API response
        """
        try:
            from urllib.parse import quote
            payload = {
                'purposes': purposes or [],
                'action': 'revoke',
                'timestamp': datetime.utcnow().isoformat()
            }

            endpoint = f'/consent/v1/users/{quote(user_id)}/revoke'
            result = self._make_request('POST', endpoint, json=payload)
            print(f'Consent revoked for user {user_id}')
            return result

        except Exception as e:
            print(f'Failed to revoke consent for user {user_id}: {e}')
            raise

    def get_consent_purposes(self) -> List[Dict]:
        """
        Get list of available consent purposes

        Returns:
            Array of consent purposes
        """
        try:
            result = self._make_request('GET', '/consent/v1/purposes')
            return result or []
        except Exception as e:
            print(f'Failed to get consent purposes: {e}')
            raise

    def submit_data_subject_request(self, request_data: Dict) -> Optional[Dict]:
        """
        Submit a Data Subject Access Request (DSAR)

        Args:
            request_data: DSAR request data containing:
                - userId: User ID or email
                - type: Request type ('access', 'delete', 'portability', 'rectification')
                - firstName: Optional first name
                - lastName: Optional last name
                - description: Optional description
                - details: Additional request details

        Returns:
            API response with request ID
        """
        try:
            payload = {
                'dataSubject': {
                    'email': request_data['userId'],
                    'firstName': request_data.get('firstName', ''),
                    'lastName': request_data.get('lastName', '')
                },
                'requestType': request_data.get('type', 'access'),
                'description': request_data.get('description', ''),
                'metadata': request_data.get('details', {})
            }

            result = self._make_request('POST', '/dsar/v2/requests', json=payload)
            print(f"DSAR submitted for user {request_data['userId']} (Type: {request_data.get('type')})")
            return result

        except Exception as e:
            print(f"Failed to submit DSAR for user {request_data.get('userId')}: {e}")
            raise

    def get_data_subject_request_status(self, request_id: str) -> Optional[Dict]:
        """
        Get status of a Data Subject Access Request

        Args:
            request_id: The DSAR request ID

        Returns:
            DSAR status
        """
        try:
            endpoint = f'/dsar/v2/requests/{request_id}'
            return self._make_request('GET', endpoint)
        except Exception as e:
            print(f'Failed to get DSAR status for request {request_id}: {e}')
            raise

    def verify_webhook_signature(self, signature: str, body: str, secret: Optional[str] = None) -> bool:
        """
        Verify webhook signature from OneTrust

        Args:
            signature: Signature from webhook header
            body: Raw request body
            secret: Webhook secret from OneTrust (defaults to WEBHOOK_SECRET env var)

        Returns:
            True if signature is valid
        """
        try:
            secret = secret or os.getenv('WEBHOOK_SECRET', '')
            calculated_signature = hmac.new(
                secret.encode('utf-8'),
                body.encode('utf-8'),
                hashlib.sha256
            ).hexdigest()
            return hmac.compare_digest(signature, calculated_signature)
        except Exception as e:
            print(f'Failed to verify webhook signature: {e}')
            return False

    def get_consent_statistics(self, filters: Optional[Dict] = None) -> Optional[Dict]:
        """
        Get consent statistics

        Args:
            filters: Optional filters containing:
                - startDate: Start date for statistics
                - endDate: End date for statistics
                - purpose: Specific purpose to filter by

        Returns:
            Consent statistics
        """
        try:
            params = {}
            if filters:
                if 'startDate' in filters:
                    params['startDate'] = filters['startDate']
                if 'endDate' in filters:
                    params['endDate'] = filters['endDate']
                if 'purpose' in filters:
                    params['purpose'] = filters['purpose']

            return self._make_request('GET', '/consent/v1/statistics', params=params)

        except Exception as e:
            print(f'Failed to get consent statistics: {e}')
            raise

    def bulk_import_consent(self, consent_records: List[Dict]) -> Optional[Dict]:
        """
        Bulk import consent records

        Args:
            consent_records: Array of consent records to import

        Returns:
            Import result
        """
        try:
            payload = {
                'records': consent_records
            }

            result = self._make_request('POST', '/consent/v1/bulk-import', json=payload)
            print(f'Bulk imported {len(consent_records)} consent records')
            return result

        except Exception as e:
            print(f'Failed to bulk import consent records: {e}')
            raise


# Create singleton instance
onetrust_client = OneTrustClient()
