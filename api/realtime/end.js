export default async function handler(req, res) {
  // CORS 헤더 설정
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  // OPTIONS 요청 처리 (preflight)
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // POST만 허용
  if (req.method !== 'POST') {
    return res.status(405).json({
      success: false,
      error: 'Method not allowed. Use POST.',
    });
  }

  try {
    const { sessionId, duration, messageCount, endedBy } = req.body;

    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    // ① 입력 검증
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

    if (!sessionId) {
      return res.status(400).json({
        success: false,
        error: 'sessionId is required',
        example: {
          sessionId: 'sess_C9CiUVUzUzYIssh3ELY1d',
          duration: 320,
          messageCount: 15,
          endedBy: 'user',
        },
      });
    }

    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    // ② 세션 종료 로깅
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

    const sessionData = {
      sessionId,
      duration: duration || 0,
      messageCount: messageCount || 0,
      endedBy: endedBy || 'unknown',
      endedAt: new Date().toISOString(),
    };

    console.log('📊 Realtime session ended:', {
      sessionId: sessionData.sessionId,
      duration: `${sessionData.duration}s (${(sessionData.duration / 60).toFixed(1)}min)`,
      messageCount: sessionData.messageCount,
      endedBy: sessionData.endedBy,
      timestamp: sessionData.endedAt,
    });

    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    // ③ TODO: DB 저장 (나중에 Supabase 연동 시)
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

    // Supabase 예제:
    // const { data, error } = await supabase
    //   .from('realtime_sessions')
    //   .update({
    //     status: 'ended',
    //     duration_seconds: duration,
    //     message_count: messageCount,
    //     ended_by: endedBy,
    //     ended_at: new Date(),
    //   })
    //   .eq('session_id', sessionId);
    //
    // if (error) {
    //   console.error('Failed to update session in DB:', error);
    // }

    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    // ④ 성공 응답
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

    return res.status(200).json({
      success: true,
      message: 'Session ended and logged successfully',
      sessionData: {
        sessionId: sessionData.sessionId,
        duration: sessionData.duration,
        messageCount: sessionData.messageCount,
        endedBy: sessionData.endedBy,
      },
    });

  } catch (error) {
    console.error('❌ Failed to log session end:', error);

    return res.status(500).json({
      success: false,
      error: '세션 로그 저장 중 오류가 발생했습니다',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined,
    });
  }
}
