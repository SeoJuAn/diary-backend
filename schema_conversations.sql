-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- 대화 세션 테이블
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

CREATE TABLE IF NOT EXISTS conversation_sessions (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id           UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    session_id        VARCHAR(255) UNIQUE,          -- OpenAI session ID (sess_xxx)
    started_at        TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    ended_at          TIMESTAMP WITH TIME ZONE,
    duration_seconds  INTEGER DEFAULT 0,
    message_count     INTEGER DEFAULT 0,
    ended_by          VARCHAR(50) DEFAULT 'user',   -- 'user' | 'timeout' | 'error'

    -- organize-diary 결과 (사용자가 수정한 최종본)
    one_liner         TEXT,
    daily_highlights  JSONB DEFAULT '[]',
    goal_tracking     JSONB DEFAULT '[]',
    gratitude         JSONB DEFAULT '[]',
    emotions          JSONB DEFAULT '[]',
    full_diary        TEXT,

    -- context/extract 결과 (키워드 / 주요 사건)
    keywords          JSONB DEFAULT '[]',           -- ["연남동", "야근", "커튼 설치"]
    main_topics       JSONB DEFAULT '[]',           -- ["데이트", "업무", "집안일"]
    context_summary   TEXT,                         -- 대화 컨텍스트 분석 원문

    created_at        TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at        TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 인덱스
CREATE INDEX IF NOT EXISTS idx_conv_sessions_user_id    ON conversation_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_conv_sessions_started_at ON conversation_sessions(started_at DESC);
CREATE INDEX IF NOT EXISTS idx_conv_sessions_session_id ON conversation_sessions(session_id);
-- 키워드/주제 GIN 인덱스 (JSONB 검색 최적화)
CREATE INDEX IF NOT EXISTS idx_conv_sessions_keywords   ON conversation_sessions USING GIN(keywords);
CREATE INDEX IF NOT EXISTS idx_conv_sessions_topics     ON conversation_sessions USING GIN(main_topics);

-- 업데이트 시간 자동 갱신 트리거
CREATE TRIGGER update_conv_sessions_updated_at
    BEFORE UPDATE ON conversation_sessions
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- 대화 메시지 테이블 (원본 대화 내용)
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

CREATE TABLE IF NOT EXISTS conversation_messages (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id  UUID NOT NULL REFERENCES conversation_sessions(id) ON DELETE CASCADE,
    role        VARCHAR(20) NOT NULL CHECK (role IN ('user', 'assistant')),
    content     TEXT NOT NULL,
    turn_index  INTEGER NOT NULL DEFAULT 0,
    created_at  TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 인덱스
CREATE INDEX IF NOT EXISTS idx_conv_messages_session_id  ON conversation_messages(session_id);
CREATE INDEX IF NOT EXISTS idx_conv_messages_turn_index  ON conversation_messages(session_id, turn_index ASC);
-- 전문 검색 인덱스 (키워드 검색)
CREATE INDEX IF NOT EXISTS idx_conv_messages_content_fts ON conversation_messages USING GIN(to_tsvector('simple', content));

SELECT 'Conversations tables created successfully!' as status;
