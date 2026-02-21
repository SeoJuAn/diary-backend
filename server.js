import express from 'express';
import { createServer } from 'http';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

// dotenv 직접 파싱 (의존성 추가 없이)
try {
  const envPath = join(dirname(fileURLToPath(import.meta.url)), '.env');
  const envContent = readFileSync(envPath, 'utf-8');
  envContent.split('\n').forEach((line) => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) return;
    const idx = trimmed.indexOf('=');
    if (idx === -1) return;
    const key = trimmed.slice(0, idx).trim();
    const val = trimmed.slice(idx + 1).trim();
    if (key && !process.env[key]) process.env[key] = val;
  });
} catch (e) {
  console.warn('.env 파일을 읽을 수 없습니다:', e.message);
}

const app = express();
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// ── 핸들러 동적 로딩 헬퍼 ──
async function loadHandler(path) {
  const mod = await import(path);
  return mod.default || mod;
}

// ── 라우터 등록 ──
const routes = [
  { method: 'post', path: '/api/auth/register',         handler: './api/auth/register.js' },
  { method: 'post', path: '/api/auth/login',            handler: './api/auth/login.js' },
  { method: 'post', path: '/api/auth/refresh',          handler: './api/auth/refresh.js' },
  { method: 'post', path: '/api/realtime/token',        handler: './api/realtime/token.js' },
  { method: 'post', path: '/api/realtime/end',          handler: './api/realtime/end.js' },
  { method: 'get',  path: '/api/conversations/history', handler: './api/conversations/history.js' },
  { method: 'post', path: '/api/organize-diary',        handler: './api/organize-diary.js' },
  { method: 'post', path: '/api/context/extract',       handler: './api/context/extract.js' },
  { method: 'post', path: '/api/audio/speech',          handler: './api/audio/speech.js' },
  { method: 'get',  path: '/api/advanced-presets',      handler: './api/advanced-presets.js' },
  { method: 'post', path: '/api/advanced-presets',      handler: './api/advanced-presets.js' },
  { method: 'put',  path: '/api/advanced-presets',      handler: './api/advanced-presets.js' },
  { method: 'delete', path: '/api/advanced-presets',    handler: './api/advanced-presets.js' },
];

// 프롬프트 동적 라우트
app.all('/api/prompts/versions/:id', async (req, res) => {
  const handler = await loadHandler('./api/prompts/versions/[id].js');
  handler(req, res);
});

app.all('/api/prompts/:endpoint', async (req, res) => {
  const handler = await loadHandler('./api/prompts/[endpoint].js');
  handler(req, res);
});

// 오디오 transcribe (multipart - 별도 처리)
app.post('/api/audio/transcribe', async (req, res) => {
  const handler = await loadHandler('./api/audio/transcribe.js');
  handler(req, res);
});

// 일반 라우트
for (const route of routes) {
  app[route.method](route.path, async (req, res) => {
    try {
      const handler = await loadHandler(route.handler);
      handler(req, res);
    } catch (err) {
      console.error(`Handler error [${route.path}]:`, err);
      res.status(500).json({ success: false, error: 'Internal server error' });
    }
  });
}

// ── 서버 시작 ──
const PORT = process.env.PORT || 3001;
const server = createServer(app);
server.listen(PORT, () => {
  console.log(`\n🚀 Diary Backend running on http://localhost:${PORT}`);
  console.log(`   - DB: ${process.env.DB_HOST}:${process.env.DB_PORT}/${process.env.DB_NAME}`);
  console.log(`   - OpenAI: ${process.env.OPENAI_API_KEY ? '✅ configured' : '❌ missing'}\n`);
});
