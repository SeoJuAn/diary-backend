-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- 프롬프트 버전 관리 테이블
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

CREATE TABLE IF NOT EXISTS prompt_versions (
    -- 기본 정보
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    endpoint VARCHAR(100) NOT NULL, -- 'organize-diary', 'context-extract', 'tts', 'realtime'
    version VARCHAR(50) NOT NULL,   -- 'v0', 'v1', 'v2', ...
    name VARCHAR(200) NOT NULL,     -- 'Default', '수정 버전 2024-01-15', ...
    
    -- 프롬프트 내용
    prompt TEXT NOT NULL,
    description TEXT,
    
    -- 고급 설정 (JSON)
    advanced_config JSONB DEFAULT '{}',
    
    -- 메타 정보
    is_default BOOLEAN DEFAULT false,
    is_current BOOLEAN DEFAULT false,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    -- 제약 조건
    CONSTRAINT unique_endpoint_version UNIQUE(endpoint, version)
);

-- 인덱스
CREATE INDEX idx_prompt_versions_endpoint ON prompt_versions(endpoint);
CREATE INDEX idx_prompt_versions_is_current ON prompt_versions(is_current) WHERE is_current = true;
CREATE INDEX idx_prompt_versions_created_at ON prompt_versions(created_at DESC);

-- 업데이트 시간 자동 갱신 트리거
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_prompt_versions_updated_at 
    BEFORE UPDATE ON prompt_versions 
    FOR EACH ROW 
    EXECUTE FUNCTION update_updated_at_column();

-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- 기본 데이터 삽입
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

-- 1. organize-diary 기본 프롬프트
INSERT INTO prompt_versions (endpoint, version, name, prompt, description, is_default, is_current, advanced_config)
VALUES (
    'organize-diary',
    'v0',
    'Default',
    '당신은 친근하고 따뜻한 일기 작성 도우미입니다. 
사용자가 말한 내용을 바탕으로 구조화된 일기 요약을 생성해주세요.

규칙:
1. 한국어로 작성하세요
2. 1인칭 시점을 유지하세요 (나는, 내가 등)
3. 감정과 느낌을 풍부하게 표현하세요
4. 각 카테고리에 해당하는 내용이 없으면 빈 배열로 반환하세요
5. 각 항목은 간결하게 2-4단어로 표현하세요
6. oneLiner는 오늘 하루를 대표하는 한 문장으로 작성하세요
7. fullDiary는 전체 내용을 자연스럽게 3-5문장으로 정리하세요',
    '시스템 기본 프롬프트',
    true,
    true,
    '{}'
);

-- 2. context-extract 기본 프롬프트
INSERT INTO prompt_versions (endpoint, version, name, prompt, description, is_default, is_current, advanced_config)
VALUES (
    'context-extract',
    'v0',
    'Default',
    '다음 대화 내용을 분석하여 주요 컨텍스트를 추출해주세요:
1. 대화의 주요 주제
2. 사용자의 의도나 목적
3. 중요한 정보나 키워드
4. 감정 상태나 톤
5. 대화의 흐름 요약

결과는 간결하게 불릿 포인트 형식으로 정리해주세요.',
    '시스템 기본 프롬프트',
    true,
    true,
    '{}'
);

-- 3. tts 기본 설정
INSERT INTO prompt_versions (endpoint, version, name, prompt, description, is_default, is_current, advanced_config)
VALUES (
    'tts',
    'v0',
    'Default',
    '친근하고 밝은 톤으로 말해주세요',
    '시스템 기본 설정',
    true,
    true,
    '{}'
);

-- 4. realtime 기본 프롬프트 (고급 설정 포함)
INSERT INTO prompt_versions (endpoint, version, name, prompt, description, is_default, is_current, advanced_config)
VALUES (
    'realtime',
    'v0',
    'Default',
    '당신은 친근하고 따뜻한 일기 작성 도우미입니다. 사용자의 하루 이야기를 경청하고 공감하며 대화를 이어가세요. 자연스럽게 질문하고 사용자가 더 많은 이야기를 할 수 있도록 격려해주세요.',
    '시스템 기본 프롬프트',
    true,
    true,
    '{
        "temperature": 0.8,
        "speed": 1.0,
        "threshold": 0.5,
        "prefix_padding_ms": 300,
        "silence_duration_ms": 200,
        "idle_timeout_ms": null,
        "max_output_tokens": "inf",
        "noise_reduction": null,
        "truncation": "auto"
    }'::jsonb
);

-- 완료 메시지
SELECT 'Database schema created successfully!' as status;
