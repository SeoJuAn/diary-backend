import { query, transaction } from '../../lib/db.js';
import { verifyTokenFromRequest } from '../../lib/auth.js';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, error: 'Method not allowed. Use POST.' });
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

    const {
      sessionId,
      duration,
      messageCount,
      endedBy,
      messages = [],   // [{ role, content, turn_index }]
      summary = {},    // organize-diary 결과 (사용자가 수정한 최종본)
      context = {},    // context/extract 결과
    } = req.body;

    if (!sessionId) {
      return res.status(400).json({ success: false, error: 'sessionId is required' });
    }

    // ── 트랜잭션으로 세션 + 메시지 저장 ──
    const savedSession = await transaction(async (client) => {
      // 1. conversation_sessions upsert
      //    (같은 session_id로 중복 호출 방지 - ON CONFLICT UPDATE)
      const sessionResult = await client.query(
        `INSERT INTO conversation_sessions (
           user_id, session_id,
           ended_at, duration_seconds, message_count, ended_by,
           one_liner, daily_highlights, goal_tracking, gratitude, emotions, full_diary,
           keywords, main_topics, context_summary
         ) VALUES (
           $1, $2,
           NOW(), $3, $4, $5,
           $6, $7, $8, $9, $10, $11,
           $12, $13, $14
         )
         ON CONFLICT (session_id) DO UPDATE SET
           ended_at         = NOW(),
           duration_seconds = EXCLUDED.duration_seconds,
           message_count    = EXCLUDED.message_count,
           ended_by         = EXCLUDED.ended_by,
           one_liner        = EXCLUDED.one_liner,
           daily_highlights = EXCLUDED.daily_highlights,
           goal_tracking    = EXCLUDED.goal_tracking,
           gratitude        = EXCLUDED.gratitude,
           emotions         = EXCLUDED.emotions,
           full_diary       = EXCLUDED.full_diary,
           keywords         = EXCLUDED.keywords,
           main_topics      = EXCLUDED.main_topics,
           context_summary  = EXCLUDED.context_summary,
           updated_at       = NOW()
         RETURNING id`,
        [
          userId,
          sessionId,
          duration || 0,
          messageCount || messages.length,
          endedBy || 'user',
          // organize-diary 결과
          summary.oneLiner || null,
          JSON.stringify(summary.dailyHighlights || []),
          JSON.stringify(summary.goalTracking || []),
          JSON.stringify(summary.gratitude || []),
          JSON.stringify(summary.emotions || []),
          summary.fullDiary || null,
          // context/extract 결과
          JSON.stringify(context.keywords || []),
          JSON.stringify(context.mainTopics || []),
          context.contextSummary || null,
        ]
      );

      const internalSessionId = sessionResult.rows[0].id;

      // 2. 기존 메시지 삭제 후 재삽입 (upsert 재호출 시 중복 방지)
      if (messages.length > 0) {
        await client.query(
          'DELETE FROM conversation_messages WHERE session_id = $1',
          [internalSessionId]
        );

        // 메시지 bulk insert: (session_id, role, content, turn_index)
        const params = [internalSessionId];
        const placeholders = messages.map((msg, idx) => {
          const role = msg.role === 'assistant' ? 'assistant' : 'user';
          const content = (msg.content || '').trim();
          const turnIndex = msg.turn_index ?? idx;
          params.push(role, content, turnIndex);
          const base = 1 + idx * 3; // session_id는 $1
          return `($1, $${base + 1}, $${base + 2}, $${base + 3}, NOW())`;
        });

        await client.query(
          `INSERT INTO conversation_messages (session_id, role, content, turn_index, created_at)
           VALUES ${placeholders.join(', ')}`,
          params
        );
      }

      return { id: internalSessionId };
    });

    console.log('✅ Session saved:', { sessionId, userId, messages: messages.length });

    return res.status(200).json({
      success: true,
      message: '대화 기록이 저장되었습니다.',
      sessionDbId: savedSession.id,
      sessionId,
      savedMessages: messages.length,
    });

  } catch (error) {
    console.error('❌ Failed to save session:', error);
    return res.status(500).json({
      success: false,
      error: '대화 기록 저장 중 오류가 발생했습니다.',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined,
    });
  }
}
