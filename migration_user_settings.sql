-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- Migration: 사용자별 프롬프트/프리셋 관리를 위한 user_id 컬럼 추가
-- 실행 방법: psql -h <host> -p <port> -U <user> -d <db> -f migration_user_settings.sql
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

-- 1. prompt_versions에 user_id 추가
--    기존 데이터(시스템 기본값)는 user_id = NULL로 유지됨
ALTER TABLE prompt_versions
  ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES users(id) ON DELETE CASCADE;

-- 2. advanced_presets에 user_id 추가
ALTER TABLE advanced_presets
  ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES users(id) ON DELETE CASCADE;

-- 3. 기존 UNIQUE 제약 변경 (endpoint+version → endpoint+version+user_id)
--    user_id NULL 허용으로 기존 시스템 프롬프트와 사용자 프롬프트 공존 가능
ALTER TABLE prompt_versions
  DROP CONSTRAINT IF EXISTS unique_endpoint_version;

-- user_id가 NULL인 경우(시스템)와 특정 user_id는 별도로 관리
-- PostgreSQL에서 NULL은 UNIQUE 제약에서 다른 NULL과 동등하지 않으므로
-- 시스템 프롬프트는 자동으로 중복 방지됨
CREATE UNIQUE INDEX IF NOT EXISTS unique_endpoint_version_user
  ON prompt_versions (endpoint, version, user_id)
  WHERE user_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS unique_endpoint_version_system
  ON prompt_versions (endpoint, version)
  WHERE user_id IS NULL;

-- 4. advanced_presets UNIQUE 제약 변경
ALTER TABLE advanced_presets
  DROP CONSTRAINT IF EXISTS unique_endpoint_preset_name;

CREATE UNIQUE INDEX IF NOT EXISTS unique_preset_name_user
  ON advanced_presets (endpoint, preset_name, user_id)
  WHERE user_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS unique_preset_name_system
  ON advanced_presets (endpoint, preset_name)
  WHERE user_id IS NULL;

-- 5. 인덱스 추가
CREATE INDEX IF NOT EXISTS idx_prompt_versions_user_id
  ON prompt_versions(user_id);

CREATE INDEX IF NOT EXISTS idx_advanced_presets_user_id
  ON advanced_presets(user_id);

SELECT 'Migration completed successfully!' AS status;
