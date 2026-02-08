-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- 고급 설정 프리셋 테이블 (프롬프트와 분리)
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

CREATE TABLE IF NOT EXISTS advanced_presets (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    endpoint VARCHAR(100) NOT NULL, -- 'realtime'만 사용
    preset_name VARCHAR(200) NOT NULL, -- '기본', '빠른응답', '높은품질', '커스텀1'...
    
    -- 고급 설정 값
    temperature DECIMAL(3,2) DEFAULT 0.8,
    speed DECIMAL(3,2) DEFAULT 1.0,
    threshold DECIMAL(3,2) DEFAULT 0.5,
    prefix_padding_ms INTEGER DEFAULT 300,
    silence_duration_ms INTEGER DEFAULT 200,
    idle_timeout_ms INTEGER DEFAULT NULL,
    max_output_tokens VARCHAR(20) DEFAULT 'inf',
    noise_reduction BOOLEAN DEFAULT NULL,
    truncation VARCHAR(20) DEFAULT 'auto',
    
    -- 메타 정보
    is_system BOOLEAN DEFAULT false, -- 시스템 기본 프리셋인지
    is_current BOOLEAN DEFAULT false, -- 현재 활성 프리셋인지
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    -- 제약 조건
    CONSTRAINT unique_endpoint_preset_name UNIQUE(endpoint, preset_name)
);

-- 인덱스
CREATE INDEX idx_advanced_presets_endpoint ON advanced_presets(endpoint);
CREATE INDEX idx_advanced_presets_is_current ON advanced_presets(is_current) WHERE is_current = true;

-- 업데이트 시간 자동 갱신 트리거
CREATE TRIGGER update_advanced_presets_updated_at 
    BEFORE UPDATE ON advanced_presets 
    FOR EACH ROW 
    EXECUTE FUNCTION update_updated_at_column();

-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- 기본 프리셋 데이터 삽입
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

-- 1. 기본 (Balanced)
INSERT INTO advanced_presets (
    endpoint, preset_name, 
    temperature, speed, threshold, prefix_padding_ms, silence_duration_ms,
    max_output_tokens, noise_reduction, truncation,
    is_system, is_current
) VALUES (
    'realtime', '기본 (Balanced)',
    0.8, 1.0, 0.5, 300, 200,
    'inf', NULL, 'auto',
    true, true
);

-- 2. 빠른 응답 (Fast Response)
INSERT INTO advanced_presets (
    endpoint, preset_name,
    temperature, speed, threshold, prefix_padding_ms, silence_duration_ms,
    max_output_tokens, noise_reduction, truncation,
    is_system, is_current
) VALUES (
    'realtime', '빠른 응답 (Fast Response)',
    0.6, 1.2, 0.3, 200, 100,
    'inf', true, 'auto',
    true, false
);

-- 3. 높은 품질 (High Quality)
INSERT INTO advanced_presets (
    endpoint, preset_name,
    temperature, speed, threshold, prefix_padding_ms, silence_duration_ms,
    max_output_tokens, noise_reduction, truncation,
    is_system, is_current
) VALUES (
    'realtime', '높은 품질 (High Quality)',
    0.9, 0.9, 0.6, 400, 300,
    'inf', true, 'disabled',
    true, false
);

-- 완료 메시지
SELECT 'Advanced presets table created successfully!' as status;
