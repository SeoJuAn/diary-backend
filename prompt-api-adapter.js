// ============================================
// API 호출 헬퍼 함수들
// ============================================

// 버전 목록 조회
async function fetchPromptVersions(endpoint) {
    try {
        const response = await fetch(`${API_BASE_URL}/api/prompts/${endpoint}/versions`);
        const data = await response.json();
        return data;
    } catch (error) {
        console.error('Error fetching versions:', error);
        throw error;
    }
}

// 현재 버전 조회
async function fetchCurrentPrompt(endpoint) {
    try {
        const response = await fetch(`${API_BASE_URL}/api/prompts/${endpoint}/current`);
        const data = await response.json();
        return data;
    } catch (error) {
        console.error('Error fetching current prompt:', error);
        throw error;
    }
}

// 새 버전 생성
async function createPromptVersion(endpoint, name, prompt, description) {
    try {
        const response = await fetch(`${API_BASE_URL}/api/prompts/${endpoint}/create`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name, prompt, description })
        });
        const data = await response.json();
        return data;
    } catch (error) {
        console.error('Error creating version:', error);
        throw error;
    }
}

// 버전 전환
async function switchPromptVersion(endpoint, versionId) {
    try {
        const response = await fetch(`${API_BASE_URL}/api/prompts/${endpoint}/switch`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ versionId })
        });
        const data = await response.json();
        return data;
    } catch (error) {
        console.error('Error switching version:', error);
        throw error;
    }
}

// 버전 삭제
async function deletePromptVersion(versionId) {
    try {
        const response = await fetch(`${API_BASE_URL}/api/prompts/versions/${versionId}`, {
            method: 'DELETE'
        });
        const data = await response.json();
        return data;
    } catch (error) {
        console.error('Error deleting version:', error);
        throw error;
    }
}

// ============================================
// 수정된 버전 관리 함수들 (API 기반)
// ============================================

// 버전 목록 가져오기 (캐시 포함)
const versionCache = {};

async function getVersions(endpoint) {
    try {
        const data = await fetchPromptVersions(endpoint);
        versionCache[endpoint] = data;
        return data.versions || [];
    } catch (error) {
        console.error('Failed to fetch versions:', error);
        return [];
    }
}

// 현재 버전 데이터 가져오기
async function getCurrentVersionData(endpoint) {
    try {
        const data = await fetchCurrentPrompt(endpoint);
        return {
            id: data.id || null,
            version: data.version,
            name: data.name,
            prompt: data.prompt,
            isDefault: data.isDefault,
            isDeletable: !data.isDefault,
            createdAt: data.createdAt
        };
    } catch (error) {
        console.error('Failed to fetch current version:', error);
        return null;
    }
}

// 새 버전 저장 (API 기반)
async function saveAsNewVersion(endpoint) {
    const currentPrompt = getPromptFromEditor(endpoint);
    
    if (!currentPrompt || currentPrompt.trim() === '') {
        alert('❌ 프롬프트를 입력해주세요.');
        return;
    }
    
    const versionName = prompt('버전 이름을 입력하세요:', `수정 버전 ${new Date().toLocaleString('ko-KR')}`);
    
    if (!versionName) {
        return; // 취소
    }
    
    try {
        const result = await createPromptVersion(endpoint, versionName, currentPrompt, '사용자 생성 버전');
        
        if (result.success) {
            alert(`✅ ${result.version.version} 버전으로 저장되었습니다!`);
            
            // 생성된 버전으로 자동 전환
            await switchPromptVersion(endpoint, result.version.id);
            
            // UI 업데이트
            await refreshVersionUI(endpoint);
        } else {
            alert(`❌ 저장 실패: ${result.error}`);
        }
    } catch (error) {
        alert(`❌ 저장 중 오류 발생: ${error.message}`);
    }
}

// 버전 전환 (API 기반)
async function switchToVersion(endpoint, versionId) {
    try {
        // 현재 편집 중인 내용 확인
        const currentPrompt = getPromptFromEditor(endpoint);
        const currentVersionData = await getCurrentVersionData(endpoint);
        
        if (currentVersionData && currentPrompt !== currentVersionData.prompt) {
            if (!confirm('현재 편집 중인 내용이 저장되지 않았습니다. 계속하시겠습니까?')) {
                return;
            }
        }
        
        const result = await switchPromptVersion(endpoint, versionId);
        
        if (result.success) {
            alert(`✅ ${result.currentVersion.version} 버전으로 전환되었습니다!`);
            
            // UI 업데이트
            await refreshVersionUI(endpoint);
        } else {
            alert(`❌ 전환 실패: ${result.error}`);
        }
    } catch (error) {
        alert(`❌ 전환 중 오류 발생: ${error.message}`);
    }
}

// 버전 삭제 (API 기반)
async function deleteVersion(endpoint, versionId) {
    if (!confirm(`정말 이 버전을 삭제하시겠습니까?`)) {
        return;
    }
    
    try {
        const result = await deletePromptVersion(versionId);
        
        if (result.success) {
            alert(`✅ 버전이 삭제되었습니다!`);
            
            // UI 업데이트
            await refreshVersionUI(endpoint);
        } else {
            alert(`❌ 삭제 실패: ${result.error}`);
        }
    } catch (error) {
        alert(`❌ 삭제 중 오류 발생: ${error.message}`);
    }
}

// Default 버전으로 되돌리기 (API 기반)
async function resetToDefault(endpoint) {
    if (!confirm('정말 Default 버전으로 되돌리시겠습니까?')) {
        return;
    }
    
    try {
        const versions = await getVersions(endpoint);
        const defaultVersion = versions.find(v => v.isDefault);
        
        if (!defaultVersion) {
            alert('❌ Default 버전을 찾을 수 없습니다.');
            return;
        }
        
        const result = await switchPromptVersion(endpoint, defaultVersion.id);
        
        if (result.success) {
            alert('✅ Default 버전으로 되돌렸습니다!');
            
            // UI 업데이트
            await refreshVersionUI(endpoint);
        }
    } catch (error) {
        alert(`❌ 오류 발생: ${error.message}`);
    }
}

// UI 전체 새로고침
async function refreshVersionUI(endpoint) {
    try {
        // 현재 버전 데이터 가져오기
        const currentVersion = await getCurrentVersionData(endpoint);
        
        if (currentVersion) {
            // 프롬프트 에디터에 표시
            displayPrompt(endpoint, currentVersion);
            
            // 버전 헤더 업데이트
            updateVersionHeader(endpoint, currentVersion);
        }
        
        // 버전 히스토리 렌더링
        await renderVersionHistory(endpoint);
        
    } catch (error) {
        console.error('Failed to refresh UI:', error);
    }
}

// 버전 히스토리 렌더링 (API 기반)
async function renderVersionHistory(endpoint) {
    const historyId = `${getShortEndpoint(endpoint)}-version-history`;
    const history = document.getElementById(historyId);
    if (!history) return;
    
    try {
        const versions = await getVersions(endpoint);
        const currentVersionData = await getCurrentVersionData(endpoint);
        const currentVersion = currentVersionData?.version;
        
        let html = '<h4>📜 버전 히스토리</h4>';
        
        // 최신 버전부터 표시 (역순)
        for (let i = versions.length - 1; i >= 0; i--) {
            const v = versions[i];
            const isCurrent = v.version === currentVersion;
            const itemClass = isCurrent ? 'version-item current' : 'version-item';
            
            html += `<div class="${itemClass}">`;
            html += `<div class="version-item-header">`;
            html += `<strong>${v.version}</strong> - ${v.name}`;
            if (isCurrent) html += ` <span class="badge-current">현재</span>`;
            if (v.isDefault) html += ` <span class="badge-default">Default</span>`;
            html += `</div>`;
            html += `<div class="version-item-meta">`;
            html += `생성일: ${new Date(v.createdAt).toLocaleString('ko-KR')}`;
            html += `</div>`;
            html += `<div class="version-item-actions">`;
            
            if (!isCurrent) {
                html += `<button class="btn-small" onclick="switchToVersion('${endpoint}', '${v.id}')">🔄 전환</button>`;
            }
            
            if (v.isDeletable && !isCurrent) {
                html += `<button class="btn-small" onclick="deleteVersion('${endpoint}', '${v.id}')" style="background: #dc3545;">🗑️ 삭제</button>`;
            }
            
            html += `</div>`;
            html += `</div>`;
        }
        
        history.innerHTML = html;
    } catch (error) {
        history.innerHTML = '<p style="color: red;">버전 히스토리를 불러오는데 실패했습니다.</p>';
        console.error('Failed to render version history:', error);
    }
}

// 버전 헤더 업데이트
function updateVersionHeader(endpoint, versionData) {
    if (!versionData) return;
    
    const badge = document.getElementById(`${getShortEndpoint(endpoint)}-version-badge`);
    const name = document.getElementById(`${getShortEndpoint(endpoint)}-version-name`);
    const date = document.getElementById(`${getShortEndpoint(endpoint)}-version-date`);
    
    if (badge) {
        badge.textContent = versionData.version;
        badge.className = versionData.isDefault ? 'version-badge default' : 'version-badge';
    }
    if (name) name.textContent = versionData.name;
    if (date && !versionData.isDefault) {
        date.textContent = new Date(versionData.createdAt).toLocaleString('ko-KR');
    }
}

// 페이지 로드 시 초기화
async function initializePrompts() {
    const endpoints = ['organize-diary', 'context-extract', 'tts', 'realtime'];
    
    for (const endpoint of endpoints) {
        try {
            await refreshVersionUI(endpoint);
        } catch (error) {
            console.error(`Failed to initialize ${endpoint}:`, error);
        }
    }
}

// 페이지 로드 시 자동 실행
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initializePrompts);
} else {
    initializePrompts();
}
