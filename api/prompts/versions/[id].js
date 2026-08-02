import { query } from '../../../lib/db.js';
import { verifyTokenFromRequest } from '../../../lib/auth.js';

/**
 * DELETE /api/prompts/versions/:id
 * 프롬프트 버전 삭제 (본인 소유, 기본값이 아니고 현재 활성화되지 않은 버전만)
 */
export default async function handler(req, res) {
  // CORS 설정
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'DELETE') {
    return res.status(405).json({
      success: false,
      error: 'Method not allowed. Use DELETE.',
    });
  }

  let userId;
  try {
    userId = verifyTokenFromRequest(req).userId;
  } catch (e) {
    return res.status(401).json({ success: false, error: '인증이 필요합니다.' });
  }

  try {
    // Vercel 동적 라우팅에서 ID 추출
    const { id: versionId } = req.query;

    if (!versionId) {
      return res.status(400).json({
        success: false,
        error: 'Version ID parameter is required',
      });
    }

    console.log(`🗑️  Attempting to delete version: ${versionId}`);

    // 버전 정보 조회 (삭제 전)
    const versionInfo = await query(
      `SELECT id, endpoint, version, name, is_default, is_current, user_id
      FROM prompt_versions
      WHERE id = $1`,
      [versionId]
    );

    if (versionInfo.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Version not found',
      });
    }

    const version = versionInfo.rows[0];

    // 기본 버전은 삭제 불가
    if (version.is_default) {
      return res.status(403).json({
        success: false,
        error: 'Cannot delete default version',
      });
    }

    // 본인 소유가 아니면 삭제 불가
    if (version.user_id === null || String(version.user_id) !== String(userId)) {
      return res.status(403).json({
        success: false,
        error: 'You can only delete your own prompt versions',
      });
    }

    // 현재 활성 버전 체크
    if (version.is_current) {
      return res.status(403).json({
        success: false,
        error: 'Cannot delete currently active version. Switch to another version first.',
      });
    }

    // 삭제 실행
    const deleteResult = await query(
      `DELETE FROM prompt_versions
      WHERE id = $1
        AND is_default = FALSE
        AND is_current = FALSE
        AND user_id = $2
      RETURNING id, endpoint, version, name`,
      [versionId, userId]
    );

    if (deleteResult.rows.length === 0) {
      return res.status(403).json({
        success: false,
        error: 'Version cannot be deleted (protected or currently active)',
      });
    }

    const deletedVersion = deleteResult.rows[0];

    console.log(`✅ Deleted version ${deletedVersion.version} from ${deletedVersion.endpoint}`);

    return res.status(200).json({
      success: true,
      message: `Version ${deletedVersion.version} deleted successfully`,
      deletedVersion: {
        id: deletedVersion.id,
        endpoint: deletedVersion.endpoint,
        version: deletedVersion.version,
        name: deletedVersion.name,
      },
    });

  } catch (error) {
    console.error('❌ Error deleting prompt version:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to delete prompt version',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined,
    });
  }
}
