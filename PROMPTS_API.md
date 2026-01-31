# 🎯 Prompts API 문서

프롬프트 버전 관리 API

---

## 📋 **API 엔드포인트 목록**

### 1. **GET `/api/prompts/[endpoint]/versions`**
특정 엔드포인트의 모든 프롬프트 버전 조회

#### Request
```
GET /api/prompts/organize-diary/versions
```

#### Response (200 OK)
```json
{
  "success": true,
  "endpoint": "organize-diary",
  "currentVersion": "v0",
  "totalVersions": 2,
  "versions": [
    {
      "id": "uuid",
      "endpoint": "organize-diary",
      "version": "v0",
      "name": "Default",
      "prompt": "당신은 친근하고 따뜻한...",
      "isDefault": true,
      "isDeletable": false,
      "isCurrent": true,
      "description": null,
      "createdAt": "2026-01-31T12:00:00Z",
      "updatedAt": "2026-01-31T12:00:00Z"
    }
  ]
}
```

---

### 2. **GET `/api/prompts/[endpoint]/current`**
특정 엔드포인트의 현재 활성 프롬프트 조회

#### Request
```
GET /api/prompts/organize-diary/current
```

#### Response (200 OK)
```json
{
  "success": true,
  "endpoint": "organize-diary",
  "version": "v0",
  "prompt": "당신은 친근하고 따뜻한 일기 작성 도우미입니다...",
  "name": "Default",
  "isDefault": true,
  "createdAt": "2026-01-31T12:00:00Z"
}
```

---

### 3. **POST `/api/prompts/[endpoint]/create`**
새 프롬프트 버전 생성

#### Request
```
POST /api/prompts/organize-diary/create
Content-Type: application/json

{
  "name": "감정 강조 버전",
  "prompt": "당신은 따뜻하고 공감적인 일기 작성 도우미입니다...",
  "description": "사용자의 감정에 더욱 집중한 버전"
}
```

#### Response (201 Created)
```json
{
  "success": true,
  "message": "Prompt version created successfully",
  "version": {
    "id": "uuid",
    "endpoint": "organize-diary",
    "version": "v1",
    "name": "감정 강조 버전",
    "prompt": "당신은 따뜻하고 공감적인...",
    "description": "사용자의 감정에 더욱 집중한 버전",
    "isDefault": false,
    "isDeletable": true,
    "isCurrent": false,
    "createdAt": "2026-01-31T13:00:00Z"
  }
}
```

---

### 4. **PUT `/api/prompts/[endpoint]/switch`**
현재 활성 프롬프트 버전 전환

#### Request
```
PUT /api/prompts/organize-diary/switch
Content-Type: application/json

{
  "versionId": "uuid-of-target-version"
}
```

#### Response (200 OK)
```json
{
  "success": true,
  "message": "Current version switched to v1",
  "currentVersion": {
    "id": "uuid",
    "endpoint": "organize-diary",
    "version": "v1",
    "name": "감정 강조 버전",
    "isCurrent": true,
    "updatedAt": "2026-01-31T14:00:00Z"
  }
}
```

---

### 5. **DELETE `/api/prompts/versions/[id]`**
프롬프트 버전 삭제

#### Request
```
DELETE /api/prompts/versions/uuid-of-version
```

#### Response (200 OK)
```json
{
  "success": true,
  "message": "Version v1 deleted successfully",
  "deletedVersion": {
    "id": "uuid",
    "endpoint": "organize-diary",
    "version": "v1",
    "name": "감정 강조 버전"
  }
}
```

#### Error Response (403 Forbidden)
```json
{
  "success": false,
  "error": "Cannot delete default version (v0)"
}
```

```json
{
  "success": false,
  "error": "Cannot delete currently active version. Switch to another version first."
}
```

---

## 🎯 **유효한 엔드포인트**

- `organize-diary` - 일기 정리 시스템 프롬프트
- `context-extract` - 컨텍스트 추출 프롬프트
- `tts` - TTS 음성 지시사항
- `realtime` - Realtime API 시스템 인스트럭션

---

## 🔒 **제약 조건**

1. **Default 버전 (v0)**
   - 삭제 불가 (`is_deletable = false`)
   - 각 엔드포인트당 1개씩 존재

2. **현재 활성 버전**
   - 삭제 불가 (다른 버전으로 전환 후 삭제 가능)
   - 각 엔드포인트당 1개만 `is_current = true`

3. **버전 번호**
   - 자동 증가 (v0, v1, v2, ...)
   - 수동 지정 불가

---

## 📝 **사용 예제**

### 새 버전 생성 → 전환 → 삭제 플로우

```bash
# 1. 새 버전 생성
curl -X POST http://localhost:3000/api/prompts/organize-diary/create \
  -H "Content-Type: application/json" \
  -d '{
    "name": "테스트 버전",
    "prompt": "테스트용 프롬프트입니다.",
    "description": "테스트"
  }'

# Response에서 version.id 확인 → uuid-v1

# 2. 생성된 버전으로 전환
curl -X PUT http://localhost:3000/api/prompts/organize-diary/switch \
  -H "Content-Type: application/json" \
  -d '{
    "versionId": "uuid-v1"
  }'

# 3. v0로 다시 전환 (uuid-v0는 v0의 ID)
curl -X PUT http://localhost:3000/api/prompts/organize-diary/switch \
  -H "Content-Type: application/json" \
  -d '{
    "versionId": "uuid-v0"
  }'

# 4. 테스트 버전 삭제
curl -X DELETE http://localhost:3000/api/prompts/versions/uuid-v1
```

---

## 🔧 **기술 스택**

- **Database**: PostgreSQL (diary.prompt_versions 테이블)
- **Framework**: Vercel Serverless Functions
- **Language**: Node.js (ES Modules)
- **DB Client**: pg (node-postgres)

---

## 📊 **데이터베이스 스키마**

```sql
CREATE TABLE diary.prompt_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  endpoint VARCHAR(50) NOT NULL,
  version VARCHAR(20) NOT NULL,
  name VARCHAR(100) NOT NULL,
  prompt TEXT NOT NULL,
  is_default BOOLEAN DEFAULT FALSE,
  is_deletable BOOLEAN DEFAULT TRUE,
  is_current BOOLEAN DEFAULT FALSE,
  description TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT unique_endpoint_version UNIQUE (endpoint, version)
);
```

---

## 🚀 **다음 단계**

1. **프론트엔드 통합**: prompt-playground.html에서 LocalStorage 대신 API 사용
2. **인증 추가**: 사용자별 프롬프트 관리
3. **버전 비교**: 두 버전의 diff 표시
4. **A/B 테스트**: 프롬프트 성능 비교
