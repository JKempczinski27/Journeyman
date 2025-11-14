-- Production Database Initialization Script
-- This script sets up the database schema for Journeyman application

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Create users table
CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    username VARCHAR(255) UNIQUE NOT NULL,
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    last_login TIMESTAMP WITH TIME ZONE,
    is_active BOOLEAN DEFAULT TRUE,
    is_verified BOOLEAN DEFAULT FALSE
);

-- Create games table
CREATE TABLE IF NOT EXISTS games (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    game_type VARCHAR(100) NOT NULL,
    game_date DATE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    created_by UUID REFERENCES users(id),
    metadata JSONB
);

-- Create players table
CREATE TABLE IF NOT EXISTS players (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(255) NOT NULL,
    team VARCHAR(100),
    position VARCHAR(50),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    metadata JSONB
);

-- Create player_sessions table (for game session tracking)
CREATE TABLE IF NOT EXISTS player_sessions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    session_id VARCHAR(50) UNIQUE NOT NULL,
    player_id UUID REFERENCES players(id) ON DELETE SET NULL,
    name VARCHAR(100) NOT NULL,
    email VARCHAR(255) NOT NULL,
    game_type VARCHAR(50) NOT NULL,
    mode VARCHAR(50),
    duration_seconds INTEGER CHECK (duration_seconds >= 0 AND duration_seconds <= 3600),
    correct_count INTEGER CHECK (correct_count >= 0 AND correct_count <= 100),
    total_guesses INTEGER,
    shared_on_social BOOLEAN DEFAULT FALSE,
    game_specific_data JSONB,
    ip_address INET,
    user_agent TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Create game_data table
CREATE TABLE IF NOT EXISTS game_data (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    game_id UUID REFERENCES games(id) ON DELETE CASCADE,
    player_id UUID REFERENCES players(id) ON DELETE CASCADE,
    stats JSONB NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(game_id, player_id)
);

-- Create user_consents table (GDPR compliance)
CREATE TABLE IF NOT EXISTS user_consents (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    consent_type VARCHAR(100) NOT NULL,
    consented BOOLEAN NOT NULL DEFAULT FALSE,
    consented_at TIMESTAMP WITH TIME ZONE,
    withdrawn_at TIMESTAMP WITH TIME ZONE,
    ip_address INET,
    user_agent TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Create audit_logs table (security logging)
CREATE TABLE IF NOT EXISTS audit_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES users(id),
    action VARCHAR(100) NOT NULL,
    resource_type VARCHAR(100),
    resource_id UUID,
    ip_address INET,
    user_agent TEXT,
    request_data JSONB,
    response_status INTEGER,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Create sessions table
CREATE TABLE IF NOT EXISTS sessions (
    sid VARCHAR PRIMARY KEY,
    sess JSONB NOT NULL,
    expire TIMESTAMP(6) NOT NULL
);

-- Create data_exports table (GDPR data portability)
CREATE TABLE IF NOT EXISTS data_exports (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    status VARCHAR(50) NOT NULL DEFAULT 'pending',
    export_data JSONB,
    requested_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    completed_at TIMESTAMP WITH TIME ZONE,
    download_url TEXT,
    expires_at TIMESTAMP WITH TIME ZONE
);

-- Create data_deletions table (GDPR right to be forgotten)
CREATE TABLE IF NOT EXISTS data_deletions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID,
    email VARCHAR(255) NOT NULL,
    status VARCHAR(50) NOT NULL DEFAULT 'pending',
    requested_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    completed_at TIMESTAMP WITH TIME ZONE,
    deletion_data JSONB
);

-- Create query_metrics table (performance monitoring)
CREATE TABLE IF NOT EXISTS query_metrics (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    endpoint VARCHAR(255) NOT NULL,
    query_duration_ms INTEGER NOT NULL,
    query_type VARCHAR(100),
    status_code INTEGER,
    error_message TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Create indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_username ON users(username);
CREATE INDEX IF NOT EXISTS idx_games_game_date ON games(game_date);
CREATE INDEX IF NOT EXISTS idx_games_created_by ON games(created_by);
CREATE INDEX IF NOT EXISTS idx_game_data_game_id ON game_data(game_id);
CREATE INDEX IF NOT EXISTS idx_game_data_player_id ON game_data(player_id);
CREATE INDEX IF NOT EXISTS idx_user_consents_user_id ON user_consents(user_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_user_id ON audit_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON audit_logs(created_at);
CREATE INDEX IF NOT EXISTS idx_sessions_expire ON sessions(expire);
CREATE INDEX IF NOT EXISTS idx_data_exports_user_id ON data_exports(user_id);
CREATE INDEX IF NOT EXISTS idx_data_deletions_email ON data_deletions(email);

-- Additional performance indexes for player_sessions
CREATE INDEX IF NOT EXISTS idx_player_sessions_email ON player_sessions(email);
CREATE INDEX IF NOT EXISTS idx_player_sessions_created_at ON player_sessions(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_player_sessions_composite ON player_sessions(game_type, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_player_sessions_player_id ON player_sessions(player_id);
CREATE INDEX IF NOT EXISTS idx_player_sessions_session_id ON player_sessions(session_id);

-- GIN indexes for JSONB columns (better JSON query performance)
CREATE INDEX IF NOT EXISTS idx_game_data_stats_gin ON game_data USING GIN (stats);
CREATE INDEX IF NOT EXISTS idx_players_metadata_gin ON players USING GIN (metadata);
CREATE INDEX IF NOT EXISTS idx_player_sessions_game_data_gin ON player_sessions USING GIN (game_specific_data);

-- Composite indexes for common analytics queries
CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at_user ON audit_logs(created_at DESC, user_id);
CREATE INDEX IF NOT EXISTS idx_query_metrics_endpoint_created ON query_metrics(endpoint, created_at DESC);

-- Create function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create triggers for automatic updated_at updates
CREATE TRIGGER update_users_updated_at BEFORE UPDATE ON users
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_games_updated_at BEFORE UPDATE ON games
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_players_updated_at BEFORE UPDATE ON players
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_game_data_updated_at BEFORE UPDATE ON game_data
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_user_consents_updated_at BEFORE UPDATE ON user_consents
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_player_sessions_updated_at BEFORE UPDATE ON player_sessions
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Create view for active users
CREATE OR REPLACE VIEW active_users AS
SELECT id, username, email, created_at, last_login
FROM users
WHERE is_active = TRUE AND is_verified = TRUE;

-- Create view for recent games
CREATE OR REPLACE VIEW recent_games AS
SELECT g.id, g.game_type, g.game_date, g.created_at, u.username as created_by_username
FROM games g
LEFT JOIN users u ON g.created_by = u.id
WHERE g.game_date >= CURRENT_DATE - INTERVAL '30 days'
ORDER BY g.game_date DESC;

-- Grant appropriate permissions
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO postgres;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO postgres;

-- Create function for session cleanup (called by cron job)
CREATE OR REPLACE FUNCTION cleanup_expired_sessions()
RETURNS INTEGER AS $$
DECLARE
    deleted_count INTEGER;
BEGIN
    DELETE FROM sessions WHERE expire < CURRENT_TIMESTAMP;
    GET DIAGNOSTICS deleted_count = ROW_COUNT;
    RETURN deleted_count;
END;
$$ LANGUAGE plpgsql;

-- Create function for audit log cleanup (retention policy)
CREATE OR REPLACE FUNCTION cleanup_old_audit_logs(retention_days INTEGER DEFAULT 90)
RETURNS INTEGER AS $$
DECLARE
    deleted_count INTEGER;
BEGIN
    DELETE FROM audit_logs
    WHERE created_at < CURRENT_TIMESTAMP - (retention_days || ' days')::INTERVAL;
    GET DIAGNOSTICS deleted_count = ROW_COUNT;
    RETURN deleted_count;
END;
$$ LANGUAGE plpgsql;

-- Create function for query metrics cleanup (retention policy)
CREATE OR REPLACE FUNCTION cleanup_old_query_metrics(retention_days INTEGER DEFAULT 30)
RETURNS INTEGER AS $$
DECLARE
    deleted_count INTEGER;
BEGIN
    DELETE FROM query_metrics
    WHERE created_at < CURRENT_TIMESTAMP - (retention_days || ' days')::INTERVAL;
    GET DIAGNOSTICS deleted_count = ROW_COUNT;
    RETURN deleted_count;
    RAISE NOTICE 'Cleaned up % old query metrics records', deleted_count;
END;
$$ LANGUAGE plpgsql;

-- Enable pg_cron extension for scheduled tasks (requires superuser)
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- Schedule materialized view refresh (runs hourly)
DO $$
BEGIN
    -- Remove existing schedule if it exists
    PERFORM cron.unschedule('refresh-game-stats');
EXCEPTION
    WHEN undefined_table THEN
        RAISE NOTICE 'pg_cron not available, skipping scheduled tasks';
    WHEN OTHERS THEN
        NULL;
END $$;

-- Add scheduled tasks
DO $$
BEGIN
    -- Refresh game statistics materialized view every hour
    PERFORM cron.schedule('refresh-game-stats', '0 * * * *',
        'REFRESH MATERIALIZED VIEW CONCURRENTLY game_statistics');

    -- Cleanup expired sessions daily at midnight
    PERFORM cron.schedule('cleanup-sessions', '0 0 * * *',
        'SELECT cleanup_expired_sessions()');

    -- Cleanup old audit logs on first day of month
    PERFORM cron.schedule('cleanup-audit-logs', '0 0 1 * *',
        'SELECT cleanup_old_audit_logs(90)');

    -- Cleanup old query metrics weekly
    PERFORM cron.schedule('cleanup-query-metrics', '0 0 * * 0',
        'SELECT cleanup_old_query_metrics(30)');

    RAISE NOTICE 'Scheduled tasks configured successfully';
EXCEPTION
    WHEN undefined_table THEN
        RAISE NOTICE 'pg_cron not available, skipping scheduled tasks';
    WHEN OTHERS THEN
        RAISE NOTICE 'Error setting up scheduled tasks: %', SQLERRM;
END $$;

-- Insert default admin user (password: Admin123! - CHANGE THIS IN PRODUCTION)
-- Password hash for 'Admin123!' using bcrypt
INSERT INTO users (username, email, password_hash, is_active, is_verified)
VALUES (
    'admin',
    'admin@journeyman.local',
    '$2a$10$rYvGQKvvN4HvvGJ.qHkk7.5v8BKF5mVz5yK7cU3rH3vB6J2K9L8yK',
    TRUE,
    TRUE
)
ON CONFLICT (username) DO NOTHING;

-- Create materialized view for analytics (optional, for performance)
CREATE MATERIALIZED VIEW IF NOT EXISTS game_statistics AS
SELECT
    g.game_type,
    DATE_TRUNC('month', g.game_date) as month,
    COUNT(*) as total_games,
    COUNT(DISTINCT gd.player_id) as unique_players
FROM games g
LEFT JOIN game_data gd ON g.id = gd.game_id
GROUP BY g.game_type, DATE_TRUNC('month', g.game_date);

-- Create index on materialized view
CREATE INDEX IF NOT EXISTS idx_game_statistics_game_type ON game_statistics(game_type);
CREATE INDEX IF NOT EXISTS idx_game_statistics_month ON game_statistics(month);

-- Refresh materialized view function
CREATE OR REPLACE FUNCTION refresh_game_statistics()
RETURNS VOID AS $$
BEGIN
    REFRESH MATERIALIZED VIEW CONCURRENTLY game_statistics;
END;
$$ LANGUAGE plpgsql;

-- Success message
DO $$
BEGIN
    RAISE NOTICE 'Database initialization completed successfully!';
    RAISE NOTICE 'Remember to change the default admin password!';
END $$;
