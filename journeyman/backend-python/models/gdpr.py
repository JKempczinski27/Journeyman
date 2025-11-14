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
        from utils.database import Database

        try:
            # Get user information
            user_data = Database.execute_one(
                'SELECT id, username, email, created_at, last_login, is_active, is_verified FROM users WHERE id = %s',
                (user_id,)
            )

            # Get user's game sessions (by email if user exists)
            sessions = []
            if user_data and user_data.get('email'):
                sessions = Database.execute_query(
                    '''SELECT session_id, name, game_type, mode, duration_seconds,
                       correct_count, total_guesses, shared_on_social, created_at
                       FROM player_sessions WHERE email = %s
                       ORDER BY created_at DESC''',
                    (user_data['email'],)
                )

            # Get user consents
            consents = Database.execute_query(
                '''SELECT consent_type, consented, consented_at, withdrawn_at, ip_address
                   FROM user_consents WHERE user_id = %s''',
                (user_id,)
            )

            # Get audit logs
            audit_logs = Database.execute_query(
                '''SELECT action, resource_type, resource_id, ip_address, created_at
                   FROM audit_logs WHERE user_id = %s
                   ORDER BY created_at DESC LIMIT 1000''',
                (user_id,)
            )

            # Get data exports history
            export_history = Database.execute_query(
                '''SELECT status, requested_at, completed_at
                   FROM data_exports WHERE user_id = %s
                   ORDER BY requested_at DESC''',
                (user_id,)
            )

            return {
                'user_id': user_id,
                'export_date': datetime.utcnow().isoformat(),
                'personal_data': dict(user_data) if user_data else {},
                'game_sessions': [dict(s) for s in (sessions or [])],
                'activity_logs': [dict(log) for log in (audit_logs or [])],
                'consents': [dict(c) for c in (consents or [])],
                'export_history': [dict(e) for e in (export_history or [])],
                'data_summary': {
                    'total_sessions': len(sessions) if sessions else 0,
                    'total_audit_logs': len(audit_logs) if audit_logs else 0,
                    'total_consents': len(consents) if consents else 0
                }
            }
        except Exception as e:
            print(f"Error exporting user data: {e}")
            raise

    @staticmethod
    def anonymize_user_data(user_id: str) -> bool:
        """Anonymize user data (Right to be Forgotten)"""
        from utils.database import Database
        import hashlib

        try:
            with Database.get_cursor() as cursor:
                # Get user email before anonymization
                cursor.execute('SELECT email FROM users WHERE id = %s', (user_id,))
                user = cursor.fetchone()

                if not user:
                    print(f"User {user_id} not found")
                    return False

                user_email = user['email']
                anonymized_email = f"anonymized_{hashlib.sha256(user_email.encode()).hexdigest()[:16]}@deleted.local"
                anonymized_name = f"Deleted User {hashlib.sha256(user_id.encode()).hexdigest()[:8]}"

                # Anonymize user record
                cursor.execute('''
                    UPDATE users
                    SET username = %s,
                        email = %s,
                        password_hash = %s,
                        is_active = FALSE,
                        is_verified = FALSE
                    WHERE id = %s
                ''', (anonymized_name, anonymized_email, 'ANONYMIZED', user_id))

                # Anonymize player sessions by email
                cursor.execute('''
                    UPDATE player_sessions
                    SET name = %s,
                        email = %s,
                        ip_address = NULL,
                        user_agent = 'ANONYMIZED'
                    WHERE email = %s
                ''', (anonymized_name, anonymized_email, user_email))

                # Clear sensitive data from audit logs
                cursor.execute('''
                    UPDATE audit_logs
                    SET request_data = NULL,
                        ip_address = NULL,
                        user_agent = 'ANONYMIZED'
                    WHERE user_id = %s
                ''', (user_id,))

                # Record the deletion
                cursor.execute('''
                    INSERT INTO data_deletions (user_id, email, status, completed_at, deletion_data)
                    VALUES (%s, %s, 'completed', NOW(), %s)
                ''', (
                    user_id,
                    user_email,
                    '{"anonymization_method": "gdpr_right_to_be_forgotten", "anonymized_at": "' +
                    datetime.utcnow().isoformat() + '"}'
                ))

                # Log the anonymization
                cursor.execute('''
                    INSERT INTO audit_logs (
                        user_id, action, resource_type, resource_id, response_status
                    ) VALUES (%s, %s, %s, %s, %s)
                ''', (user_id, 'gdpr_anonymization', 'user', user_id, 200))

                print(f"✅ User {user_id} data anonymized successfully")
                return True

        except Exception as e:
            print(f"Error anonymizing user data: {e}")
            raise

    @staticmethod
    def rectify_user_data(user_id: str, corrections: Dict) -> bool:
        """Allow users to correct their data (Right to Rectification)"""
        from utils.database import Database

        try:
            # Only allow specific fields to be rectified
            allowed_fields = {'username', 'email'}
            fields_to_update = {k: v for k, v in corrections.items() if k in allowed_fields}

            if not fields_to_update:
                return False

            # Build UPDATE query
            set_clause = ', '.join([f"{field} = %s" for field in fields_to_update.keys()])
            values = list(fields_to_update.values()) + [user_id]

            with Database.get_cursor() as cursor:
                cursor.execute(
                    f'UPDATE users SET {set_clause} WHERE id = %s',
                    values
                )

                # Log the rectification
                cursor.execute('''
                    INSERT INTO audit_logs (
                        user_id, action, resource_type, resource_id,
                        request_data, response_status
                    ) VALUES (%s, %s, %s, %s, %s, %s)
                ''', (
                    user_id,
                    'gdpr_rectification',
                    'user',
                    user_id,
                    str(list(fields_to_update.keys())),
                    200
                ))

                return True

        except Exception as e:
            print(f"Error rectifying user data: {e}")
            return False
