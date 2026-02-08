import { transaction } from '../../../lib/db.js';

/**
 * PUT /api/prompts/:endpoint/switch
 * 현재 활성 프롬프트 버전 전환
 */
export default async function handler(req, res) {
  // CORS 설정
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'PUT, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'PUT') {
    return res.status(405).json({
      success: false,
      error: 'Method not allowed. Use PUT.',
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
    const { versionId } = req.body;

    if (!versionId || typeof versionId !== 'string') {
      return res.status(400).json({
        success: false,
        error: 'versionId field is required and must be a string (UUID)',
      });
    }

    console.log(`🔄 Switching current version for endpoint: ${endpoint}`);
    console.log(`Target version ID: ${versionId}`);

    // 트랜잭션으로 버전 전환
    const result = await transaction(async (client) => {
      // 1. 대상 버전이 존재하는지 확인
      const checkResult = await client.query(
        `SELECT id, endpoint, version, name
        FROM prompt_versions
        WHERE id = $1 AND endpoint = $2`,
        [versionId, endpoint]
      );

      if (checkResult.rows.length === 0) {
        throw new Error('Version not found or does not belong to this endpoint');
      }

      const targetVersion = checkResult.rows[0];

      // 2. 기존 current 플래그 제거
      await client.query(
        `UPDATE prompt_versions
        SET is_current = FALSE, updated_at = CURRENT_TIMESTAMP
        WHERE endpoint = $1 AND is_current = TRUE`,
        [endpoint]
      );

      // 3. 새 버전을 current로 설정
      const updateResult = await client.query(
        `UPDATE prompt_versions
        SET is_current = TRUE, updated_at = CURRENT_TIMESTAMP
        WHERE id = $1
        RETURNING 
          id,
          endpoint,
          version,
          name,
          is_current as "isCurrent",
          updated_at as "updatedAt"`,
        [versionId]
      );

      return {
        previous: null, // 이전 버전 정보는 생략
        current: updateResult.rows[0],
      };
    });

    console.log(`✅ Switched to version ${result.current.version}`);

    return res.status(200).json({
      success: true,
      message: `Current version switched to ${result.current.version}`,
      currentVersion: result.current,
    });

  } catch (error) {
    console.error('❌ Error switching prompt version:', error);

    if (error.message === 'Version not found or does not belong to this endpoint') {
      return res.status(404).json({
        success: false,
        error: error.message,
      });
    }

    return res.status(500).json({
      success: false,
      error: 'Failed to switch prompt version',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined,
    });
  }
}
