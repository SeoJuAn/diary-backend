import { query } from '../../../lib/db.js';

/**
 * POST /api/prompts/:endpoint/versions (실제 경로: /api/prompts/:endpoint/create)
 * 새 프롬프트 버전 생성
 */
export default async function handler(req, res) {
  // CORS 설정
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({
      success: false,
      error: 'Method not allowed. Use POST.',
    });
  }

  try {
    // Vercel 동적 라우팅에서 endpoint 추출
    const { endpoint } = req.query;

    if (!endpoint) {
      return res.status(400).json({
        success: false,
        error: 'Endpoint parameter is required',
      });
    }

    // 유효한 엔드포인트 체크
    const validEndpoints = ['organize-diary', 'context-extract', 'tts', 'realtime'];
    if (!validEndpoints.includes(endpoint)) {
      return res.status(400).json({
        success: false,
        error: `Invalid endpoint. Must be one of: ${validEndpoints.join(', ')}`,
      });
    }

    // Request body 검증
    const { name, prompt, description, advancedConfig } = req.body;

    if (!name || typeof name !== 'string' || name.trim() === '') {
      return res.status(400).json({
        success: false,
        error: 'name field is required and must be a non-empty string',
      });
    }

    if (!prompt || typeof prompt !== 'string' || prompt.trim() === '') {
      return res.status(400).json({
        success: false,
        error: 'prompt field is required and must be a non-empty string',
      });
    }

    // advancedConfig를 JSON으로 변환 (realtime 엔드포인트에만 사용)
    const advancedConfigJson = advancedConfig ? JSON.stringify(advancedConfig) : '{}';

    console.log(`📝 Creating new prompt version for endpoint: ${endpoint}`);
    console.log(`Name: ${name}`);

    // 다음 버전 번호 계산 및 삽입
    const result = await query(
      `WITH next_version AS (
        SELECT 
          'v' || (COALESCE(MAX(CAST(SUBSTRING(version FROM 2) AS INTEGER)), -1) + 1) as new_version
        FROM prompt_versions
        WHERE endpoint = $1
      )
      INSERT INTO prompt_versions (
        endpoint, 
        version, 
        name, 
        prompt, 
        description,
        advanced_config,
        is_current
      )
      SELECT 
        $1,
        new_version,
        $2,
        $3,
        $4,
        $5::jsonb,
        FALSE
      FROM next_version
      RETURNING 
        id,
        endpoint,
        version,
        name,
        prompt,
        description,
        advanced_config as "advancedConfig",
        is_default as "isDefault",
        is_current as "isCurrent",
        created_at as "createdAt"`,
      [endpoint, name.trim(), prompt.trim(), description?.trim() || null, advancedConfigJson]
    );

    const newVersion = result.rows[0];

    console.log(`✅ Created version ${newVersion.version} for ${endpoint}`);

    return res.status(201).json({
      success: true,
      message: 'Prompt version created successfully',
      version: newVersion,
    });

  } catch (error) {
    console.error('❌ Error creating prompt version:', error);
    
    // Unique constraint 위반 체크
    if (error.code === '23505') {
      return res.status(409).json({
        success: false,
        error: 'Version already exists',
      });
    }

    return res.status(500).json({
      success: false,
      error: 'Failed to create prompt version',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined,
    });
  }
}
