// Vercel 서버리스 함수 엔드포인트 URL (인증키를 숨긴 자체 API 경로)
const API_BASE_URL = '/api/dust';

// HTML 문서 내 주요 DOM 요소들을 변수로 참조
// 시도 선택 셀렉트 드롭다운 요소
const sidoSelect = document.getElementById('sidoSelect');
// 평균 수치 표시 영역의 지역명 텍스트 요소
const averageRegionText = document.getElementById('averageRegionText');
// 평균 미세먼지 수치(큰 글자) 표시 요소
const averageValue = document.getElementById('averageValue');
// 평균 미세먼지 단위 텍스트 요소
const averageUnit = document.getElementById('averageUnit');
// 평균 상태 설명 텍스트 요소
const averageStatus = document.getElementById('averageStatus');
// 차트 섹션 컨테이너 요소
const chartSection = document.getElementById('chartSection');
// 측정소 개수 표시 배지 요소
const stationCount = document.getElementById('stationCount');
// 로딩 및 에러 알림 메시지 표시 요소
const statusMessage = document.getElementById('statusMessage');
// 측정소 카드들이 배치될 그리드 컨테이너 요소
const cardsGrid = document.getElementById('cardsGrid');

// Chart.js 인스턴스를 저장하여 중복 렌더링 방지 및 갱신에 사용할 전역 변수
let dustChartInstance = null;

// 등급 번호('1', '2', '3', '4')에 매핑되는 등급 정보(클래스명, 한글 텍스트) 객체
const GRADE_MAP = {
  // 1: 좋음 (파랑 계열)
  '1': { className: 'grade-1', badgeClass: 'badge-1', label: '좋음' },
  // 2: 보통 (초록 계열)
  '2': { className: 'grade-2', badgeClass: 'badge-2', label: '보통' },
  // 3: 나쁨 (주황 계열)
  '3': { className: 'grade-3', badgeClass: 'badge-3', label: '나쁨' },
  // 4: 매우나쁨 (빨강 계열)
  '4': { className: 'grade-4', badgeClass: 'badge-4', label: '매우나쁨' }
};

// 차트 막대 색상에 직접 사용되는 등급별 16진수 색상 코드 객체 (카드 색상과 동일)
const GRADE_HEX_COLORS = {
  // 1등급: 파랑 (좋음)
  '1': '#2563eb',
  // 2등급: 초록 (보통)
  '2': '#16a34a',
  // 3등급: 주황 (나쁨)
  '3': '#ea580c',
  // 4등급: 빨강 (매우나쁨)
  '4': '#dc2626',
  // 등급 없음/빈값: 회색
  'empty': '#94a3b8'
};

// 미세먼지 등급 정보를 반환하는 헬퍼 함수 (등급 값이 없거나 비어있는 경우 회색 처리)
function getGradeInfo(gradeValue) {
  // 등급 값이 1~4 중 하나로 유효한지 확인
  if (gradeValue && GRADE_MAP[gradeValue]) {
    // 유효한 등급 정보 반환
    return GRADE_MAP[gradeValue];
  }
  // 등급 값이 비어있거나 유효하지 않을 경우 기본 회색 카드 스타일 정보 반환
  return { className: 'grade-empty', badgeClass: 'badge-empty', label: '정보 없음' };
}

// 미세먼지 및 초미세먼지 측정값의 표시 형식 및 유효성을 처리하는 함수
function parseDustValue(value) {
  // 값이 없거나 null, undefined, 혹은 '-' 기호로 온 경우
  if (!value || value === '-' || value.trim() === '') {
    // 측정 안 됨 상태와 텍스트를 반환
    return { isValid: false, text: '측정 안 됨', number: null };
  }
  // 문자열을 숫자로 변환
  const num = Number(value);
  // 숫자로 변환할 수 없는 유효하지 않은 값인 경우
  if (isNaN(num)) {
    // 측정 안 됨 상태와 텍스트를 반환
    return { isValid: false, text: '측정 안 됨', number: null };
  }
  // 정상적인 수치인 경우 단위(㎍/㎥)와 함께 반환
  return { isValid: true, text: `${num} ㎍/㎥`, number: num };
}

// 화면에 로딩 인디케이터나 에러 안내 문구를 표시하는 함수
function showStatus(message, isError = false) {
  // 메시지 박스 내부 텍스트 지정
  statusMessage.textContent = message;
  // 에러 여부에 따라 텍스트 색상 구분
  statusMessage.style.color = isError ? '#dc2626' : '#4b5563';
  // 상태 메시지 박스를 화면에 표시
  statusMessage.style.display = 'block';
}

// 화면의 로딩 및 안내 메시지 박스를 숨기는 함수
function hideStatus() {
  // 상태 메시지 박스를 숨김 처리
  statusMessage.style.display = 'none';
}

// 상위 10개 측정소 미세먼지 수치를 가로 막대그래프로 시각화하는 함수
function renderChart(items) {
  // 캔버스 렌더링 컨텍스트 획득
  const canvas = document.getElementById('dustChart');
  // 캔버스 요소가 없는 경우 실행 중단
  if (!canvas) return;
  const ctx = canvas.getContext('2d');

  // '측정 안 됨'(-)을 제외하고 유효한 숫자 측정값을 가진 측정소만 필터링
  const validItems = items
    .map(item => {
      // 미세먼지 수치 파싱
      const parsed = parseDustValue(item.pm10Value);
      return {
        // 측정소 이름
        stationName: item.stationName || '측정소명 없음',
        // 미세먼지 숫자 수치
        pm10Value: parsed.number,
        // 등급 정보
        pm10Grade: item.pm10Grade,
        // 유효성 여부
        isValid: parsed.isValid
      };
    })
    // 유효한 측정소만 남김 ('측정 안 됨' 제외)
    .filter(item => item.isValid);

  // 유효한 측정소가 1개도 없는 경우 차트 영역 숨김 처리
  if (validItems.length === 0) {
    // 차트 컨테이너 감추기
    chartSection.style.display = 'none';
    // 기존 차트가 있다면 파괴
    if (dustChartInstance) {
      dustChartInstance.destroy();
      dustChartInstance = null;
    }
    return;
  }

  // 차트 컨테이너 보이기
  chartSection.style.display = 'flex';

  // 미세먼지 수치가 높은 순(내림차순)으로 정렬
  validItems.sort((a, b) => b.pm10Value - a.pm10Value);

  // 상위 최대 10개 측정소 추출
  const top10 = validItems.slice(0, 10);

  // 차트 X축 레이블 (측정소 이름 배열)
  const chartLabels = top10.map(item => item.stationName);
  // 차트 데이터 수치 (미세먼지 수치 배열)
  const chartData = top10.map(item => item.pm10Value);
  // 카드와 동일한 등급별 막대 색상 매핑 배열
  const chartColors = top10.map(item => GRADE_HEX_COLORS[item.pm10Grade] || GRADE_HEX_COLORS.empty);

  // 이전 차트 인스턴스가 존재할 경우 파괴하여 캔버스 재사용 오류 방지
  if (dustChartInstance) {
    dustChartInstance.destroy();
  }

  // Chart.js 가로 막대그래프 인스턴스 생성
  dustChartInstance = new Chart(ctx, {
    // 막대그래프 타입 지정
    type: 'bar',
    data: {
      // 측정소 라벨
      labels: chartLabels,
      datasets: [{
        // 범례 제목
        label: '미세먼지 (PM10)',
        // 수치 데이터
        data: chartData,
        // 등급 색상과 일치하는 막대 배경색
        backgroundColor: chartColors,
        // 막대 모서리 둥글기 설정
        borderRadius: 6,
        // 막대 두께 비율
        barPercentage: 0.68
      }]
    },
    options: {
      // 가로 막대그래프로 설정 (X축과 Y축 반전)
      indexAxis: 'y',
      // 반응형 크기 조절 활성화
      responsive: true,
      // 래퍼 컨테이너 높이에 맞추기 위해 고정 종횡비 해제
      maintainAspectRatio: false,
      plugins: {
        // 단일 데이터셋이므로 상단 기본 범례 숨김
        legend: {
          display: false
        },
        // 툴팁에 단위(㎍/㎥) 표시
        tooltip: {
          callbacks: {
            label: function (context) {
              return ` 미세먼지: ${context.raw} ㎍/㎥`;
            }
          }
        }
      },
      scales: {
        // X축 (미세먼지 수치 축)
        x: {
          // 0부터 시작하도록 설정
          beginAtZero: true,
          // 격자선 색상
          grid: {
            color: '#e5e7eb'
          },
          // 축 타이틀
          title: {
            display: true,
            text: '미세먼지 농도 (㎍/㎥)',
            font: { size: 12, weight: 'bold' }
          }
        },
        // Y축 (측정소 이름 축)
        y: {
          // Y축 격자선 숨김
          grid: {
            display: false
          },
          // 측정소 이름 폰트 스타일
          ticks: {
            font: { size: 13, weight: '600' },
            color: '#1f2937'
          }
        }
      }
    }
  });
}

// 내부 서버리스 API(/api/dust)를 호출하여 실시간 대기질 데이터를 가져오는 비동기 함수
async function fetchAirQualityData(sidoName) {
  // 이전에 렌더링된 카드 목록 초기화
  cardsGrid.innerHTML = '';
  // 상단 지역 평균 안내 문구 갱신
  averageRegionText.textContent = `${sidoName} 지역 평균 미세먼지`;
  // 상단 평균 숫자 임시 리셋
  averageValue.textContent = '-';
  // 평균 상태 안내 문구 리셋
  averageStatus.textContent = '데이터를 불러오는 중입니다...';
  // 총 측정소 수 리셋
  stationCount.textContent = '총 0개 측정소';

  // 데이터 로딩 중 알림 표시
  showStatus(`[${sidoName}] 실시간 대기질 데이터를 불러오는 중입니다...`);

  try {
    // /api/dust?sido=시도이름 형식으로 내부 서버리스 API 주소 구성
    const requestUrl = `${API_BASE_URL}?sido=${encodeURIComponent(sidoName)}`;

    // fetch API를 사용해 내부 서버리스 함수에 비동기 GET 요청 전송
    const response = await fetch(requestUrl);

    // 응답 데이터 JSON 파싱
    const data = await response.json();

    // 서버리스 함수에서 에러 상태코드(4xx, 5xx)로 응답한 경우 처리
    if (!response.ok) {
      // 서버에서 전달한 한국어 에러 메시지 표출
      throw new Error(data.message || `서버 응답 오류 (상태 코드: ${response.status})`);
    }

    // API 응답 구조 검증 (response.body.items 존재 여부 확인)
    const items = data?.response?.body?.items;

    // 측정소 데이터 목록이 없거나 비어있는 경우 처리
    if (!items || !Array.isArray(items) || items.length === 0) {
      // 측정 데이터가 없다는 메시지 표시
      showStatus(`[${sidoName}] 지역의 실시간 측정소 데이터가 없습니다.`);
      // 평균 상태 텍스트 갱신
      averageStatus.textContent = '조회된 데이터가 없습니다.';
      // 차트 영역 숨김
      chartSection.style.display = 'none';
      // 함수 실행 종료
      return;
    }

    // 정상적으로 데이터를 불러온 경우 상태 메시지 숨김
    hideStatus();

    // 가져온 측정소 데이터 목록을 화면에 렌더링 (카드 및 차트)
    renderAirQuality(sidoName, items);

  } catch (error) {
    // 콘솔에 상세 오류 로그 출력
    console.error('대기오염 데이터 조회 중 오류 발생:', error);
    // 화면에 서버가 보낸 한국어 에러 안내 메시지 출력
    showStatus(`${error.message}`, true);
    // 평균 상태 텍스트 갱신
    averageStatus.textContent = '데이터 조회 실패';
    // 차트 영역 숨김
    chartSection.style.display = 'none';
  }
}

// 측정소 목록 데이터 및 평균값을 계산하여 화면에 렌더링하는 함수
function renderAirQuality(sidoName, items) {
  // 조회된 총 측정소 개수 화면에 표시
  stationCount.textContent = `총 ${items.length}개 측정소`;

  // 유효한 미세먼지(PM10) 측정 수치의 누적 합계 변수
  let validPm10Sum = 0;
  // 평균 계산에 포함된 유효한 측정소의 개수 카운터
  let validPm10Count = 0;

  // DocumentFragment를 생성하여 일괄 DOM 추가로 렌더링 성능 최적화
  const fragment = document.createDocumentFragment();

  // 각 측정소 데이터를 반복하며 카드 요소 생성
  items.forEach((item) => {
    // 측정소 이름 추출 (없으면 '알 수 없음')
    const stationName = item.stationName || '측정소명 없음';
    // 측정 일시 추출 (없으면 '시간 정보 없음')
    const dataTime = item.dataTime || '시간 정보 없음';

    // 미세먼지(PM10) 수치 파싱 및 유효성 검사
    const pm10Parsed = parseDustValue(item.pm10Value);
    // 초미세먼지(PM2.5) 수치 파싱 및 유효성 검사
    const pm25Parsed = parseDustValue(item.pm25Value);

    // 미세먼지 수치가 정상 숫자이고 유효한 경우에만 평균 합산에 반영
    if (pm10Parsed.isValid) {
      // 미세먼지 수치를 총합에 누적
      validPm10Sum += pm10Parsed.number;
      // 유효한 측정소 개수 1 증가
      validPm10Count += 1;
    }

    // 미세먼지 등급 정보 확인 (값이 비어있으면 자동으로 회색 카드 스타일 적용)
    const gradeInfo = getGradeInfo(item.pm10Grade);

    // 카드 컨테이너 div 요소 생성
    const card = document.createElement('div');
    // 기본 카드 클래스와 등급별 색상 클래스 추가 (좋음: grade-1, 보통: grade-2, 나쁨: grade-3, 매우나쁨: grade-4, 비어있음: grade-empty)
    card.className = `station-card ${gradeInfo.className}`;

    // 카드 내부 HTML 구조 동적 생성
    card.innerHTML = `
      <!-- 측정소 이름 및 등급 뱃지 헤더 -->
      <div class="card-header">
        <h4 class="station-name">${stationName}</h4>
        <span class="grade-badge ${gradeInfo.badgeClass}">${gradeInfo.label}</span>
      </div>
      <!-- 미세먼지 및 초미세먼지 수치 본문 -->
      <div class="card-body">
        <div class="value-row">
          <span class="value-label">미세먼지 (PM10)</span>
          <span class="value-data ${!pm10Parsed.isValid ? 'not-measured' : ''}">${pm10Parsed.text}</span>
        </div>
        <div class="value-row">
          <span class="value-label">초미세먼지 (PM2.5)</span>
          <span class="value-data ${!pm25Parsed.isValid ? 'not-measured' : ''}">${pm25Parsed.text}</span>
        </div>
      </div>
      <!-- 측정 기준 시각 푸터 -->
      <div class="card-footer">
        <span class="data-time">측정: ${dataTime}</span>
      </div>
    `;

    // 생성된 카드를 fragment에 추가
    fragment.appendChild(card);
  });

  // 최종 조립된 카드 목록을 한 번에 그리드 컨테이너에 삽입
  cardsGrid.appendChild(fragment);

  // 상위 10개 측정소 가로 막대그래프 렌더링 호출
  renderChart(items);

  // 상단 대형 평균 수치 계산 및 렌더링
  if (validPm10Count > 0) {
    // 유효한 측정값들의 평균 계산 후 소수점 첫째 자리까지 반올림
    const average = (validPm10Sum / validPm10Count).toFixed(1);
    // 큰 글씨로 평균 미세먼지 수치 반영
    averageValue.textContent = average;
    // 단위 정상 표시
    averageUnit.style.display = 'inline';

    // 평균 수치 기반으로 대략적인 등급 상태 텍스트 안내 생성
    let statusText = '';
    const avgNum = Number(average);
    if (avgNum <= 30) {
      statusText = '전반적으로 공기가 [좋음] 수준입니다. 😊';
    } else if (avgNum <= 80) {
      statusText = '전반적으로 공기가 [보통] 수준입니다. 🌿';
    } else if (avgNum <= 150) {
      statusText = '공기가 [나쁨] 수준입니다. 마스크를 챙기세요! 😷';
    } else {
      statusText = '공기가 [매우 나쁨] 수준입니다. 외출을 자제하세요! 🚨';
    }

    // 평균 상태 설명 텍스트 반영 (유효 측정소 수 포함)
    averageStatus.textContent = `${statusText} (유효 측정소 ${validPm10Count}곳 기준)`;

  } else {
    // 모든 측정소의 값이 '-' 이거나 유효한 수치가 하나도 없는 경우
    averageValue.textContent = '측정 안 됨';
    // 단위 텍스트 숨김
    averageUnit.style.display = 'none';
    // 안내 텍스트 갱신
    averageStatus.textContent = '유효한 미세먼지 측정 데이터가 없어 평균을 산출할 수 없습니다.';
  }
}

// 시도 선택 드롭다운 메뉴 변경 시 이벤트 리스너 등록
sidoSelect.addEventListener('change', (event) => {
  // 선택된 시도명 가져오기
  const selectedSido = event.target.value;
  // 선택된 시도의 대기질 데이터 요청 실행
  fetchAirQualityData(selectedSido);
});

// 웹 페이지의 DOM 요소가 모두 준비되었을 때 초기 실행
document.addEventListener('DOMContentLoaded', () => {
  // 드롭다운에 기본으로 선택되어 있는 시도('서울') 데이터 자동 조회 (/api/dust?sido=서울 호출)
  fetchAirQualityData(sidoSelect.value);
});
