import { Vector2 } from './physics/Vector2.js';
import { CelestialBody } from './physics/CelestialBody.js';
import { GravityEngine } from './physics/GravityEngine.js';
import { Camera } from './render/Camera.js';
import { CanvasRenderer } from './render/CanvasRenderer.js';

// --- 앱 초기화 ---
const canvas = document.getElementById('simCanvas');
const engine = new GravityEngine();
const camera = new Camera(canvas);
const renderer = new CanvasRenderer(canvas, camera);

// 천체 충돌 및 합체 이벤트 리스너
engine.onCollision = (dominant, absorbed) => {
  lastBodyListHash = ''; // 드롭다운 동기화 트리거
  if (selectedBodyId === absorbed.id) {
    selectedBodyId = dominant.id;
  }
  updateInspector();
  showToast(`💥 충돌 발생! '${absorbed.name}'이(가) '${dominant.name}'에 흡수 합체되었습니다.`);
};

// UI 요소 셀렉터
const universeClockEl = document.getElementById('universeClock');
const timeScaleSlider = document.getElementById('timeScaleSlider');
const timeScaleText = document.getElementById('timeScaleText');
const btnPlayPause = document.getElementById('btnPlayPause');
const playIcon = document.getElementById('playIcon');
const playText = document.getElementById('playText');
const btnStep = document.getElementById('btnStep');
const btnReset = document.getElementById('btnReset');
const chkCollision = document.getElementById('chkCollision');
const toastEl = document.getElementById('toast');
const bodyCountBadge = document.getElementById('bodyCountBadge');

// 물리 메트릭 디스플레이
const valDistance = document.getElementById('valDistance');
const valForce = document.getElementById('valForce');
const valV1 = document.getElementById('valV1');
const valV2 = document.getElementById('valV2');
const labelV1 = document.getElementById('labelV1');
const labelV2 = document.getElementById('labelV2');
const valEnergy = document.getElementById('valEnergy');
const selectBodyA = document.getElementById('selectBodyA');
const selectBodyB = document.getElementById('selectBodyB');

// 툴바 버튼
const toolSpawn = document.getElementById('toolSpawn');
const toolPrecision = document.getElementById('toolPrecision');
const toolPan = document.getElementById('toolPan');
const btnFit = document.getElementById('btnFit');
const toggleTrails = document.getElementById('toggleTrails');
const toggleGravity = document.getElementById('toggleGravity');
const toggleVelocity = document.getElementById('toggleVelocity');
const toggleCOM = document.getElementById('toggleCOM');

// 모달 요소
const precisionModal = document.getElementById('precisionModal');
const btnModalCancel = document.getElementById('btnModalCancel');
const btnModalCreate = document.getElementById('btnModalCreate');

// 인터랙션 상태
let currentTool = 'spawn'; // 'spawn' | 'pan'
let isDragging = false;
let isRightDragging = false;
let dragStartPos = { x: 0, y: 0 };
let dragCurrentPos = { x: 0, y: 0 };
let selectedBodyId = null;

// 토스트 메시지 함수
function showToast(msg, duration = 3000) {
  toastEl.textContent = msg;
  toastEl.classList.add('visible');
  clearTimeout(toastEl._timer);
  toastEl._timer = setTimeout(() => {
    toastEl.classList.remove('visible');
  }, duration);
}

// 캔버스 크기 리사이징
function resizeCanvas() {
  const dpr = window.devicePixelRatio || 1;
  const width = window.innerWidth;
  const height = window.innerHeight;
  canvas.width = Math.floor(width * dpr);
  canvas.height = Math.floor(height * dpr);
  canvas.style.width = `${width}px`;
  canvas.style.height = `${height}px`;
  renderer.dpr = dpr;
}
window.addEventListener('resize', resizeCanvas);
resizeCanvas();

// --- 등간격 시간 배속 스텝 정의 ---
const YEAR_SEC = 31536000; // 365일 (초)
const TIME_STEPS = [
  { index: 0, label: '1초', seconds: 1, text: '1초 = 1.0초 (실시간 1배)' },
  { index: 1, label: '1일', seconds: 86400, text: '1초 = 1.0일 (86,400배)' },
  { index: 2, label: '1달', seconds: 86400 * 30, text: '1초 = 1.0달 (2.59 × 10⁶배)' },
  { index: 3, label: '1년', seconds: YEAR_SEC, text: '1초 = 1.0년 (3.15 × 10⁷배)' },
  { index: 4, label: '10년', seconds: YEAR_SEC * 10, text: '1초 = 10년 (3.15 × 10⁸배)' },
  { index: 5, label: '10²년', seconds: YEAR_SEC * 100, text: '1초 = 10²년 (100년, 3.15 × 10⁹배)' },
  { index: 6, label: '10³년', seconds: YEAR_SEC * 1000, text: '1초 = 10³년 (1,000년, 3.15 × 10¹⁰배)' },
  { index: 7, label: '10⁴년', seconds: YEAR_SEC * 10000, text: '1초 = 10⁴년 (10,000년, 3.15 × 10¹¹배)' },
  { index: 8, label: '1광년', seconds: YEAR_SEC * 100000, text: '1초 = 1광년 (10만년, 3.15 × 10¹²배)' },
];

function setTimeStep(stepIndex) {
  const idx = Math.max(0, Math.min(TIME_STEPS.length - 1, parseInt(stepIndex, 10)));
  const step = TIME_STEPS[idx];

  timeScaleSlider.value = idx;
  engine.timeScale = step.seconds;
  timeScaleText.textContent = step.text;

  // 슬라이더 눈금 라벨 활성화 동기화
  const tickLabels = document.querySelectorAll('#sliderTicksLabels span');
  tickLabels.forEach((el, i) => {
    el.classList.toggle('active', i === idx);
  });

  // 하단 칩 프리셋 활성화 동기화
  document.querySelectorAll('.chip-btn[data-step]').forEach(btn => {
    const s = parseInt(btn.dataset.step, 10);
    btn.classList.toggle('active', s === idx);
  });
}

timeScaleSlider.addEventListener('input', (e) => {
  setTimeStep(e.target.value);
});

// 눈금 텍스트 직접 클릭 시 해당 배속으로 스냅
document.querySelectorAll('#sliderTicksLabels span').forEach(span => {
  span.addEventListener('click', () => {
    setTimeStep(span.dataset.index);
  });
});

// 하단 칩 프리셋 클릭 시 해당 스텝으로 스냅
document.querySelectorAll('.chip-btn[data-step]').forEach(btn => {
  btn.addEventListener('click', () => {
    setTimeStep(btn.dataset.step);
  });
});

// 기본 배속 초기화 (1일, 인덱스 1)
setTimeStep(1);

// --- 시뮬레이션 제어 (재생/정지/스텝/리셋) ---
function setPaused(paused) {
  engine.isPaused = paused;
  if (paused) {
    playIcon.textContent = '▶️';
    playText.textContent = '재생';
    btnPlayPause.classList.remove('btn-primary');
  } else {
    playIcon.textContent = '⏸️';
    playText.textContent = '일시정지';
    btnPlayPause.classList.add('btn-primary');
  }
}

btnPlayPause.addEventListener('click', () => setPaused(!engine.isPaused));

btnStep.addEventListener('click', () => {
  setPaused(true);
  engine.update(1 / 60);
});

btnReset.addEventListener('click', () => {
  engine.clear();
  camera.center.set(0, 0);
  camera.metersPerPixel = 1e6;
  selectedBodyId = null;
  updateInspector();
  showToast('우주가 완전히 초기화되었습니다. 공간을 클릭하여 천체를 창조하세요.');
});

chkCollision.addEventListener('change', (e) => {
  engine.enableCollisions = e.target.checked;
});

// 스페이스바 단축키
window.addEventListener('keydown', (e) => {
  if (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT') return;
  if (e.code === 'Space') {
    e.preventDefault();
    setPaused(!engine.isPaused);
  }
});

// --- 툴바 모드 전환 & 시각화 토글 ---
function setTool(tool) {
  currentTool = tool;
  toolSpawn.classList.toggle('active', tool === 'spawn');
  toolPan.classList.toggle('active', tool === 'pan');
  canvas.style.cursor = tool === 'spawn' ? 'crosshair' : 'grab';
}

toolSpawn.addEventListener('click', () => setTool('spawn'));
toolPan.addEventListener('click', () => setTool('pan'));

btnFit.addEventListener('click', () => {
  camera.fitToBodies(engine.bodies);
});

toggleTrails.addEventListener('click', () => {
  renderer.showTrails = !renderer.showTrails;
  toggleTrails.classList.toggle('active', renderer.showTrails);
});
toggleGravity.addEventListener('click', () => {
  renderer.showGravityVectors = !renderer.showGravityVectors;
  toggleGravity.classList.toggle('active', renderer.showGravityVectors);
});
toggleVelocity.addEventListener('click', () => {
  renderer.showVelocityVectors = !renderer.showVelocityVectors;
  toggleVelocity.classList.toggle('active', renderer.showVelocityVectors);
});
toggleCOM.addEventListener('click', () => {
  renderer.showCenterOfMass = !renderer.showCenterOfMass;
  toggleCOM.classList.toggle('active', renderer.showCenterOfMass);
});

// --- 드래그 거리에 따른 질량 계산 ---
function computeMassFromDrag(dragDist) {
  if (dragDist < 8) return 5.972e24; // 기본 클릭: 지구 질량 (5.972e24 kg)

  // 8px ~ 240px 범위에서 질량이 지수적으로 팽창 (위성급 ~ 지구급 ~ 태양급 ~ 거대항성)
  const norm = Math.min(1, Math.max(0, (dragDist - 8) / 220));
  const logMass = 21.8 + Math.pow(norm, 1.35) * 9.5;
  return Math.pow(10, logMass);
}

function getColorByMass(mass) {
  if (mass >= 1.989e30) return '#f59e0b'; // 태양급 항성 (황금빛 주황)
  if (mass >= 1e27) return '#fb923c';     // 거대 가스행성 (오렌지)
  if (mass >= 1e24) return '#38bdf8';     // 지구형 행성 (청록/하늘)
  if (mass >= 1e22) return '#e2e8f0';     // 달/위성 (은백색)
  return '#c084fc';                      // 소행성 (보라)
}

// --- 캔버스 마우스 & 터치 인터랙션 (창조 및 이동) ---
canvas.addEventListener('mousedown', (e) => {
  const rect = canvas.getBoundingClientRect();
  const screenX = e.clientX - rect.left;
  const screenY = e.clientY - rect.top;

  // pan 모드에서 좌클릭 시 천체 선택 지원
  if (currentTool === 'pan' && e.button === 0) {
    const clickedBody = engine.bodies.find(b => {
      const s = camera.worldToScreen(b.position.x, b.position.y);
      const displayRadius = Math.max(12, b.radius / camera.metersPerPixel);
      return Math.hypot(s.x - screenX, s.y - screenY) <= displayRadius + 8;
    });
    if (clickedBody) {
      selectedBodyId = clickedBody.id;
      updateInspector();
      return;
    }
  }

  // 우클릭 또는 휠 클릭 또는 pan 모드 드래그: 카메라 팬
  if (e.button === 2 || e.button === 1 || currentTool === 'pan') {
    isRightDragging = true;
    dragStartPos = { x: screenX, y: screenY };
    canvas.style.cursor = 'grabbing';
    return;
  }

  // 좌클릭 + spawn 모드: 천체 위치 지정 & 드래그로 질량 조절 시작
  if (e.button === 0 && currentTool === 'spawn') {
    isDragging = true;
    dragStartPos = { x: screenX, y: screenY };
    dragCurrentPos = { x: screenX, y: screenY };
  }
});

canvas.addEventListener('mousemove', (e) => {
  const rect = canvas.getBoundingClientRect();
  const screenX = e.clientX - rect.left;
  const screenY = e.clientY - rect.top;

  if (isRightDragging) {
    const dx = screenX - dragStartPos.x;
    const dy = screenY - dragStartPos.y;
    camera.pan(dx, dy);
    dragStartPos = { x: screenX, y: screenY };
    return;
  }

  if (isDragging) {
    dragCurrentPos = { x: screenX, y: screenY };
  }
});

canvas.addEventListener('mouseup', (e) => {
  if (isRightDragging) {
    isRightDragging = false;
    canvas.style.cursor = currentTool === 'spawn' ? 'crosshair' : 'grab';
    return;
  }

  if (isDragging) {
    isDragging = false;
    const rect = canvas.getBoundingClientRect();
    const endX = e.clientX - rect.left;
    const endY = e.clientY - rect.top;

    // 클릭한 지점이 천체의 위치가 됨
    const worldPos = camera.screenToWorld(dragStartPos.x, dragStartPos.y);

    // 드래그 거리로부터 천체 질량 산출 (속도는 정의하지 않고 0으로 고정)
    const dx = endX - dragStartPos.x;
    const dy = endY - dragStartPos.y;
    const dragDist = Math.hypot(dx, dy);

    const mass = computeMassFromDrag(dragDist);
    const bodyColor = getColorByMass(mass);
    const newName = `천체 ${engine.bodies.length + 1}`;

    const newBody = new CelestialBody({
      name: newName,
      position: worldPos,
      velocity: new Vector2(0, 0), // 초기 속도는 0 (오직 상호 만유인력으로만 운동 시작)
      mass: mass,
      color: bodyColor
    });

    engine.addBody(newBody);
    selectedBodyId = newBody.id;
    updateInspector();

    const massText = renderer.formatMass(mass);
    if (engine.bodies.length === 1) {
      showToast(`첫 번째 천체(${massText})가 창조되었습니다! 다른 위치에 두 번째 천체를 놓아보세요.`);
    } else if (engine.bodies.length === 2) {
      showToast(`두 번째 천체(${massText}) 생성! 상호 중력 인력으로 서로를 향해 끌어당기기 시작합니다.`);
    } else {
      showToast(`${newName}(${massText})이(가) 우주에 추가되었습니다.`);
    }
  }
});

// 우클릭 기본 컨텍스트 메뉴 방지
canvas.addEventListener('contextmenu', (e) => e.preventDefault());

// 마우스 휠 줌 (커서 위치 정확 고정)
canvas.addEventListener('wheel', (e) => {
  e.preventDefault();
  const rect = canvas.getBoundingClientRect();
  const screenX = e.clientX - rect.left;
  const screenY = e.clientY - rect.top;

  // 휠 스크롤/트랙패드 델타에 비례한 부드러운 지수 줌 (클램핑 적용)
  const clampedDelta = Math.max(-120, Math.min(120, e.deltaY));
  const zoomFactor = Math.pow(1.002, clampedDelta);
  camera.zoomAt(screenX, screenY, zoomFactor);
}, { passive: false });

// --- 정밀 2체 직접 생성 모달 로직 ---
toolPrecision.addEventListener('click', () => {
  precisionModal.classList.remove('hidden');
});

btnModalCancel.addEventListener('click', () => {
  precisionModal.classList.add('hidden');
});

btnModalCreate.addEventListener('click', () => {
  const m1Input = parseFloat(document.getElementById('pMass1').value) || 5.972e24;
  const m1Unit = parseFloat(document.getElementById('pUnitMass1').value) || 1;
  const mass1 = m1Input * m1Unit;

  const m2Input = parseFloat(document.getElementById('pMass2').value) || 7.342e22;
  const m2Unit = parseFloat(document.getElementById('pUnitMass2').value) || 1;
  const mass2 = m2Input * m2Unit;

  const distInput = parseFloat(document.getElementById('pDistance').value) || 384400;
  const distUnit = parseFloat(document.getElementById('pUnitDist').value) || 1000;
  const r = distInput * distUnit;

  const motionMode = document.getElementById('pMotionMode').value;

  // 우주 초기화 후 두 물체 생성
  engine.clear();

  // 질량 중심(COM)이 원점 (0,0)에 오도록 위치 배치
  const totalMass = mass1 + mass2;
  const r1 = (mass2 / totalMass) * r;
  const r2 = (mass1 / totalMass) * r;

  const pos1 = new Vector2(-r1, 0);
  const pos2 = new Vector2(r2, 0);

  let v1 = new Vector2(0, 0);
  let v2 = new Vector2(0, 0);

  if (motionMode === 'circular') {
    // 안정적인 원궤도 공전 속도: v_rel = sqrt(G * (m1 + m2) / r)
    const vOrbit = Math.sqrt((engine.G * totalMass) / r);
    // 질량 중심 기준 수직 속도
    v1.set(0, (mass2 / totalMass) * vOrbit);
    v2.set(0, -(mass1 / totalMass) * vOrbit);
  } else if (motionMode === 'elliptical') {
    // 타원 궤도 속도 (원궤도의 75%)
    const vOrbit = Math.sqrt((engine.G * totalMass) / r) * 0.75;
    v1.set(0, (mass2 / totalMass) * vOrbit);
    v2.set(0, -(mass1 / totalMass) * vOrbit);
  }

  const b1 = new CelestialBody({
    name: '물체 A',
    position: pos1,
    velocity: v1,
    mass: mass1,
    color: '#38bdf8'
  });

  const b2 = new CelestialBody({
    name: '물체 B',
    position: pos2,
    velocity: v2,
    mass: mass2,
    color: '#f59e0b'
  });

  engine.addBody(b1);
  engine.addBody(b2);

  precisionModal.classList.add('hidden');
  camera.fitToBodies(engine.bodies);
  showToast(`두 천체 생성 완료! 거리: ${renderer.formatDistance(r)}`);
});

// --- 우주 프리셋 버튼들 ---
document.getElementById('presetVoid').addEventListener('click', () => {
  engine.clear();
  camera.center.set(0, 0);
  camera.metersPerPixel = 1e6;
  showToast('태초의 완전한 빈 우주가 되었습니다. 천체를 추가해보세요.');
});

document.getElementById('presetEarthMoon').addEventListener('click', () => {
  engine.clear();
  const mEarth = 5.972e24;
  const mMoon = 7.342e22;
  const dist = 3.844e8; // 384,400 km
  const totalM = mEarth + mMoon;

  const rEarth = (mMoon / totalM) * dist;
  const rMoon = (mEarth / totalM) * dist;

  const vOrbital = Math.sqrt((engine.G * totalM) / dist);

  engine.addBody(new CelestialBody({
    name: '지구 (Earth)',
    position: new Vector2(-rEarth, 0),
    velocity: new Vector2(0, (mMoon / totalM) * vOrbital),
    mass: mEarth,
    radius: 6.371e6,
    color: '#38bdf8'
  }));

  engine.addBody(new CelestialBody({
    name: '달 (Moon)',
    position: new Vector2(rMoon, 0),
    velocity: new Vector2(0, -(mEarth / totalM) * vOrbital),
    mass: mMoon,
    radius: 1.737e6,
    color: '#e2e8f0'
  }));

  setTimeStep(1); // 1초 = 1일
  camera.fitToBodies(engine.bodies);
  showToast('지구와 달 시스템이 생성되었습니다.');
});

document.getElementById('presetSunEarth').addEventListener('click', () => {
  engine.clear();
  const mSun = 1.989e30;
  const mEarth = 5.972e24;
  const dist = 1.496e11; // 1 AU (1억 4960만 km)

  const vEarth = Math.sqrt((engine.G * mSun) / dist);

  engine.addBody(new CelestialBody({
    name: '태양 (Sun)',
    position: new Vector2(0, 0),
    velocity: new Vector2(0, 0),
    mass: mSun,
    radius: 6.963e8,
    color: '#fbbf24',
    fixed: true
  }));

  engine.addBody(new CelestialBody({
    name: '지구 (Earth)',
    position: new Vector2(dist, 0),
    velocity: new Vector2(0, -vEarth),
    mass: mEarth,
    radius: 6.371e6,
    color: '#38bdf8'
  }));

  setTimeStep(2); // 1초 = 1달
  camera.fitToBodies(engine.bodies);
  showToast('태양과 지구 시스템이 생성되었습니다. (1초 = 1달)');
});

document.getElementById('presetBinary').addEventListener('click', () => {
  engine.clear();
  const mass = 1.5e30;
  const dist = 2e10;
  const vOrbit = Math.sqrt((engine.G * (mass + mass)) / dist) * 0.5;

  engine.addBody(new CelestialBody({
    name: '별 A (Star A)',
    position: new Vector2(-dist / 2, 0),
    velocity: new Vector2(0, vOrbit),
    mass: mass,
    color: '#ec4899'
  }));

  engine.addBody(new CelestialBody({
    name: '별 B (Star B)',
    position: new Vector2(dist / 2, 0),
    velocity: new Vector2(0, -vOrbit),
    mass: mass,
    color: '#38bdf8'
  }));

  setTimeStep(1); // 1초 = 1일
  camera.fitToBodies(engine.bodies);
  showToast('쌍성계(동일 질량 별 2개의 공전)가 생성되었습니다.');
});

document.getElementById('presetCollision').addEventListener('click', () => {
  engine.clear();
  const mass1 = 5.972e24;
  const mass2 = 3.0e24;
  const dist = 5e7;

  engine.addBody(new CelestialBody({
    name: '천체 1',
    position: new Vector2(-dist / 2, 0),
    velocity: new Vector2(0, 0),
    mass: mass1,
    color: '#f43f5e'
  }));

  engine.addBody(new CelestialBody({
    name: '천체 2',
    position: new Vector2(dist / 2, 0),
    velocity: new Vector2(0, 0),
    mass: mass2,
    color: '#38bdf8'
  }));

  setTimeStep(1); // 1초 = 1일
  camera.fitToBodies(engine.bodies);
  showToast('초기 속도 0에서 순수 만유인력에 의해 정면 충돌 및 합체합니다.');
});

// --- 인스펙터 편집기 UI ---
const inspectorSection = document.getElementById('inspectorSection');
const selectInspectBody = document.getElementById('selectInspectBody');
const inspectName = document.getElementById('inspectName');
const inspectMass = document.getElementById('inspectMass');
const inspectMassEarthMultiple = document.getElementById('inspectMassEarthMultiple');
const inspectMassRankBadge = document.getElementById('inspectMassRankBadge');
const inspectColor = document.getElementById('inspectColor');
const btnDeleteBody = document.getElementById('btnDeleteBody');
const btnSetJupiter = document.getElementById('btnSetJupiter');

// 질량 분석 헬퍼 (지구 x N배 소수점 1자리 + 등급)
function getMassRankAndMultiple(mass) {
  const earthMass = 5.972e24;
  const multiple = mass / earthMass;

  let rank = '지구급';
  if (multiple < 0.1) {
    rank = '달급';
  } else if (multiple < 50) {
    rank = '지구급';
  } else if (multiple < 25000) {
    rank = '목성급';
  } else {
    rank = '태양급';
  }

  let multipleFormatted = '';
  if (multiple >= 1000) {
    multipleFormatted = multiple.toLocaleString('ko-KR', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
  } else if (multiple >= 0.05) {
    multipleFormatted = multiple.toFixed(1);
  } else {
    multipleFormatted = multiple.toFixed(3);
  }

  return {
    multiple,
    rank,
    text: `지구 × ${multipleFormatted}배 (${rank})`
  };
}

function updateInspector() {
  if (engine.bodies.length === 0) {
    inspectorSection.style.display = 'none';
    return;
  }

  let body = engine.bodies.find(b => b.id === selectedBodyId);
  if (!body) {
    body = engine.bodies[0];
    selectedBodyId = body.id;
  }

  inspectorSection.style.display = 'block';
  if (selectInspectBody) {
    selectInspectBody.value = body.id;
  }
  inspectName.value = body.name;
  inspectMass.value = body.mass;
  inspectColor.value = body.color;

  const info = getMassRankAndMultiple(body.mass);
  inspectMassEarthMultiple.textContent = info.text;
  inspectMassRankBadge.textContent = info.rank;
}

if (selectInspectBody) {
  selectInspectBody.addEventListener('change', (e) => {
    selectedBodyId = e.target.value;
    updateInspector();
  });
}

inspectName.addEventListener('input', (e) => {
  const b = engine.bodies.find(body => body.id === selectedBodyId);
  if (b) {
    b.name = e.target.value;
    lastBodyListHash = ''; // 드롭다운 라벨 갱신 트리거
  }
});

function applyMassChange(newMass) {
  const b = engine.bodies.find(body => body.id === selectedBodyId);
  if (b && newMass > 0) {
    b.mass = newMass;
    b.updateRadius();
    inspectMass.value = b.mass;
    const info = getMassRankAndMultiple(b.mass);
    inspectMassEarthMultiple.textContent = info.text;
    inspectMassRankBadge.textContent = info.rank;
  }
}

inspectMass.addEventListener('input', (e) => {
  const val = parseFloat(e.target.value);
  if (!isNaN(val) && val > 0) {
    applyMassChange(val);
  }
});

inspectMass.addEventListener('change', (e) => {
  const val = parseFloat(e.target.value);
  if (!isNaN(val) && val > 0) {
    applyMassChange(val);
  }
});

inspectColor.addEventListener('input', (e) => {
  const b = engine.bodies.find(body => body.id === selectedBodyId);
  if (b) b.color = e.target.value;
});

btnDeleteBody.addEventListener('click', () => {
  if (selectedBodyId) {
    engine.removeBody(selectedBodyId);
    selectedBodyId = engine.bodies.length > 0 ? engine.bodies[0].id : null;
    lastBodyListHash = '';
    updateInspector();
  }
});

document.getElementById('btnSetMoon').addEventListener('click', () => {
  applyMassChange(7.342e22); // 달 (0.012 M⊕)
});

document.getElementById('btnSetEarth').addEventListener('click', () => {
  applyMassChange(5.972e24); // 지구 (1.0 M⊕)
});

if (btnSetJupiter) {
  btnSetJupiter.addEventListener('click', () => {
    applyMassChange(1.898e27); // 목성 (317.8 M⊕)
  });
}

document.getElementById('btnSetSun').addEventListener('click', () => {
  applyMassChange(1.989e30); // 태양 (333,000 M⊕)
});

// --- 우주 시간 포맷터 ---
function formatUniverseTime(totalSeconds) {
  const sec = Math.floor(totalSeconds % 60);
  const min = Math.floor((totalSeconds / 60) % 60);
  const hour = Math.floor((totalSeconds / 3600) % 24);
  const totalDays = Math.floor(totalSeconds / 86400);
  const years = Math.floor(totalDays / 365);
  const days = totalDays % 365;

  const pad2 = (n) => String(n).padStart(2, '0');
  const pad3 = (n) => String(n).padStart(3, '0');

  // 년은 지속 증가하므로 그대로 표기하고, 일/시간/분/초는 자릿수 흔들림 없도록 0으로 고정 패딩
  return `${years}년 ${pad3(days)}일 ${pad2(hour)}시간 ${pad2(min)}분 ${pad2(sec)}초`;
}

// --- 천체 드롭다운 목록 동기화 ---
let lastBodyListHash = '';

function syncBodyDropdowns() {
  const currentHash = engine.bodies.map(b => `${b.id}:${b.name}`).join('|');
  if (currentHash === lastBodyListHash) return;
  lastBodyListHash = currentHash;

  const prevA = selectBodyA.value;
  const prevB = selectBodyB.value;

  selectBodyA.innerHTML = '';
  selectBodyB.innerHTML = '';
  if (selectInspectBody) selectInspectBody.innerHTML = '';

  if (engine.bodies.length === 0) {
    selectBodyA.innerHTML = '<option value="">천체 없음</option>';
    selectBodyB.innerHTML = '<option value="">천체 없음</option>';
    if (selectInspectBody) selectInspectBody.innerHTML = '<option value="">천체 없음</option>';
    return;
  }

  engine.bodies.forEach((b, idx) => {
    const optA = document.createElement('option');
    optA.value = b.id;
    optA.textContent = `${idx + 1}. ${b.name}`;
    selectBodyA.appendChild(optA);

    const optB = document.createElement('option');
    optB.value = b.id;
    optB.textContent = `${idx + 1}. ${b.name}`;
    selectBodyB.appendChild(optB);

    if (selectInspectBody) {
      const optInsp = document.createElement('option');
      optInsp.value = b.id;
      optInsp.textContent = `${idx + 1}. ${b.name}`;
      selectInspectBody.appendChild(optInsp);
    }
  });

  // 이전 선택 복원 또는 적절한 기본값 세팅
  if (engine.bodies.some(b => b.id === prevA)) {
    selectBodyA.value = prevA;
  } else {
    selectBodyA.value = engine.bodies[0].id;
  }

  if (engine.bodies.some(b => b.id === prevB) && prevB !== selectBodyA.value) {
    selectBodyB.value = prevB;
  } else if (engine.bodies.length >= 2) {
    const second = engine.bodies.find(b => b.id !== selectBodyA.value) || engine.bodies[1];
    selectBodyB.value = second.id;
  } else {
    selectBodyB.value = engine.bodies[0].id;
  }

  if (selectInspectBody) {
    if (selectedBodyId && engine.bodies.some(b => b.id === selectedBodyId)) {
      selectInspectBody.value = selectedBodyId;
    } else {
      selectInspectBody.value = engine.bodies[0].id;
    }
  }
}

// 드롭다운 변경 리스너
selectBodyA.addEventListener('change', () => {
  if (selectBodyA.value === selectBodyB.value && engine.bodies.length >= 2) {
    const other = engine.bodies.find(b => b.id !== selectBodyA.value);
    if (other) selectBodyB.value = other.id;
  }
});

selectBodyB.addEventListener('change', () => {
  if (selectBodyA.value === selectBodyB.value && engine.bodies.length >= 2) {
    const other = engine.bodies.find(b => b.id !== selectBodyB.value);
    if (other) selectBodyA.value = other.id;
  }
});

// --- 실시간 메트릭 업데이트 ---
function updateMetrics() {
  bodyCountBadge.textContent = `천체 ${engine.bodies.length}개`;
  syncBodyDropdowns();

  const idA = selectBodyA.value;
  const idB = selectBodyB.value;
  const metrics = engine.getTwoBodyMetrics(idA, idB);

  if (metrics && idA && idB && idA !== idB) {
    labelV1.textContent = `${metrics.body1.name} 속력`;
    labelV2.textContent = `${metrics.body2.name} 속력`;

    valDistance.textContent = renderer.formatDistance(metrics.distance);
    valForce.textContent = `${metrics.force.toExponential(3)} N`;
    valV1.textContent = renderer.formatVelocity(metrics.body1.velocity.magnitude());
    valV2.textContent = renderer.formatVelocity(metrics.body2.velocity.magnitude());

    const energy = engine.getTotalEnergy();
    valEnergy.textContent = `${energy.total.toExponential(3)} J`;
  } else if (metrics && idA === idB) {
    labelV1.textContent = `${metrics.body1.name} 속력`;
    labelV2.textContent = `동일 천체`;
    valDistance.textContent = '0 m (동일 천체)';
    valForce.textContent = '-';
    valV1.textContent = renderer.formatVelocity(metrics.body1.velocity.magnitude());
    valV2.textContent = '-';
    valEnergy.textContent = '-';
  } else {
    labelV1.textContent = '천체 A 속력';
    labelV2.textContent = '천체 B 속력';
    valDistance.textContent = engine.bodies.length === 1 ? '상대 천체 없음' : '-';
    valForce.textContent = '-';
    valV1.textContent = engine.bodies.length >= 1 ? renderer.formatVelocity(engine.bodies[0].velocity.magnitude()) : '-';
    valV2.textContent = '-';
    valEnergy.textContent = '-';
  }

  universeClockEl.textContent = formatUniverseTime(engine.simulatedTime);
}

// --- 메인 애니메이션 루프 ---
let lastFrameTime = performance.now();

function animate(currentTime) {
  requestAnimationFrame(animate);

  const realDeltaTime = Math.min((currentTime - lastFrameTime) / 1000, 0.1);
  lastFrameTime = currentTime;

  // 1. 물리 엔진 업데이트
  engine.update(realDeltaTime);

  // 2. 카메라 추적
  camera.updateTracking(engine);

  // 3. 화면 렌더링
  renderer.clear();
  renderer.drawGrid();
  renderer.drawTrails(engine.bodies, engine);
  renderer.drawGravityInteractions(engine.bodies);
  renderer.drawVelocityVectors(engine.bodies);
  renderer.drawCenterOfMass(engine);
  renderer.drawBodies(engine.bodies, selectedBodyId);
  renderer.drawScaleBar();

  // 4. 물체 생성 중 드래그 질량 팽창 프리뷰 렌더링
  if (isDragging) {
    const dx = dragCurrentPos.x - dragStartPos.x;
    const dy = dragCurrentPos.y - dragStartPos.y;
    const dragDist = Math.hypot(dx, dy);
    const previewMass = computeMassFromDrag(dragDist);
    renderer.drawSpawnPreview(dragStartPos, dragCurrentPos, previewMass);
  }

  // 5. 물리 정보 패널 업데이트
  updateMetrics();
}

// 애니메이션 시작
requestAnimationFrame(animate);

// 초기 안내 토스트
showToast('태초의 우주에 오신 것을 환영합니다! 화면을 클릭해 천체를 창조하세요.', 5000);

