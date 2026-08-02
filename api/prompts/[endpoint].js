import { query, transaction } from '../../lib/db.js';
import { verifyTokenFromRequest } from '../../lib/auth.js';

/**
 * Unified Prompts API for dynamic endpoint
 * 
 * GET  /api/prompts/[endpoint]?action=current    - Get current prompt
 * GET  /api/prompts/[endpoint]?action=versions   - Get all versions
 * POST /api/prompts/[endpoint]                   - Create new version
 * PUT  /api/prompts/[endpoint]                   - Switch version
 */
export default async function handler(req, res) {
  // CORS 설정
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  let userId;
  try {
    userId = verifyTokenFromRequest(req).userId;
  } catch (e) {
    return res.status(401).json({ success: false, error: '인증이 필요합니다.' });
  }

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

  try {
    // Route based on HTTP method and action parameter
    if (req.method === 'GET') {
      const { action } = req.query;
      if (action === 'versions') {
        return await handleGetVersions(req, res, endpoint, userId);
      } else {
        // Default: get current
        return await handleGetCurrent(req, res, endpoint, userId);
      }
    } else if (req.method === 'POST') {
      return await handleCreate(req, res, endpoint, userId);
    } else if (req.method === 'PUT') {
      return await handleSwitch(req, res, endpoint, userId);
    } else {
      return res.status(405).json({
        success: false,
        error: `Method ${req.method} not allowed`,
      });
    }
  } catch (error) {
    console.error('❌ Error in prompts API:', error);
    return res.status(error.statusCode || 500).json({
      success: false,
      error: error.statusCode ? error.message : 'Internal server error',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined,
    });
  }
}

/**
 * GET - Get current prompt version (own version takes priority, falls back to system)
 */
async function handleGetCurrent(req, res, endpoint, userId) {
  console.log(`🔍 Fetching current prompt for endpoint: ${endpoint}`);

  // 현재 활성 버전 조회 (본인 버전 우선, 없으면 시스템 기본값)
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
    WHERE endpoint = $1 AND is_current = TRUE AND (user_id = $2 OR user_id IS NULL)
    ORDER BY CASE WHEN user_id = $2 THEN 0 ELSE 1 END
    LIMIT 1`,
    [endpoint, userId]
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
      ...defaultResult.rows[0],
    });
  }

  return res.status(200).json({
    success: true,
    ...result.rows[0],
  });
}

/**
 * GET - Get all prompt versions (own + system versions only)
 */
async function handleGetVersions(req, res, endpoint, userId) {
  console.log(`📋 Fetching all versions for endpoint: ${endpoint}`);

  // 모든 버전 조회 (본인 버전 + 시스템 기본값만)
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
    WHERE endpoint = $1 AND (user_id = $2 OR user_id IS NULL)
    ORDER BY version`,
    [endpoint, userId]
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
}

/**
 * POST - Create new prompt version (always owned by the requesting user)
 */
async function handleCreate(req, res, endpoint, userId) {
  const { name, prompt, description } = req.body;

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

  console.log(`📝 Creating new prompt version for endpoint: ${endpoint}`);
  console.log(`Name: ${name}`);

  // 다음 버전 번호 계산 (본인 버전 기준) 및 삽입
  const result = await query(
    `WITH next_version AS (
      SELECT
        'v' || (COALESCE(MAX(CAST(SUBSTRING(version FROM 2) AS INTEGER)), -1) + 1) as new_version
      FROM prompt_versions
      WHERE endpoint = $1 AND user_id = $5
    )
    INSERT INTO prompt_versions (
      endpoint,
      version,
      name,
      prompt,
      description,
      is_current,
      user_id
    )
    SELECT
      $1,
      new_version,
      $2,
      $3,
      $4,
      FALSE,
      $5
    FROM next_version
    RETURNING
      id,
      endpoint,
      version,
      name,
      prompt,
      description,
      is_default as "isDefault",
      is_current as "isCurrent",
      created_at as "createdAt"`,
    [endpoint, name.trim(), prompt.trim(), description?.trim() || null, userId]
  );

  const newVersion = result.rows[0];

  console.log(`✅ Created version ${newVersion.version} for ${endpoint}`);

  return res.status(201).json({
    success: true,
    message: 'Prompt version created successfully',
    version: newVersion,
  });
}

/**
 * PUT - Switch current prompt version (own version or system default only)
 */
async function handleSwitch(req, res, endpoint, userId) {
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
    // 1. 대상 버전이 존재하는지 + 소유권 확인 (본인 버전이거나 시스템 기본값만 허용)
    const checkResult = await client.query(
      `SELECT id, endpoint, version, name, user_id
      FROM prompt_versions
      WHERE id = $1 AND endpoint = $2`,
      [versionId, endpoint]
    );

    if (checkResult.rows.length === 0) {
      throw new Error('Version not found or does not belong to this endpoint');
    }
    const target = checkResult.rows[0];
    if (target.user_id !== null && String(target.user_id) !== String(userId)) {
      const err = new Error('본인의 프롬프트만 활성화할 수 있습니다.');
      err.statusCode = 403;
      throw err;
    }

    // 2. 기존 current 플래그 제거 (본인 버전 또는 시스템 기본값 범위만)
    await client.query(
      `UPDATE prompt_versions
      SET is_current = FALSE, updated_at = CURRENT_TIMESTAMP
      WHERE endpoint = $1 AND (user_id = $2 OR (user_id IS NULL AND is_current = TRUE))`,
      [endpoint, userId]
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

    return updateResult.rows[0];
  });

  console.log(`✅ Switched to version ${result.version}`);

  return res.status(200).json({
    success: true,
    message: `Current version switched to ${result.version}`,
    currentVersion: result,
  });
}
