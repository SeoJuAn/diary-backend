# 🎙️ Realtime API Ephemeral Token 구현 가이드

## 📋 개요

이 문서는 diary-backend에 구현된 **Ephemeral Token 방식 Realtime API**의 사용법과 React Native 앱 연동 방법을 설명합니다.

---

## 🏗️ 아키텍처

```
┌─────────────────────────────────────────────────────────────────────┐
│                  EPHEMERAL TOKEN 방식 (OpenAI 공식 지원)              │
└─────────────────────────────────────────────────────────────────────┘

Phase 1: 토큰 발급 (백엔드)
─────────────────────────────────────────────────────────────────────

[React Native App]         [diary-backend]              [OpenAI API]
       │                          │                           │
       │ ① POST /api/realtime/    │                           │
       │    token                 │                           │
       ├─────────────────────────>│                           │
       │                          │                           │
       │                          │ ② POST /v1/realtime/      │
       │                          │    client_secrets         │
       │                          ├──────────────────────────>│
       │                          │                           │
       │                          │ ③ { value: "ek_xxx" }    │
       │                          │<──────────────────────────┤
       │                          │                           │
       │ ④ { token: "ek_xxx" }   │                           │
       │<─────────────────────────┤                           │
       │                          │                           │

Phase 2: WebRTC 연결 (프론트 → OpenAI 직접)
─────────────────────────────────────────────────────────────────────

[React Native App]                              [OpenAI API]
       │                                               │
       │ ⑤ POST /v1/realtime/calls                    │
       │    Authorization: Bearer ek_xxx              │
       ├──────────────────────────────────────────────>│
       │                                               │
       │ ⑥ WebRTC P2P 연결 (50-150ms 저지연)         │
       │<═════════════════════════════════════════════>│
       │                                               │
       │ 🎤 ━━━ 양방향 실시간 음성 ━━━ 🔊            │
       │                                               │
```

---

## 🖥️ 백엔드 API

### 1️⃣ **POST `/api/realtime/token`** - 토큰 발급

Ephemeral Token을 발급받습니다.

#### Request Body

```json
{
  "userId": "user_12345",           // Optional - 사용자 식별
  "sessionConfig": {
    "model": "gpt-4o-realtime-preview-2024-12-17",
    "voice": "alloy",
    "instructions": "당신은 친근한 일기 작성 도우미입니다.",
    "temperature": 0.8,              // Optional
    "maxOutputTokens": 4096          // Optional
  }
}
```

#### Response (성공 - 200 OK)

```json
{
  "success": true,
  "token": "ek_68af296e8e408191a1120ab6383263c2",
  "sessionId": "sess_C9CiUVUzUzYIssh3ELY1d",
  "expiresAt": 1756310470,          // Unix timestamp
  "config": {
    "model": "gpt-4o-realtime-preview-2024-12-17",
    "voice": "alloy"
  }
}
```

#### Response (에러)

```json
{
  "success": false,
  "error": "에러 메시지",
  "details": "상세 정보 (개발 모드만)"
}
```

#### 사용 가능한 모델

- `gpt-4o-realtime-preview-2024-12-17` (권장)
- `gpt-4o-mini-realtime-preview`

#### 사용 가능한 음성

- `alloy`, `echo`, `shimmer`, `ash`, `ballad`, `coral`, `sage`, `verse`

---

### 2️⃣ **POST `/api/realtime/end`** - 세션 종료 로깅

세션 종료 시 사용량을 로깅합니다.

#### Request Body

```json
{
  "sessionId": "sess_C9CiUVUzUzYIssh3ELY1d",
  "duration": 320,              // 초 단위
  "messageCount": 15,           // 대화 메시지 수
  "endedBy": "user"             // 'user' | 'timeout' | 'error'
}
```

#### Response

```json
{
  "success": true,
  "message": "Session ended and logged successfully",
  "sessionData": {
    "sessionId": "sess_C9CiUVUzUzYIssh3ELY1d",
    "duration": 320,
    "messageCount": 15,
    "endedBy": "user"
  }
}
```

---

## 📱 React Native 앱 연동 방법

### 🔧 수정이 필요한 파일

**파일**: `diary/components/modal/hooks/useRealTimeSession.ts`

### 1️⃣ 토큰 요청 함수 추가

```typescript
// useRealTimeSession.ts 상단에 추가

const API_BASE_URL = 'https://diary-backend-beta.vercel.app';

interface TokenResponse {
  success: boolean;
  token: string;
  sessionId: string;
  expiresAt: number;
  config: {
    model: string;
    voice: string;
  };
}

const requestEphemeralToken = async (
  userId: string,
  sessionConfig: {
    model: string;
    voice: string;
    instructions: string;
    temperature?: number;
    maxOutputTokens?: number;
  }
): Promise<TokenResponse> => {
  try {
    const response = await fetch(`${API_BASE_URL}/api/realtime/token`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        userId,
        sessionConfig,
      }),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Failed to get realtime token');
    }

    const data = await response.json();
    
    if (!data.success) {
      throw new Error(data.error);
    }

    return data;
  } catch (error) {
    throw new Error(`토큰 발급 실패: ${error.message}`);
  }
};
```

---

### 2️⃣ startSession 함수 수정

기존 코드 (168-250줄):

```typescript
const startSession = async () => {
  triggerHaptic();
  const apiKey = Config.API_KEY;  // ❌ 제거
  if (!apiKey) {
    Alert.alert(...);
    return;
  }
  
  // ... WebRTC 연결 ...
  
  const baseUrl = 'https://api.openai.com/v1/realtime';
  const sdpResponse = await fetch(`${baseUrl}?model=${selectedModel}`, {
    method: 'POST',
    body: offer.sdp,
    headers: {
      Authorization: `Bearer ${apiKey}`,  // ❌ API 키 직접 사용
      'Content-Type': 'application/sdp',
    },
  });
};
```

**수정 후**:

```typescript
const startSession = async () => {
  triggerHaptic();
  setIsSessionStarting(true);

  // Android 권한 체크 (기존 로직 유지)
  if (Platform.OS === 'android') {
    // ... 기존 코드 유지 ...
  }

  try {
    InCallManager.start({media: 'audio'});
    InCallManager.setForceSpeakerphoneOn(true);

    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    // ✨ NEW: 백엔드에서 Ephemeral Token 발급
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

    console.log('🔐 Requesting ephemeral token from backend...');
    
    const tokenData = await requestEphemeralToken(
      'user_12345', // TODO: AsyncStorage에서 실제 사용자 ID 가져오기
      {
        model: selectedModel,
        voice: selectedVoice,
        instructions: getFinalPrompt(),
        temperature: 0.8,
        maxOutputTokens: 4096,
      }
    );

    console.log('✅ Token received:', {
      sessionId: tokenData.sessionId,
      expiresAt: new Date(tokenData.expiresAt * 1000).toISOString(),
    });

    // 세션 ID 저장 (종료 시 사용)
    sessionIdRef.current = tokenData.sessionId;

    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    // WebRTC 연결 (기존 로직)
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

    const pc = new RTCPeerConnection();
    
    pc.addEventListener('connectionstatechange', () => {
      console.log('Connection state:', pc.connectionState);
    });
    
    pc.addEventListener('track', (event: any) => {
      if (event.track) remoteMediaStream.current.addTrack(event.track);
    });

    const ms = await mediaDevices.getUserMedia({audio: true});
    const videoTrack = ms.getVideoTracks()[0];
    if (videoTrack) videoTrack.enabled = false;

    setLocalMediaStream(ms);
    ms.getTracks().forEach(track => pc.addTrack(track, ms));
    
    const dc = pc.createDataChannel('oai-events');
    setDataChannel(dc);
    
    const offer = await pc.createOffer({});
    await pc.setLocalDescription(offer);

    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    // ✨ CHANGED: Ephemeral Token으로 OpenAI 직접 호출
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

    const baseUrl = 'https://api.openai.com/v1/realtime/calls';  // ✅ URL 변경
    
    console.log('🌐 Connecting to OpenAI with ephemeral token...');

    const sdpResponse = await fetch(baseUrl, {
      method: 'POST',
      body: offer.sdp,
      headers: {
        Authorization: `Bearer ${tokenData.token}`,  // ✅ Ephemeral Token 사용
        'Content-Type': 'application/sdp',
      },
    });

    if (!sdpResponse.ok) {
      const errorText = await sdpResponse.text();
      throw new Error(`OpenAI connection failed: ${errorText}`);
    }

    const answerSdp = await sdpResponse.text();
    const answer = {
      type: 'answer' as RTCSdpType,
      sdp: answerSdp,
    };
    await pc.setRemoteDescription(answer);

    peerConnection.current = pc;

    console.log('✅ WebRTC connection established (P2P)');

    setSessionStartTime(Date.now());
    setIsTimeAlmostUp(false);
    setIsTimeUp(false);
    startTimeCheck();

  } catch (error) {
    console.error('❌ Failed to start session:', error);
    setIsSessionStarting(false);
    Alert.alert('연결 실패', error.message);
  }
};
```

---

### 3️⃣ stopSession 함수 수정 (세션 종료 로깅 추가)

기존 `stopSession` 함수 끝에 추가:

```typescript
const stopSession = async () => {
  try {
    // 기존 WebRTC 종료 로직 (유지)
    if (dataChannel) {
      dataChannel.close();
      setDataChannel(null);
    }

    if (peerConnection.current) {
      peerConnection.current.close();
      peerConnection.current = null;
    }

    if (localMediaStream) {
      localMediaStream.getTracks().forEach(track => track.stop());
      setLocalMediaStream(null);
    }

    InCallManager.stop();

    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    // ✨ NEW: 백엔드에 세션 종료 알림
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

    if (sessionIdRef.current && sessionStartTime) {
      const duration = Math.floor((Date.now() - sessionStartTime) / 1000);
      
      console.log('📊 Logging session end...');

      try {
        await fetch(`${API_BASE_URL}/api/realtime/end`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            sessionId: sessionIdRef.current,
            duration,
            messageCount: messages.length,
            endedBy: isTimeUp ? 'timeout' : 'user',
          }),
        });
        
        console.log('✅ Session end logged');
      } catch (logError) {
        console.warn('Failed to log session end:', logError);
        // 로깅 실패는 치명적이지 않으므로 무시
      }
    }

    // 상태 리셋 (기존 로직 유지)
    setIsSessionActive(false);
    setIsSessionStarting(false);
    setSessionStartTime(null);
    sessionIdRef.current = null;
    
    // ... 기타 상태 리셋 ...

  } catch (error) {
    console.error('Failed to stop session:', error);
  }
};
```

---

### 4️⃣ useRef 추가

파일 상단에 `sessionIdRef` 추가:

```typescript
// useRealTimeSession.ts 상단
const sessionIdRef = useRef<string | null>(null);
```

---

### 5️⃣ .env 파일 수정

**파일**: `diary/.env`

```env
# ❌ 제거 (더 이상 필요 없음)
# API_KEY=sk-proj-...

# ✅ 추가
API_BASE_URL=https://diary-backend-beta.vercel.app
```

**Config 사용법 변경**:

```typescript
// 기존
import Config from 'react-native-config';
const apiKey = Config.API_KEY;

// 변경 후 (필요하다면)
const API_BASE_URL = Config.API_BASE_URL || 'https://diary-backend-beta.vercel.app';
```

---

## 🧪 테스트 방법

### 1️⃣ 브라우저에서 테스트

1. `index.html` 파일을 브라우저로 열기
2. **"🎙️ Realtime Token 발급 API"** 섹션으로 이동
3. 모델, 음성, 지시사항 선택/입력
4. **"🔐 토큰 발급하기"** 버튼 클릭
5. 성공 시 `ek_xxx` 형식의 토큰 확인

### 2️⃣ cURL로 테스트

```bash
curl -X POST https://diary-backend-beta.vercel.app/api/realtime/token \
  -H "Content-Type: application/json" \
  -d '{
    "userId": "test_user",
    "sessionConfig": {
      "model": "gpt-4o-realtime-preview-2024-12-17",
      "voice": "alloy",
      "instructions": "당신은 친근한 도우미입니다."
    }
  }'
```

### 3️⃣ React Native 앱에서 테스트

1. 위의 코드 수정 사항 적용
2. 앱 재빌드 (`.env` 파일 변경 시 필수)
3. Real-time 모달 열기
4. 세션 시작
5. 콘솔에서 다음 로그 확인:
   - `🔐 Requesting ephemeral token from backend...`
   - `✅ Token received: { sessionId: ... }`
   - `🌐 Connecting to OpenAI with ephemeral token...`
   - `✅ WebRTC connection established (P2P)`

---

## 🔐 보안 고려사항

### ✅ 장점

1. **API 키 보호**: 앱 바이너리에 API 키가 노출되지 않음
2. **토큰 TTL**: 30분 후 자동 만료로 악용 방지
3. **세션 추적**: 백엔드에서 모든 세션 로깅 가능
4. **P2P 저지연**: WebRTC 직접 연결로 성능 유지

### ⚠️ 추가 권장 사항

1. **사용자 인증**: JWT 토큰으로 사용자 검증
2. **Rate Limiting**: 사용자당 토큰 발급 횟수 제한
3. **DB 저장**: 세션 데이터를 Supabase에 저장하여 분석
4. **모니터링**: 이상 패턴 감지 및 알림

---

## 📊 비용 최적화

### 토큰 재사용

- 한 번 발급받은 토큰으로 여러 세션 시작 가능 (만료 전까지)
- 앱에서 토큰을 메모리에 캐시하여 재사용 권장

### 세션 시간 제한

- 앱에서 이미 구현된 `sessionTimeLimit` 활용
- 기본 30분 제한 유지 권장

---

## 🐛 트러블슈팅

### Q1: "OpenAI API 오류" 발생

**원인**: `.env` 파일에 `OPENAI_API_KEY`가 없거나 잘못됨

**해결**:
```bash
# diary-backend/.env 파일 확인
OPENAI_API_KEY=sk-proj-...
```

### Q2: 토큰 발급은 되는데 WebRTC 연결 실패

**원인**: 토큰 형식 또는 URL 오류

**해결**:
- URL이 `/v1/realtime/calls`인지 확인
- Authorization 헤더가 `Bearer ek_xxx` 형식인지 확인

### Q3: 세션이 30분 이상 지속되는데 괜찮나?

**답변**: 네, 괜찮습니다.
- 토큰 만료(expires_at)는 **새 세션 시작 가능 시간**
- 기존 세션은 토큰 만료 후에도 계속 유지됨

---

## 📚 참고 자료

- [OpenAI Realtime API 공식 문서](https://platform.openai.com/docs/guides/realtime)
- [OpenAI Client Secrets API](https://platform.openai.com/docs/api-reference/realtime-sessions/create-realtime-client-secret)
- [WebRTC MDN 문서](https://developer.mozilla.org/en-US/docs/Web/API/WebRTC_API)

---

## 📝 다음 단계

### Phase 1: 기본 구현 (완료)
- [x] 백엔드 API 구현 (`/api/realtime/token`, `/api/realtime/end`)
- [x] 테스트 UI 추가 (`index.html`)
- [ ] React Native 앱 연동

### Phase 2: 보안 강화 (TODO)
- [ ] JWT 기반 사용자 인증
- [ ] Rate Limiting 구현
- [ ] IP 기반 제한

### Phase 3: 데이터 분석 (TODO)
- [ ] Supabase 연동
- [ ] 세션 데이터 저장
- [ ] 사용량 대시보드 구축

---

**마지막 업데이트**: 2025-12-20
