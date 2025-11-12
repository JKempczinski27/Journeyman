from datetime import datetime, timedelta
from typing import List, Dict, Optional
from enum import Enum

class ConsentType(Enum):
    """Types of user consent"""
    ESSENTIAL = "essential"
    ANALYTICS = "analytics"
    MARKETING = "marketing"
    THIRD_PARTY = "third_party"

class UserConsent:
    """Track user consent for GDPR compliance"""
    
    def __init__(self, user_id: str):
        self.user_id = user_id
        self.consents: Dict[ConsentType, Dict] = {}
    
    def grant_consent(self, consent_type: ConsentType, purpose: str) -> None:
        """Record user consent"""
        self.consents[consent_type] = {
            'granted': True,
            'timestamp': datetime.utcnow().isoformat(),
            'purpose': purpose,
            'ip_address': None,  # Should be captured from request
        }
    
    def revoke_consent(self, consent_type: ConsentType) -> None:
        """Revoke user consent"""
        if consent_type in self.consents:
            self.consents[consent_type]['granted'] = False
            self.consents[consent_type]['revoked_at'] = datetime.utcnow().isoformat()
    
    def has_consent(self, consent_type: ConsentType) -> bool:
        """Check if user has granted consent"""
        return (consent_type in self.consents and 
                self.consents[consent_type].get('granted', False))

class GDPRCompliance:
    """Handle GDPR compliance operations"""
    
    @staticmethod
    def export_user_data(user_id: str) -> Dict:
        """Export all user data (Right to Data Portability)"""
        # Implement logic to collect all user data from various sources
        return {
            'user_id': user_id,
            'export_date': datetime.utcnow().isoformat(),
            'personal_data': {},
            'activity_logs': [],
            'consents': [],
        }
    
    @staticmethod
    def anonymize_user_data(user_id: str) -> bool:
        """Anonymize user data (Right to be Forgotten)"""
        # Implement logic to anonymize or delete user data
        # Keep only what's legally required
        return True
    
    @staticmethod
    def rectify_user_data(user_id: str, corrections: Dict) -> bool:
        """Allow users to correct their data (Right to Rectification)"""
        # Implement logic to update user data
        return True