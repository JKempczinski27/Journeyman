import os
from cryptography.fernet import Fernet
from cryptography.hazmat.primitives import hashes
from cryptography.hazmat.primitives.kdf.pbkdf2 import PBKDF2HMAC
from cryptography.hazmat.backends import default_backend
import base64
from typing import Optional

class DataEncryption:
    """Handle encryption and decryption of sensitive data"""
    
    def __init__(self, encryption_key: Optional[str] = None):
        if encryption_key:
            self.key = encryption_key.encode()
        else:
            self.key = os.environ.get('ENCRYPTION_KEY', '').encode()
        
        if not self.key:
            raise ValueError("Encryption key must be provided or set in ENCRYPTION_KEY env variable")
        
        kdf = PBKDF2HMAC(
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
