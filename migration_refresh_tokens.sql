-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- Migration: refresh token 서버 측 폐기/재사용 감지를 위한 테이블 추가
-- 실행 방법: psql -h <host> -p <port> -U <user> -d <db> -f migration_refresh_tokens.sql
--
-- 이 테이블이 없어도 서버는 정상 동작한다 (하위호환) — 존재하지 않는 동안은
-- 기존처럼 무상태 JWT로만 검증하고, 마이그레이션을 적용한 순간부터
-- 새로 발급되는 refresh token만 추적/폐기가 가능해진다. 기존에 이미
-- 발급된 refresh token(마이그레이션 이전)은 만료될 때까지 그대로 유효하다.
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

CREATE TABLE IF NOT EXISTS refresh_tokens (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token_hash  VARCHAR(64) NOT NULL UNIQUE,  -- sha256 hex
    revoked     BOOLEAN DEFAULT false,
    created_at  TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    expires_at  TIMESTAMP WITH TIME ZONE NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_refresh_tokens_user_id ON refresh_tokens(user_id);
CREATE INDEX IF NOT EXISTS idx_refresh_tokens_token_hash ON refresh_tokens(token_hash);

-- 만료된 행 정리는 애플리케이션 또는 별도 배치에서 주기적으로:
--   DELETE FROM refresh_tokens WHERE expires_at < NOW();

SELECT 'Migration completed successfully!' AS status;
