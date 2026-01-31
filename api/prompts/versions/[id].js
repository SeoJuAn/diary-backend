import { query } from '../../../lib/db.js';

/**
 * DELETE /api/prompts/versions/:id
 * 프롬프트 버전 삭제
 */
export default async function handler(req, res) {
  // CORS 설정
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'DELETE') {
    return res.status(405).json({
      success: false,
      error: 'Method not allowed. Use DELETE.',
    });
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
      `SELECT id, endpoint, version, name, is_deletable, is_current
      FROM diary.prompt_versions
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

    // 삭제 가능 여부 체크
    if (!version.is_deletable) {
      return res.status(403).json({
        success: false,
        error: 'Cannot delete default version (v0)',
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
      `DELETE FROM diary.prompt_versions
      WHERE id = $1
        AND is_deletable = TRUE
        AND is_current = FALSE
      RETURNING id, endpoint, version, name`,
      [versionId]
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
