import { query } from '../../../lib/db.js';

/**
 * GET /api/prompts/:endpoint/current
 * 특정 엔드포인트의 현재 활성 프롬프트 조회
 */
export default async function handler(req, res) {
  // CORS 설정
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'GET') {
    return res.status(405).json({
      success: false,
      error: 'Method not allowed. Use GET.',
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

    console.log(`🔍 Fetching current prompt for endpoint: ${endpoint}`);

    // 현재 활성 버전 조회
    const result = await query(
      `SELECT 
        id,
        endpoint,
        version,
        name,
        prompt,
        is_default as "isDefault",
        created_at as "createdAt"
      FROM prompt_versions
      WHERE endpoint = $1 AND is_current = TRUE
      LIMIT 1`,
      [endpoint]
    );

    if (result.rows.length === 0) {
      // 현재 버전이 없으면 Default 버전 반환
      const defaultResult = await query(
        `SELECT 
          id,
          endpoint,
          version,
          name,
          prompt,
          is_default as "isDefault",
          created_at as "createdAt"
        FROM prompt_versions
        WHERE endpoint = $1 AND is_default = TRUE
        LIMIT 1`,
        [endpoint]
      );

      if (defaultResult.rows.length === 0) {
        return res.status(404).json({
          success: false,
          error: 'No prompt found for this endpoint',
        });
      }

      return res.status(200).json({
        success: true,
        id: defaultResult.rows[0].id,
        endpoint,
        version: defaultResult.rows[0].version,
        prompt: defaultResult.rows[0].prompt,
        name: defaultResult.rows[0].name,
        isDefault: defaultResult.rows[0].isDefault,
        createdAt: defaultResult.rows[0].createdAt,
      });
    }

    const currentPrompt = result.rows[0];

    return res.status(200).json({
      success: true,
      id: currentPrompt.id,
      endpoint,
      version: currentPrompt.version,
      prompt: currentPrompt.prompt,
      name: currentPrompt.name,
      isDefault: currentPrompt.isDefault,
      createdAt: currentPrompt.createdAt,
    });

  } catch (error) {
    console.error('❌ Error fetching current prompt:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to fetch current prompt',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined,
    });
  }
}
