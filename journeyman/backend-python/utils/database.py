"""
Database utility for Python backend to connect to PostgreSQL
"""
import psycopg2
from psycopg2.extras import RealDictCursor
from psycopg2.pool import SimpleConnectionPool
import os
from contextlib import contextmanager

class Database:
    _pool = None

    @classmethod
    def initialize_pool(cls):
        """Initialize the connection pool"""
        if cls._pool is None:
            database_url = os.getenv('DATABASE_URL')

            if database_url:
                cls._pool = SimpleConnectionPool(
                    minconn=1,
                    maxconn=10,
                    dsn=database_url
                )
            else:
                # Fallback to individual connection parameters
                cls._pool = SimpleConnectionPool(
                    minconn=1,
                    maxconn=10,
                    host=os.getenv('DB_HOST', 'localhost'),
                    port=os.getenv('DB_PORT', 5432),
                    database=os.getenv('DB_NAME', 'journeyman_dev'),
                    user=os.getenv('DB_USER', 'postgres'),
                    password=os.getenv('DB_PASSWORD', 'postgres')
                )
            print("✅ Database connection pool initialized")

    @classmethod
    @contextmanager
    def get_connection(cls):
        """Get a database connection from the pool"""
        if cls._pool is None:
            cls.initialize_pool()

        conn = cls._pool.getconn()
        try:
            yield conn
        finally:
            cls._pool.putconn(conn)

    @classmethod
    @contextmanager
    def get_cursor(cls, cursor_factory=RealDictCursor):
        """Get a database cursor"""
        with cls.get_connection() as conn:
            cursor = conn.cursor(cursor_factory=cursor_factory)
            try:
                yield cursor
                conn.commit()
            except Exception as e:
                conn.rollback()
                raise e
            finally:
                cursor.close()

    @classmethod
    def execute_query(cls, query, params=None):
        """Execute a query and return results"""
        with cls.get_cursor() as cursor:
            cursor.execute(query, params or ())
            try:
                return cursor.fetchall()
            except psycopg2.ProgrammingError:
                # No results to fetch (e.g., INSERT, UPDATE, DELETE without RETURNING)
                return None

    @classmethod
    def execute_one(cls, query, params=None):
        """Execute a query and return one result"""
        with cls.get_cursor() as cursor:
            cursor.execute(query, params or ())
            try:
                return cursor.fetchone()
            except psycopg2.ProgrammingError:
                return None

# Initialize pool on import
try:
    Database.initialize_pool()
except Exception as e:
    print(f"⚠️  Warning: Could not initialize database pool: {e}")
