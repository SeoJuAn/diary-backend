// 인메모리 고정 윈도우 레이트리밋.
// 주의: Vercel 서버리스 함수는 인스턴스가 재사용되지 않으면 메모리가 초기화되므로
// 완전한 방어는 아니다 (콜드 스타트마다 카운터 리셋). 장시간 상주하는 server.js
// 실행 환경(단일 프로세스)에서는 그대로 유효하다. 근본 대책은 Redis 등 공유 스토어.
const buckets = new Map();

function getClientIp(req) {
  const forwarded = req.headers['x-forwarded-for'];
  if (forwarded) return forwarded.split(',')[0].trim();
  return req.socket?.remoteAddress || 'unknown';
}

/**
 * @param {import('http').IncomingMessage} req
 * @param {string} key 엔드포인트 식별자 (버킷 분리용)
 * @param {number} limit 윈도우당 허용 요청 수
 * @param {number} windowMs 윈도우 길이(ms)
 * @returns {boolean} true면 허용, false면 리밋 초과
 */
export function checkRateLimit(req, key, limit = 10, windowMs = 60_000) {
  const ip = getClientIp(req);
  const bucketKey = `${key}:${ip}`;
  const now = Date.now();
  const entry = buckets.get(bucketKey);

  if (!entry || now - entry.windowStart > windowMs) {
    buckets.set(bucketKey, { windowStart: now, count: 1 });
    return true;
  }

  entry.count += 1;
  return entry.count <= limit;
}
