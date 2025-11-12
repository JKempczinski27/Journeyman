from datetime import datetime, timedelta
from typing import Dict, List, Optional
from enum import Enum
import logging

logger = logging.getLogger(__name__)

class DataCategory(Enum):
    """Categories of data with different retention periods"""
    USER_PROFILE = "user_profile"  # 7 years after account deletion
    ACTIVITY_LOGS = "activity_logs"  # 90 days
    FINANCIAL_RECORDS = "financial_records"  # 7 years (legal requirement)
    MARKETING_DATA = "marketing_data"  # 2 years
    TEMPORARY_DATA = "temporary_data"  # 30 days
    ARCHIVED_DATA = "archived_data"  # Indefinite until requested deletion

class RetentionPolicy:
    """Define retention periods for different data types"""
    
    RETENTION_PERIODS = {
        DataCategory.USER_PROFILE: timedelta(days=7*365),  # 7 years
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
        # Implement logic to query database for expired data
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
                # Implement actual deletion logic
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
    
    def schedule_retention_cleanup(self):
        """Schedule regular cleanup of expired data (run as cron job)"""
        logger.info("Starting scheduled data retention cleanup")
        
        for category in DataCategory:
            if category == DataCategory.ARCHIVED_DATA:
                continue  # Skip archived data
            
            try:
                deleted = self.delete_expired_data(category, dry_run=False)
                logger.info(f"Deleted {deleted} expired {category.value} records")
            except Exception as e:
                logger.error(f"Error cleaning up {category.value}: {e}")