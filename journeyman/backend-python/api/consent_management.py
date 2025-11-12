from typing import Dict, List, Optional
from datetime import datetime
from enum import Enum

class ConsentStatus(Enum):
    PENDING = "pending"
    GRANTED = "granted"
    DENIED = "denied"
    REVOKED = "revoked"

class ConsentManager:
    """Manage user consent preferences"""
    
    def __init__(self, user_id: str):
        self.user_id = user_id
    
    def request_consent(self, consent_type: str, purpose: str, 
                       legal_basis: str) -> Dict:
        """Request consent from user"""
        consent_request = {
            'user_id': self.user_id,
            'consent_type': consent_type,
            'purpose': purpose,
            'legal_basis': legal_basis,
            'status': ConsentStatus.PENDING.value,
            'requested_at': datetime.utcnow().isoformat(),
        }
        return consent_request
    
    def record_consent(self, consent_type: str, granted: bool, 
                      metadata: Optional[Dict] = None) -> Dict:
        """Record user's consent decision"""
        consent_record = {
            'user_id': self.user_id,
            'consent_type': consent_type,
            'status': ConsentStatus.GRANTED.value if granted else ConsentStatus.DENIED.value,
            'granted_at': datetime.utcnow().isoformat(),
            'ip_address': metadata.get('ip_address') if metadata else None,
            'user_agent': metadata.get('user_agent') if metadata else None,
        }
        return consent_record
    
    def revoke_consent(self, consent_type: str) -> bool:
        """Allow user to revoke consent"""
        return True
    
    def get_consent_status(self, consent_type: str) -> str:
        """Get current consent status"""
        return ConsentStatus.PENDING.value
    
    def get_all_consents(self) -> List[Dict]:
        """Get all consent records for user"""
        return []
    
    def consent_audit_log(self) -> List[Dict]:
        """Get audit log of all consent changes"""
        return []
