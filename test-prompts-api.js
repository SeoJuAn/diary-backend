/**
 * 프롬프트 API 테스트 스크립트
 * 
 * 사용법:
 * node test-prompts-api.js
 */

const API_BASE_URL = 'http://localhost:3000'; // Vercel dev server

async function testAPI(method, url, body = null) {
  const options = {
    method,
    headers: { 'Content-Type': 'application/json' },
  };

  if (body) {
    options.body = JSON.stringify(body);
  }

  try {
    const response = await fetch(`${API_BASE_URL}${url}`, options);
    const data = await response.json();
    
    console.log(`\n${method} ${url}`);
    console.log(`Status: ${response.status}`);
    console.log('Response:', JSON.stringify(data, null, 2));
    
    return { status: response.status, data };
  } catch (error) {
    console.error(`\n❌ Error testing ${method} ${url}:`, error.message);
    return { status: 0, error: error.message };
  }
}

async function runTests() {
  console.log('╔═══════════════════════════════════════════════════════════╗');
  console.log('║           프롬프트 API 테스트 시작                           ║');
  console.log('╚═══════════════════════════════════════════════════════════╝');

  let createdVersionId = null;

  // 테스트 1: 전체 버전 목록 조회
  console.log('\n📋 테스트 1: organize-diary 버전 목록 조회');
  await testAPI('GET', '/api/prompts/organize-diary/versions');

  // 테스트 2: 현재 활성 버전 조회
  console.log('\n🔍 테스트 2: organize-diary 현재 버전 조회');
  await testAPI('GET', '/api/prompts/organize-diary/current');

  // 테스트 3: 새 버전 생성
  console.log('\n📝 테스트 3: 새 버전 생성');
  const createResult = await testAPI('POST', '/api/prompts/organize-diary/versions', {
    name: '테스트 버전',
    prompt: '이것은 테스트용 프롬프트입니다.\n\n규칙:\n1. 테스트 모드입니다.\n2. 실제 사용하지 마세요.',
    description: 'API 테스트용으로 생성된 버전'
  });

  if (createResult.data?.version?.id) {
    createdVersionId = createResult.data.version.id;
    console.log(`✅ 생성된 버전 ID: ${createdVersionId}`);
  }

  // 테스트 4: 생성 후 버전 목록 재조회
  console.log('\n📋 테스트 4: 생성 후 버전 목록 재조회');
  await testAPI('GET', '/api/prompts/organize-diary/versions');

  // 테스트 5: 버전 전환 (생성된 버전으로)
  if (createdVersionId) {
    console.log('\n🔄 테스트 5: 새 버전으로 전환');
    await testAPI('PUT', '/api/prompts/organize-diary/current', {
      versionId: createdVersionId
    });

    // 테스트 6: 전환 후 현재 버전 확인
    console.log('\n🔍 테스트 6: 전환 후 현재 버전 확인');
    await testAPI('GET', '/api/prompts/organize-diary/current');
  }

  // 테스트 7: 현재 활성 버전 삭제 시도 (실패 예상)
  if (createdVersionId) {
    console.log('\n❌ 테스트 7: 현재 활성 버전 삭제 시도 (실패 예상)');
    await testAPI('DELETE', `/api/prompts/versions/${createdVersionId}`);
  }

  // 테스트 8: v0로 다시 전환
  console.log('\n🔄 테스트 8: v0로 다시 전환');
  const versionsResult = await testAPI('GET', '/api/prompts/organize-diary/versions');
  const v0 = versionsResult.data?.versions?.find(v => v.version === 'v0');
  
  if (v0) {
    await testAPI('PUT', '/api/prompts/organize-diary/current', {
      versionId: v0.id
    });
  }

  // 테스트 9: 테스트 버전 삭제
  if (createdVersionId) {
    console.log('\n🗑️  테스트 9: 테스트 버전 삭제');
    await testAPI('DELETE', `/api/prompts/versions/${createdVersionId}`);
  }

  // 테스트 10: 최종 상태 확인
  console.log('\n📊 테스트 10: 최종 상태 확인');
  await testAPI('GET', '/api/prompts/organize-diary/versions');

  // 테스트 11: 다른 엔드포인트 테스트
  console.log('\n🧪 테스트 11: 다른 엔드포인트 조회 (realtime)');
  await testAPI('GET', '/api/prompts/realtime/current');

  console.log('\n╔═══════════════════════════════════════════════════════════╗');
  console.log('║           프롬프트 API 테스트 완료!                          ║');
  console.log('╚═══════════════════════════════════════════════════════════╝');
}

// 테스트 실행
runTests().catch(error => {
  console.error('❌ Test suite failed:', error);
  process.exit(1);
});
