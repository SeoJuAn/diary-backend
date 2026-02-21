import { query } from '../../lib/db.js';
import { verifyTokenFromRequest } from '../../lib/auth.js';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') {
    return res.status(405).json({ success: false, error: 'Method not allowed. Use GET.' });
  }

  try {
    // ── JWT 검증 ──
    let decoded;
    try {
      decoded = verifyTokenFromRequest(req);
    } catch (e) {
      return res.status(401).json({ success: false, error: '인증이 필요합니다.' });
    }
    const userId = decoded.userId;

    // ── 쿼리 파라미터 파싱 ──
    const {
      date,       // YYYY-MM-DD : 특정 날짜의 세션 조회
      keyword,    // 키워드/주제 검색 (one_liner, keywords, main_topics, 메시지 내용)
      limit = '20',
      offset = '0',
      sessionId,  // 특정 세션 상세 조회 (messages 포함)
    } = req.query;

    const limitNum = Math.min(parseInt(limit, 10) || 20, 100);
    const offsetNum = parseInt(offset, 10) || 0;

    // ── 특정 세션 상세 조회 (messages 포함) ──
    if (sessionId) {
      const sessionResult = await query(
        `SELECT cs.*
         FROM conversation_sessions cs
         WHERE cs.id = $1 AND cs.user_id = $2`,
        [sessionId, userId]
      );

      if (sessionResult.rowCount === 0) {
        return res.status(404).json({ success: false, error: '세션을 찾을 수 없습니다.' });
      }

      const messagesResult = await query(
        `SELECT id, role, content, turn_index, created_at
         FROM conversation_messages
         WHERE session_id = $1
         ORDER BY turn_index ASC`,
        [sessionId]
      );

      return res.status(200).json({
        success: true,
        session: sessionResult.rows[0],
        messages: messagesResult.rows,
      });
    }

    // ── 세션 목록 조회 (날짜 / 키워드 필터) ──
    let conditions = ['cs.user_id = $1'];
    let params = [userId];
    let paramIdx = 2;

    // 날짜 필터
    if (date) {
      conditions.push(`DATE(cs.started_at AT TIME ZONE 'Asia/Seoul') = $${paramIdx}`);
      params.push(date);
      paramIdx++;
    }

    // 키워드 검색: one_liner, keywords JSONB, main_topics JSONB, 메시지 내용(서브쿼리)
    if (keyword) {
      const likePattern = `%${keyword}%`;
      conditions.push(`(
        cs.one_liner ILIKE $${paramIdx}
        OR cs.context_summary ILIKE $${paramIdx}
        OR cs.keywords::text ILIKE $${paramIdx}
        OR cs.main_topics::text ILIKE $${paramIdx}
        OR EXISTS (
          SELECT 1 FROM conversation_messages cm
          WHERE cm.session_id = cs.id
            AND cm.content ILIKE $${paramIdx}
        )
      )`);
      params.push(likePattern);
      paramIdx++;
    }

    const whereClause = conditions.join(' AND ');

    const sessionsResult = await query(
      `SELECT
         cs.id,
         cs.session_id,
         cs.started_at,
         cs.ended_at,
         cs.duration_seconds,
         cs.message_count,
         cs.ended_by,
         cs.one_liner,
         cs.daily_highlights,
         cs.goal_tracking,
         cs.gratitude,
         cs.emotions,
         cs.keywords,
         cs.main_topics,
         cs.context_summary
       FROM conversation_sessions cs
       WHERE ${whereClause}
       ORDER BY cs.started_at DESC
       LIMIT $${paramIdx} OFFSET $${paramIdx + 1}`,
      [...params, limitNum, offsetNum]
    );

    // 전체 개수
    const countResult = await query(
      `SELECT COUNT(*) FROM conversation_sessions cs WHERE ${whereClause}`,
      params
    );

    return res.status(200).json({
      success: true,
      sessions: sessionsResult.rows,
      total: parseInt(countResult.rows[0].count, 10),
      limit: limitNum,
      offset: offsetNum,
    });

  } catch (error) {
    console.error('❌ History error:', error);
    return res.status(500).json({
      success: false,
      error: '히스토리 조회 중 오류가 발생했습니다.',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined,
    });
  }
}
