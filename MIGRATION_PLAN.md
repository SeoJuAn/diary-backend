# 📊 Diary 프로젝트 분석 및 백엔드 마이그레이션 계획

> **작성일**: 2025-12-04  
> **목적**: React Native Diary 앱의 OpenAI API 호출을 Vercel 백엔드로 이관

---

## 🎯 프로젝트 개요

**TalkDiary** - 음성 기반 AI 일기 작성 앱
- **플랫폼**: React Native (iOS/Android)
- **주요 기능**: 실시간 음성 대화, 음성 녹음 일기 작성, 일기 분석/리포트
- **LLM 제공자**: OpenAI 전용 (Anthropic 아이콘은 있지만 실제 사용 안함)

---

## 🔌 현재 아키텍처 (클라이언트 직접 호출)

```
[React Native App] ──직접──> [OpenAI API]
    (API_KEY 포함)
```

### 문제점:
- ❌ API 키가 클라이언트에 노출됨 (보안 취약)
- ❌ 비용 관리 불가 (사용량 추적 어려움)
- ❌ Rate limiting 제어 불가
- ❌ 로깅/모니터링 없음
- ❌ 사용자 인증/권한 관리 없음

---

## 📡 현재 사용 중인 OpenAI API 엔드포인트

### 1️⃣ **Real-Time Voice API (WebRTC)** 🎤

**엔드포인트**: `POST https://api.openai.com/v1/realtime`

**파일 위치**:
- `components/modal/hooks/useRealTimeSession.ts` (220줄)
- `components/modal/RealTimeModalOld.tsx`

**기능**:
- WebRTC 기반 실시간 양방향 음성 대화
- 실시간 음성 전사 (transcription)
- Function calling (로컬 디바이스 제어)
- 대화 가드레일 시스템

**Request 구조**:
```typescript
POST /v1/realtime?model=gpt-4o-realtime-preview-2024-12-17
Headers:
  Authorization: Bearer ${API_KEY}
  Content-Type: application/sdp
Body: SDP offer (WebRTC)
```

**Response**: SDP answer → WebRTC DataChannel 연결

**특징**:
- 모델: `gpt-4o-mini-realtime-preview`, `gpt-4o-realtime-preview`
- 음성 선택: alloy, ash, ballad, coral, echo, sage, shimmer, verse
- 세션 시간 제한 설정
- 가드레일 민감도 조절 (1-3단계)

---

### 2️⃣ **Text-to-Speech (TTS)** 🔊

**엔드포인트**: `POST https://api.openai.com/v1/audio/speech`

**파일 위치**:
- `components/modal/hooks/useRealTimeSession.ts` (294-307줄)
- `components/modal/RealTimeModalOld.tsx` (503-515줄)

**기능**: 환영 메시지 음성 합성

**Request 구조**:
```json
{
  "model": "gpt-4o-mini-tts",
  "input": "안녕하세요 만나서 반갑습니다",
  "voice": "alloy",
  "instructions": "친근하고 밝은 톤으로 말해주세요",
  "response_format": "mp3"
}
```

**Response**: MP3 audio binary

---

### 3️⃣ **Speech-to-Text (Whisper)** 🎧

**엔드포인트**: `POST https://api.openai.com/v1/audio/transcriptions`

**파일 위치**:
- `components/modal/VoiceRecordingModal.tsx` (284-294줄)

**기능**: 녹음된 음성을 텍스트로 변환

**Request 구조** (FormData):
```javascript
{
  file: [audio file mp4],
  model: "gpt-4o-transcribe",
  response_format: "json",
  language: "ko",
  prompt: "일기, 하루, 오늘, 어제, 내일, 기분, 감정, 생각, 경험, 일상"
}
```

**Response**:
```json
{
  "text": "변환된 텍스트..."
}
```

---

### 4️⃣ **Chat Completions (GPT-4o)** 💬

**엔드포인트**: `POST https://api.openai.com/v1/chat/completions`

#### 사용처 A: 일기 정리 📝

**파일**: `components/modal/VoiceRecordingModal.tsx` (379-421줄)

**기능**: 음성 전사 텍스트를 구조화된 일기로 변환

**Request**:
```json
{
  "model": "gpt-4o",
  "messages": [
    {
      "role": "system",
      "content": "일기 작성 도우미 프롬프트..."
    },
    {
      "role": "user",
      "content": "다음 내용을 일기로 정리해주세요: [전사된 텍스트]"
    }
  ],
  "temperature": 0.7,
  "max_tokens": 1000,
  "response_format": {
    "type": "json_schema",
    "json_schema": {
      "name": "diary_summary",
      "strict": true,
      "schema": {
        "type": "object",
        "properties": {
          "oneLiner": { "type": "string" },
          "dailyHighlights": { 
            "type": "array", 
            "items": {"type": "string"}, 
            "maxItems": 3 
          },
          "goalTracking": { 
            "type": "array", 
            "items": {"type": "string"}, 
            "maxItems": 3 
          },
          "gratitude": { 
            "type": "array", 
            "items": {"type": "string"}, 
            "maxItems": 3 
          },
          "emotions": { 
            "type": "array", 
            "items": {"type": "string"}, 
            "maxItems": 3 
          },
          "fullDiary": { "type": "string" }
        },
        "required": [
          "oneLiner",
          "dailyHighlights",
          "goalTracking",
          "gratitude",
          "emotions",
          "fullDiary"
        ]
      }
    }
  }
}
```

**Response**: JSON Schema 기반 구조화된 일기 데이터

#### 사용처 B: 대화 컨텍스트 분석 🧠

**파일**: `components/common/ContextModal.tsx` (120-137줄)

**기능**: 대화 내역에서 주요 컨텍스트 추출

**Request**:
```json
{
  "model": "gpt-4o",
  "messages": [
    {
      "role": "user",
      "content": "대화 분석 프롬프트 + 전체 대화 내용"
    }
  ],
  "temperature": 0.7,
  "max_tokens": 500
}
```

**분석 항목**:
1. 대화의 주요 주제
2. 사용자의 의도나 목적
3. 중요한 정보나 키워드
4. 감정 상태나 톤
5. 대화의 흐름 요약

---

## 🛠️ 클라이언트 도구 (Function Calling)

**파일**: `lib/tools.ts`

OpenAI Realtime API가 호출할 수 있는 로컬 디바이스 함수들:

1. **getBatteryLevel()** - 배터리 잔량 조회
2. **changeBrightness(brightness)** - 화면 밝기 조절 (0-1)
3. **flashScreen()** - 화면 깜빡임 효과
4. **openURL(url)** - 브라우저에서 URL 열기
5. **vibrateDevice(duration)** - 진동 (ms)

**⚠️ 주의**: 이들은 외부 API가 아니라 로컬 디바이스 기능이므로 백엔드 이관 대상이 **아닙니다**.

---

## 🔑 API 키 관리

### 현재 방식:
```javascript
import Config from 'react-native-config';
const apiKey = Config.API_KEY;
```

`.env` 파일에서 로드:
```
API_KEY=sk-proj-...
```

**보안 문제**: 앱 바이너리 디컴파일 시 API 키 노출 가능

---

## 📊 데이터 타입 정의

**파일**: `types.tsx`

```typescript
// 메시지
interface Message {
  id: string;
  text: string;
  sender: 'user' | 'bot';
  createdAt: Date;
  loading?: boolean;
  audioUri?: string;
  audioData?: string;
}

// 일기 요약
interface DiarySummary {
  oneLiner: string;           // 오늘의 한줄
  dailyHighlights: string[];  // 주요 일상 (최대 3개)
  goalTracking: string[];     // 목표 추적 (최대 3개)
  gratitude: string[];        // 감사한 일들 (최대 3개)
  emotions: string[];         // 주요 감정 (최대 3개)
  fullDiary: string;          // 정리된 전체 일기
  originalText?: string;      // 원본 음성 전사
  date: Date;                 // 날짜
}
```

---

## 🚀 백엔드 마이그레이션 계획

### 🎯 목표 아키텍처

```
[React Native App] ──HTTPS──> [Node Backend on Vercel] ──> [OpenAI API]
                                      ↓
                                [Database/Storage]
                                [Logging/Analytics]
                                [Rate Limiting]
```

---

### 📋 이관해야 할 엔드포인트 (우선순위별)

#### **Priority 1 (High) - 보안 필수**

1. **POST `/api/openai/chat-completions`**
   - 일기 정리 (JSON Schema)
   - 대화 컨텍스트 분석
   
2. **POST `/api/openai/audio/transcriptions`**
   - 음성→텍스트 변환 (Whisper)
   - FormData multipart 처리 필요

3. **POST `/api/openai/audio/speech`**
   - 텍스트→음성 변환 (TTS)
   - 바이너리 응답 처리

#### **Priority 2 (Medium) - 복잡도 높음**

4. **POST `/api/openai/realtime/session`**
   - WebRTC 세션 초기화
   - SDP offer/answer 프록시
   - **주의**: WebRTC DataChannel은 P2P이므로 완전한 백엔드 이관이 어려움
   - **대안**: 세션 토큰 발급 방식으로 변경 검토

---

### 🗄️ diary-repo-backup 현황

**프레임워크**: Next.js 15.2.4 (App Router)

**기존 설정**:
- ✅ Next.js API Routes (`app/api/`)
- ✅ Supabase 연결 (`lib/supabase.ts`)
- ✅ 샘플 엔드포인트 (`/api/test-connection`)
- ✅ TypeScript
- ❌ OpenAI SDK 미설치
- ❌ 환경변수 (.env) 미설정

**설치 필요 패키지**:
```bash
pnpm add openai
pnpm add formidable  # 파일 업로드 처리
```

---

## 🔧 구현 계획

### 1단계: 환경 설정

**파일 생성**: `.env.local`
```env
OPENAI_API_KEY=sk-proj-...
SUPABASE_URL=https://...
SUPABASE_SERVICE_KEY=...
ALLOWED_ORIGINS=http://localhost:3000,exp://192.168.1.1:8081
```

### 2단계: OpenAI 클라이언트 라이브러리 구축

**파일**: `lib/openai.ts`
```typescript
import OpenAI from 'openai';

export const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});
```

### 3단계: API 엔드포인트 구현

#### A. 일기 정리 엔드포인트

**파일**: `app/api/diary/organize/route.ts`

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { openai } from '@/lib/openai';

export async function POST(request: NextRequest) {
  try {
    const { text, systemPrompt } = await request.json();
    
    const completion = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: `다음 내용을 일기로 정리해주세요:\n\n"${text}"` }
      ],
      temperature: 0.7,
      max_tokens: 1000,
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "diary_summary",
          strict: true,
          schema: {
            type: "object",
            properties: {
              oneLiner: { type: "string" },
              dailyHighlights: { 
                type: "array", 
                items: { type: "string" }, 
                maxItems: 3 
              },
              goalTracking: { 
                type: "array", 
                items: { type: "string" }, 
                maxItems: 3 
              },
              gratitude: { 
                type: "array", 
                items: { type: "string" }, 
                maxItems: 3 
              },
              emotions: { 
                type: "array", 
                items: { type: "string" }, 
                maxItems: 3 
              },
              fullDiary: { type: "string" }
            },
            required: [
              "oneLiner", 
              "dailyHighlights", 
              "goalTracking", 
              "gratitude", 
              "emotions", 
              "fullDiary"
            ]
          }
        }
      }
    });
    
    return NextResponse.json({
      success: true,
      summary: JSON.parse(completion.choices[0].message.content)
    });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: error.message }, 
      { status: 500 }
    );
  }
}
```

#### B. 음성 전사 엔드포인트

**파일**: `app/api/audio/transcribe/route.ts`

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { openai } from '@/lib/openai';

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const audioFile = formData.get('file') as File;
    
    const transcription = await openai.audio.transcriptions.create({
      file: audioFile,
      model: "gpt-4o-transcribe",
      language: "ko",
      prompt: "일기, 하루, 오늘, 어제, 내일, 기분, 감정, 생각, 경험, 일상",
      response_format: "json"
    });
    
    return NextResponse.json({
      success: true,
      text: transcription.text
    });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: error.message }, 
      { status: 500 }
    );
  }
}
```

#### C. TTS 엔드포인트

**파일**: `app/api/audio/speech/route.ts`

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { openai } from '@/lib/openai';

export async function POST(request: NextRequest) {
  try {
    const { input, voice, instructions } = await request.json();
    
    const mp3 = await openai.audio.speech.create({
      model: "gpt-4o-mini-tts",
      voice: voice || "alloy",
      input: input,
      instructions: instructions,
      response_format: "mp3"
    });
    
    const buffer = Buffer.from(await mp3.arrayBuffer());
    
    return new NextResponse(buffer, {
      headers: {
        'Content-Type': 'audio/mpeg',
        'Content-Length': buffer.length.toString()
      }
    });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: error.message }, 
      { status: 500 }
    );
  }
}
```

#### D. 대화 컨텍스트 분석 엔드포인트

**파일**: `app/api/context/extract/route.ts`

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { openai } from '@/lib/openai';

export async function POST(request: NextRequest) {
  try {
    const { messages, customPrompt } = await request.json();
    
    const conversationText = messages.map((msg: any) => {
      const role = msg.sender === 'user' ? '사용자' : 'AI';
      return `${role}: ${msg.text}`;
    }).join('\n\n');
    
    const completion = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [
        {
          role: "user",
          content: `${customPrompt}\n\n대화 내용:\n${conversationText}`
        }
      ],
      temperature: 0.7,
      max_tokens: 500
    });
    
    return NextResponse.json({
      success: true,
      context: completion.choices[0].message.content
    });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: error.message }, 
      { status: 500 }
    );
  }
}
```

#### E. Real-time 세션 프록시 (복잡)

**파일**: `app/api/realtime/session/route.ts`

```typescript
import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
  try {
    const sdpOffer = await request.text();
    const model = request.nextUrl.searchParams.get('model') 
      || 'gpt-4o-realtime-preview-2024-12-17';
    
    const response = await fetch(
      `https://api.openai.com/v1/realtime?model=${model}`, 
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
          'Content-Type': 'application/sdp'
        },
        body: sdpOffer
      }
    );
    
    const sdpAnswer = await response.text();
    
    return new NextResponse(sdpAnswer, {
      headers: {
        'Content-Type': 'application/sdp'
      }
    });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: error.message }, 
      { status: 500 }
    );
  }
}
```

---

## 📱 React Native 앱 수정 사항

### 1. 환경변수 변경

**파일**: `diary/.env`
```env
# 기존
API_KEY=sk-proj-...

# 변경 후
API_BASE_URL=https://your-vercel-app.vercel.app/api
# API_KEY 제거
```

### 2. API 호출 리팩토링

**예시**: `VoiceRecordingModal.tsx`

```typescript
// 기존
const response = await fetch('https://api.openai.com/v1/audio/transcriptions', {
  method: 'POST',
  headers: {
    Authorization: `Bearer ${apiKey}`,
  },
  body: formData,
});

// 변경 후
const response = await fetch(`${Config.API_BASE_URL}/audio/transcribe`, {
  method: 'POST',
  body: formData,
});
```

---

## 🔒 보안 강화 사항

1. **Rate Limiting** (Vercel Edge Config 사용)
2. **인증 미들웨어** (JWT/Session)
3. **CORS 설정** (특정 origin만 허용)
4. **Input Validation** (Zod 스키마)
5. **Error Handling** (민감 정보 노출 방지)
6. **Logging** (요청/응답 로깅, 에러 추적)

---

## 🤔 추가 고려사항

### Real-Time API WebRTC 문제

WebRTC는 본질적으로 **P2P(Peer-to-Peer)** 연결입니다. 현재 구조:

```
[App] ←─ WebRTC DataChannel ─→ [OpenAI Server]
```

백엔드를 통한 완전한 프록시는 기술적으로 복잡하며 레이턴시 증가 우려가 있습니다.

#### 권장 방안:

**Option A: Ephemeral Token 방식**
```
1. 앱 → 백엔드: 세션 요청
2. 백엔드 → 앱: 일회용 토큰 발급 (TTL 30분)
3. 앱 → OpenAI: 토큰으로 직접 WebRTC 연결
```

**Option B: WebRTC Relay Server 구축**
- 완전한 프록시 구현 (복잡도 매우 높음)
- 레이턴시 증가 우려

**Option C: 현재 유지 + 토큰 검증**
- Real-time API만 직접 호출 허용
- 나머지 API는 백엔드 경유
- 가장 현실적인 절충안

---

## 📊 예상 비용 및 성능

### API 호출 빈도 추정 (사용자 1명 기준)

- **Real-time Session**: 1일 1-2회 (평균 5분)
- **Speech-to-Text**: 1일 1-2회 (평균 2분 오디오)
- **Chat Completion (일기 정리)**: 1일 1-2회
- **TTS (환영 메시지)**: 1일 1-2회 (짧은 문장)
- **Context 분석**: 주 1-2회 (선택적)

### Vercel 무료 티어 제한
- Function 실행: 100시간/월
- 대역폭: 100GB/월
- Edge Functions: 500,000회/월

→ 소규모 사용자(~1000명)까지 무료로 운영 가능

---

## ✅ 다음 단계 제안

### 권장 실행 순서

#### **Phase 1**: 간단한 엔드포인트부터 시작
- Context 분석 API
- TTS API

#### **Phase 2**: 핵심 기능 이관
- Speech-to-Text API
- 일기 정리 API

#### **Phase 3**: 복잡한 기능 대응
- Real-time API 전략 결정 및 구현

#### **Phase 4**: 부가 기능
- 로깅/모니터링
- Rate limiting
- 사용자 인증

---

## 📝 API 요약 테이블

| 엔드포인트 | 메서드 | 파일 위치 | 우선순위 | 복잡도 |
|-----------|--------|----------|---------|--------|
| `/api/diary/organize` | POST | `VoiceRecordingModal.tsx:379` | High | Medium |
| `/api/audio/transcribe` | POST | `VoiceRecordingModal.tsx:284` | High | Medium |
| `/api/audio/speech` | POST | `useRealTimeSession.ts:294` | High | Low |
| `/api/context/extract` | POST | `ContextModal.tsx:120` | Medium | Low |
| `/api/realtime/session` | POST | `useRealTimeSession.ts:220` | Low | High |

---

## 📚 참고 자료

- [OpenAI API Documentation](https://platform.openai.com/docs/api-reference)
- [Next.js API Routes](https://nextjs.org/docs/app/building-your-application/routing/route-handlers)
- [Vercel Deployment](https://vercel.com/docs)
- [WebRTC MDN Documentation](https://developer.mozilla.org/en-US/docs/Web/API/WebRTC_API)

---

**마지막 업데이트**: 2025-12-04
