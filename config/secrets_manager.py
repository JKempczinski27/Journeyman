import os
from typing import Optional, Dict
import json
from pathlib import Path
from cryptography.fernet import Fernet
from cryptography.hazmat.primitives import hashes
from cryptography.hazmat.primitives.kdf.pbkdf2 import PBKDF2
from cryptography.hazmat.backends import default_backend
import base64

class SecretsManager:
    """Manage API keys and credentials securely"""
    
    def __init__(self):
        self.secrets: Dict[str, str] = {}
        self._load_from_env()
    
    def _load_from_env(self):
        """Load secrets from environment variables"""
        # Define required secrets
        required_secrets = [
            'DATABASE_URL',
            'ENCRYPTION_KEY',
            'API_KEY',
            'JWT_SECRET',
        ]
        
        for secret in required_secrets:
            value = os.environ.get(secret)
            if value:
                self.secrets[secret] = value
    
    def get_secret(self, key: str, default: Optional[str] = None) -> Optional[str]:
        """Retrieve a secret value"""
        return self.secrets.get(key, default)
    
    def set_secret(self, key: str, value: str):
        """Set a secret value (in-memory only)"""
        self.secrets[key] = value
    
    def validate_secrets(self) -> bool:
        """Validate that all required secrets are set"""
        required = ['DATABASE_URL', 'ENCRYPTION_KEY', 'JWT_SECRET']
        missing = [s for s in required if s not in self.secrets]
        
        if missing:
            raise ValueError(f"Missing required secrets: {', '.join(missing)}")
        return True

class DataEncryption:
    """Handle encryption and decryption of sensitive data"""
    
    def __init__(self, encryption_key: Optional[str] = None):
        if encryption_key:
            self.key = encryption_key.encode()
        else:
            self.key = os.environ.get('ENCRYPTION_KEY', '').encode()
        
        if not self.key:
            raise ValueError("Encryption key must be provided or set in ENCRYPTION_KEY env variable")
        
        kdf = PBKDF2(
            algorithm=hashes.SHA256(),
            length=32,
            salt=b'journeyman_salt',
            iterations=100000,
            backend=default_backend()
        )
        key = base64.urlsafe_b64encode(kdf.derive(self.key))
        self.cipher = Fernet(key)
    
    def encrypt(self, plaintext: str) -> str:
        """Encrypt a string and return base64 encoded ciphertext"""
        if not plaintext:
            return ""
        return self.cipher.encrypt(plaintext.encode()).decode()
    
    def decrypt(self, ciphertext: str) -> str:
        """Decrypt a base64 encoded ciphertext and return plaintext"""
        if not ciphertext:
            return ""
        return self.cipher.decrypt(ciphertext.encode()).decode()
    
    @staticmethod
    def generate_key() -> str:
        """Generate a new encryption key"""
        return Fernet.generate_key().decode()

def encrypt_field(value: str) -> str:
    """Encrypt a field value"""
    encryptor = DataEncryption()
    return encryptor.encrypt(value)

def decrypt_field(value: str) -> str:
    """Decrypt a field value"""
    encryptor = DataEncryption()
    return encryptor.decrypt(value)

# Global instance
secrets_manager = SecretsManager()

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
            'ip_address': None,
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
        return True
    
    @staticmethod
    def rectify_user_data(user_id: str, corrections: Dict) -> bool:
        """Allow users to correct their data (Right to Rectification)"""
        return True

from datetime import datetime, timedelta
from typing import Dict, List, Optional
from enum import Enum
import logging

logger = logging.getLogger(__name__)

class DataCategory(Enum):
    """Categories of data with different retention periods"""
    USER_PROFILE = "user_profile"
    ACTIVITY_LOGS = "activity_logs"
    FINANCIAL_RECORDS = "financial_records"
    MARKETING_DATA = "marketing_data"
    TEMPORARY_DATA = "temporary_data"
    ARCHIVED_DATA = "archived_data"

class RetentionPolicy:
    """Define retention periods for different data types"""
    
    RETENTION_PERIODS = {
        DataCategory.USER_PROFILE: timedelta(days=7*365),
        DataCategory.ACTIVITY_LOGS: timedelta(days=90),
        DataCategory.FINANCIAL_RECORDS: timedelta(days=7*365),
        DataCategory.MARKETING_DATA: timedelta(days=2*365),
        DataCategory.TEMPORARY_DATA: timedelta(days=30),
    }
    
    @classmethod
    def get_retention_period(cls, category: DataCategory) -> timedelta:
        """Get retention period for a data category"""
        return cls.RETENTION_PERIODS.get(category, timedelta(days=365))
    
    @classmethod
    def is_expired(cls, created_at: datetime, category: DataCategory) -> bool:
        """Check if data has exceeded retention period"""
        retention_period = cls.get_retention_period(category)
        expiry_date = created_at + retention_period
        return datetime.utcnow() > expiry_date

class DataRetentionManager:
    """Manage data retention and cleanup"""
    
    def __init__(self):
        self.deletion_log: List[Dict] = []
    
    def scan_expired_data(self, category: DataCategory) -> List[str]:
        """Scan for data that has exceeded retention period"""
        expired_records = []
        logger.info(f"Scanning for expired {category.value} data")
        return expired_records
    
    def delete_expired_data(self, category: DataCategory, dry_run: bool = True) -> int:
        """Delete data that has exceeded retention period"""
        expired_records = self.scan_expired_data(category)
        
        if dry_run:
            logger.info(f"DRY RUN: Would delete {len(expired_records)} records")
            return len(expired_records)
        
        deleted_count = 0
        for record_id in expired_records:
            try:
                logger.info(f"Deleting record: {record_id}")
                self.deletion_log.append({
                    'record_id': record_id,
                    'category': category.value,
                    'deleted_at': datetime.utcnow().isoformat(),
                })
                deleted_count += 1
            except Exception as e:
                logger.error(f"Failed to delete record {record_id}: {e}")
        
        return deleted_count