const DEFAULT_ALLOWED = [
  'http://localhost:3000',
  'http://localhost:3001',
  'https://diary-backend-beta.vercel.app',
];

function getAllowedOrigins() {
  const fromEnv = process.env.CORS_ORIGINS;
  if (!fromEnv) return DEFAULT_ALLOWED;
  return fromEnv.split(',').map((o) => o.trim()).filter(Boolean);
}

/**
 * CORS 헤더를 설정한다. Origin이 허용 목록에 있을 때만 그 Origin을 에코한다
 * (와일드카드 '*' 대신). 허용되지 않은 Origin이면 헤더를 설정하지 않아
 * 브라우저가 요청을 차단하게 한다.
 */
export function applyCors(req, res, methods = 'GET, POST, OPTIONS') {
  const origin = req.headers.origin;
  const allowed = getAllowedOrigins();

  if (origin && allowed.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
  }

  res.setHeader('Access-Control-Allow-Methods', methods);
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
}
