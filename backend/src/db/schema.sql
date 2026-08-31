-- CIM Dashboard Database Schema
-- Run this on your PostgreSQL database (Supabase, Neon, Railway, etc.)

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ============================================================
-- CORE TABLES
-- ============================================================

CREATE TABLE visitors (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id      UUID NOT NULL DEFAULT gen_random_uuid(),
    name            VARCHAR(255) NOT NULL,
    email           VARCHAR(255) NOT NULL,
    user_agent      TEXT,
    ip_hash         VARCHAR(64),
    referrer        TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    last_seen_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_visitors_email ON visitors(email);
CREATE INDEX idx_visitors_session ON visitors(session_id);
CREATE INDEX idx_visitors_created ON visitors(created_at);

CREATE TABLE sessions (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    visitor_id      UUID NOT NULL REFERENCES visitors(id) ON DELETE CASCADE,
    project         VARCHAR(50),
    login_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
    logout_at       TIMESTAMPTZ,
    duration_sec    INTEGER,
    device_info     JSONB,
    is_active       BOOLEAN DEFAULT true
);

CREATE INDEX idx_sessions_visitor ON sessions(visitor_id);
CREATE INDEX idx_sessions_login ON sessions(login_at);
CREATE INDEX idx_sessions_active ON sessions(is_active) WHERE is_active = true;

CREATE TABLE activities (
    id              BIGSERIAL PRIMARY KEY,
    session_id      UUID NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
    visitor_id      UUID NOT NULL REFERENCES visitors(id) ON DELETE CASCADE,
    type            VARCHAR(50) NOT NULL,
    target          VARCHAR(100),
    metadata        JSONB,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_activities_session ON activities(session_id);
CREATE INDEX idx_activities_visitor ON activities(visitor_id);
CREATE INDEX idx_activities_type ON activities(type);
CREATE INDEX idx_activities_created ON activities(created_at);

CREATE TABLE feedback (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    visitor_id      UUID NOT NULL REFERENCES visitors(id) ON DELETE CASCADE,
    session_id      UUID REFERENCES sessions(id) ON DELETE SET NULL,
    rating          SMALLINT NOT NULL CHECK (rating BETWEEN 1 AND 5),
    comment         TEXT,
    project         VARCHAR(50),
    section         VARCHAR(100),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_feedback_visitor ON feedback(visitor_id);
CREATE INDEX idx_feedback_created ON feedback(created_at);
CREATE INDEX idx_feedback_rating ON feedback(rating);

CREATE TABLE admins (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    username        VARCHAR(100) NOT NULL UNIQUE,
    password_hash   VARCHAR(255) NOT NULL,
    role            VARCHAR(20) DEFAULT 'owner',
    last_login_at   TIMESTAMPTZ,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE admin_sessions (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    admin_id        UUID NOT NULL REFERENCES admins(id) ON DELETE CASCADE,
    token_hash      VARCHAR(64) NOT NULL,
    expires_at      TIMESTAMPTZ NOT NULL,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_admin_sessions_token ON admin_sessions(token_hash);
CREATE INDEX idx_admin_sessions_expires ON admin_sessions(expires_at);

CREATE TABLE dashboard_content (
    id              BIGSERIAL PRIMARY KEY,
    key             VARCHAR(255) NOT NULL UNIQUE,
    value           TEXT NOT NULL,
    updated_by      UUID REFERENCES admins(id) ON DELETE SET NULL,
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE report_generations (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    admin_id        UUID REFERENCES admins(id) ON DELETE SET NULL,
    type            VARCHAR(30) NOT NULL,
    scope           JSONB,
    record_count    INTEGER,
    file_path       TEXT,
    status          VARCHAR(20) DEFAULT 'pending',
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    completed_at    TIMESTAMPTZ
);

CREATE INDEX idx_report_generations_admin ON report_generations(admin_id);
CREATE INDEX idx_report_generations_status ON report_generations(status);

-- ============================================================
-- ROW LEVEL SECURITY (for Supabase)
-- ============================================================

ALTER TABLE visitors ENABLE ROW LEVEL SECURITY;
ALTER TABLE sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE activities ENABLE ROW LEVEL SECURITY;
ALTER TABLE feedback ENABLE ROW LEVEL SECURITY;
ALTER TABLE admins ENABLE ROW LEVEL SECURITY;
ALTER TABLE admin_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE dashboard_content ENABLE ROW LEVEL SECURITY;
ALTER TABLE report_generations ENABLE ROW LEVEL SECURITY;

-- Public read access for dashboard content (for visitor-facing content loading)
CREATE POLICY "Public read dashboard content" ON dashboard_content
    FOR SELECT USING (true);

-- Admin full access (using service role or JWT with admin claim)
-- These policies allow the backend service role to do everything
CREATE POLICY "Service role full access visitors" ON visitors
    FOR ALL USING (auth.role() = 'service_role');

CREATE POLICY "Service role full access sessions" ON sessions
    FOR ALL USING (auth.role() = 'service_role');

CREATE POLICY "Service role full access activities" ON activities
    FOR ALL USING (auth.role() = 'service_role');

CREATE POLICY "Service role full access feedback" ON feedback
    FOR ALL USING (auth.role() = 'service_role');

CREATE POLICY "Service role full access admins" ON admins
    FOR ALL USING (auth.role() = 'service_role');

CREATE POLICY "Service role full access admin_sessions" ON admin_sessions
    FOR ALL USING (auth.role() = 'service_role');

CREATE POLICY "Service role full access dashboard_content" ON dashboard_content
    FOR ALL USING (auth.role() = 'service_role');

CREATE POLICY "Service role full access report_generations" ON report_generations
    FOR ALL USING (auth.role() = 'service_role');

-- ============================================================
-- HELPER FUNCTIONS
-- ============================================================

-- Hash an IP address for privacy
CREATE OR REPLACE FUNCTION hash_ip(ip TEXT) RETURNS VARCHAR(64) AS $$
BEGIN
    RETURN encode(sha256(ip::bytea), 'hex');
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- Clean up expired admin sessions
CREATE OR REPLACE FUNCTION cleanup_expired_admin_sessions() RETURNS void AS $$
BEGIN
    DELETE FROM admin_sessions WHERE expires_at < now();
END;
$$ LANGUAGE plpgsql;

-- Get visitor stats for admin dashboard
CREATE OR REPLACE FUNCTION get_visitor_stats(
    p_from TIMESTAMPTZ DEFAULT NULL,
    p_to TIMESTAMPTZ DEFAULT NULL
) RETURNS TABLE (
    total_visitors BIGINT,
    unique_visitors BIGINT,
    total_sessions BIGINT,
    avg_session_duration INTERVAL,
    total_feedback BIGINT,
    avg_rating NUMERIC(3,2),
    total_downloads BIGINT
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        COUNT(DISTINCT v.id) as total_visitors,
        COUNT(DISTINCT v.email) as unique_visitors,
        COUNT(s.id) as total_sessions,
        AVG(s.duration_sec)::interval as avg_session_duration,
        COUNT(f.id) as total_feedback,
        AVG(f.rating)::numeric(3,2) as avg_rating,
        COUNT(a.id) FILTER (WHERE a.type = 'download') as total_downloads
    FROM visitors v
    LEFT JOIN sessions s ON s.visitor_id = v.id
    LEFT JOIN feedback f ON f.visitor_id = v.id
    LEFT JOIN activities a ON a.visitor_id = v.id
    WHERE (p_from IS NULL OR v.created_at >= p_from)
      AND (p_to IS NULL OR v.created_at <= p_to);
END;
$$ LANGUAGE plpgsql;

-- Get project popularity
CREATE OR REPLACE FUNCTION get_project_popularity(
    p_from TIMESTAMPTZ DEFAULT NULL,
    p_to TIMESTAMPTZ DEFAULT NULL
) RETURNS TABLE (
    project VARCHAR(50),
    views BIGINT,
    unique_visitors BIGINT
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        COALESCE(s.project, 'overview') as project,
        COUNT(a.id) as views,
        COUNT(DISTINCT a.visitor_id) as unique_visitors
    FROM activities a
    JOIN sessions s ON s.id = a.session_id
    WHERE a.type IN ('view_overview', 'view_tab', 'view_dashboard')
      AND (p_from IS NULL OR a.created_at >= p_from)
      AND (p_to IS NULL OR a.created_at <= p_to)
    GROUP BY s.project
    ORDER BY views DESC;
END;
$$ LANGUAGE plpgsql;

-- Get most viewed sections
CREATE OR REPLACE FUNCTION get_most_viewed_sections(
    p_from TIMESTAMPTZ DEFAULT NULL,
    p_to TIMESTAMPTZ DEFAULT NULL,
    p_limit INT DEFAULT 10
) RETURNS TABLE (
    section VARCHAR(100),
    views BIGINT,
    unique_visitors BIGINT
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        a.target as section,
        COUNT(a.id) as views,
        COUNT(DISTINCT a.visitor_id) as unique_visitors
    FROM activities a
    WHERE a.type = 'view_tab'
      AND (p_from IS NULL OR a.created_at >= p_from)
      AND (p_to IS NULL OR a.created_at <= p_to)
    GROUP BY a.target
    ORDER BY views DESC
    LIMIT p_limit;
END;
$$ LANGUAGE plpgsql;

-- Get feedback summary
CREATE OR REPLACE FUNCTION get_feedback_summary(
    p_from TIMESTAMPTZ DEFAULT NULL,
    p_to TIMESTAMPTZ DEFAULT NULL
) RETURNS TABLE (
    rating SMALLINT,
    count BIGINT
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        f.rating,
        COUNT(*) as count
    FROM feedback f
    WHERE (p_from IS NULL OR f.created_at >= p_from)
      AND (p_to IS NULL OR f.created_at <= p_to)
    GROUP BY f.rating
    ORDER BY f.rating;
END;
$$ LANGUAGE plpgsql;