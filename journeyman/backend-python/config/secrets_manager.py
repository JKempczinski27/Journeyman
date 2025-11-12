import os
from typing import Optional, Dict

class SecretsManager:
    """Manage API keys and credentials securely"""
    
    def __init__(self):
        self.secrets: Dict[str, str] = {}
        self._load_from_env()
    
    def _load_from_env(self):
        """Load secrets from environment variables"""
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

secrets_manager = SecretsManager()
