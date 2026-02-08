import { query } from '../../../lib/db.js';

/**
 * GET /api/prompts/:endpoint/versions
 * 특정 엔드포인트의 모든 프롬프트 버전 조회
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

    console.log(`📋 Fetching all versions for endpoint: ${endpoint}`);

    // 모든 버전 조회
    const result = await query(
      `SELECT 
        id, 
        endpoint, 
        version, 
        name, 
        prompt,
        is_default as "isDefault",
        is_current as "isCurrent",
        description,
        created_at as "createdAt",
        updated_at as "updatedAt"
      FROM prompt_versions
      WHERE endpoint = $1
      ORDER BY version`,
      [endpoint]
    );

    // 현재 버전 찾기
    const currentVersion = result.rows.find(v => v.isCurrent);

    return res.status(200).json({
      success: true,
      endpoint,
      currentVersion: currentVersion?.version || null,
      totalVersions: result.rows.length,
      versions: result.rows,
    });

  } catch (error) {
    console.error('❌ Error fetching prompt versions:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to fetch prompt versions',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined,
    });
  }
}
