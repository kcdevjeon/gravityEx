export class CanvasRenderer {
  constructor(canvas, camera) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.camera = camera;
    this.dpr = window.devicePixelRatio || 1;

    // 시각화 옵션
    this.showTrails = true;
    this.showGravityVectors = true;
    this.showVelocityVectors = true;
    this.showLabels = true;
    this.showCenterOfMass = true;
    this.showGrid = true;
  }

  clear() {
    const ctx = this.ctx;
    // DPR 고해상도 버퍼 스케일 설정
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);

    const width = this.camera.getViewportWidth();
    const height = this.camera.getViewportHeight();

    // 심우주 칠흑 배경
    ctx.fillStyle = '#060814';
    ctx.fillRect(0, 0, width, height);
  }

  // 공간의 거리감을 주는 미세 그리드 렌더링
  drawGrid() {
    if (!this.showGrid) return;
    const ctx = this.ctx;
    const width = this.camera.getViewportWidth();
    const height = this.camera.getViewportHeight();

    // 현재 줌에 맞는 적절한 그리드 간격 (100px 정도에 해당하는 1-2-5 거듭제곱 단위)
    const targetMeters = this.camera.metersPerPixel * 120;
    const exponent = Math.floor(Math.log10(targetMeters));
    const base = Math.pow(10, exponent);

    let gridStepMeters = base;
    if (targetMeters / base >= 5) {
      gridStepMeters = base * 5;
    } else if (targetMeters / base >= 2) {
      gridStepMeters = base * 2;
    }

    const gridStepPx = gridStepMeters / this.camera.metersPerPixel;
    if (gridStepPx < 20) return;

    // 원점의 스크린 좌표
    const origin = this.camera.worldToScreen(0, 0);

    ctx.save();
    ctx.lineWidth = 1;
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.035)';

    // 세로선
    const startX = (origin.x % gridStepPx + gridStepPx) % gridStepPx;
    for (let x = startX; x < width; x += gridStepPx) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, height);
      ctx.stroke();
    }

    // 가로선
    const startY = (origin.y % gridStepPx + gridStepPx) % gridStepPx;
    for (let y = startY; y < height; y += gridStepPx) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(width, y);
      ctx.stroke();
    }

    // 원점 축 (은은한 십자선)
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)';
    ctx.beginPath();
    ctx.moveTo(origin.x, 0);
    ctx.lineTo(origin.x, height);
    ctx.moveTo(0, origin.y);
    ctx.lineTo(width, origin.y);
    ctx.stroke();

    ctx.restore();
  }

  // 궤적 (Trails) 렌더링 (초고속 배속 시 매끄러운 케플러 궤도 곡선 자동 렌더링)
  drawTrails(bodies, engine = null) {
    if (!this.showTrails) return;
    const ctx = this.ctx;

    // 2체 구속 궤도이고 초고속 배속인 경우: 다각형 깨짐을 방지하고 완벽한 원/타원 곡선 렌더링
    if (engine && bodies.length === 2 && engine.timeScale >= 86400 * 5) {
      const b1 = bodies[0];
      const b2 = bodies[1];
      const totalMass = b1.mass + b2.mass;

      // 상대 거리 및 질량 중심
      const dist = b1.position.distanceTo(b2.position);
      const com = engine.getCenterOfMass();
      const sCom = this.camera.worldToScreen(com.x, com.y);

      // 질량 중심 기준 각 천체의 궤도 반경
      const r1Px = ((b2.mass / totalMass) * dist) / this.camera.metersPerPixel;
      const r2Px = ((b1.mass / totalMass) * dist) / this.camera.metersPerPixel;

      ctx.save();
      // 천체 1의 매끄러운 공전 궤도선
      if (r1Px > 2) {
        ctx.strokeStyle = this.hexToRgba(b1.color, 0.4);
        ctx.lineWidth = 1.5;
        ctx.setLineDash([3, 4]);
        ctx.beginPath();
        ctx.arc(sCom.x, sCom.y, r1Px, 0, Math.PI * 2);
        ctx.stroke();
      }

      // 천체 2의 매끄러운 공전 궤도선
      if (r2Px > 2) {
        ctx.strokeStyle = this.hexToRgba(b2.color, 0.55);
        ctx.lineWidth = 1.8;
        ctx.setLineDash([4, 4]);
        ctx.beginPath();
        ctx.arc(sCom.x, sCom.y, r2Px, 0, Math.PI * 2);
        ctx.stroke();
      }
      ctx.restore();
    }

    // 통상 궤적 포인트 렌더링
    for (const body of bodies) {
      if (body.trail.length < 2) continue;

      ctx.save();
      ctx.lineWidth = 2;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';

      const trailLen = body.trail.length;
      for (let i = 1; i < trailLen; i++) {
        const p1 = this.camera.worldToScreen(body.trail[i - 1].x, body.trail[i - 1].y);
        const p2 = this.camera.worldToScreen(body.trail[i].x, body.trail[i].y);

        const alpha = (i / trailLen) * 0.75;
        ctx.strokeStyle = this.hexToRgba(body.color, alpha);

        ctx.beginPath();
        ctx.moveTo(p1.x, p1.y);
        ctx.lineTo(p2.x, p2.y);
        ctx.stroke();
      }

      ctx.restore();
    }
  }

  // 천체 간 상호 인력선 및 중력 벡터 화살표
  drawGravityInteractions(bodies) {
    if (!this.showGravityVectors || bodies.length < 2) return;
    const ctx = this.ctx;

    const n = bodies.length;
    for (let i = 0; i < n; i++) {
      const b1 = bodies[i];
      const s1 = this.camera.worldToScreen(b1.position.x, b1.position.y);

      for (let j = i + 1; j < n; j++) {
        const b2 = bodies[j];
        const s2 = this.camera.worldToScreen(b2.position.x, b2.position.y);

        // 상호 인력 연결선 (점선)
        ctx.save();
        ctx.setLineDash([4, 6]);
        ctx.strokeStyle = 'rgba(255, 215, 0, 0.25)';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(s1.x, s1.y);
        ctx.lineTo(s2.x, s2.y);
        ctx.stroke();
        ctx.restore();

        // 중력 벡터 화살표 (두 물체가 서로를 당기는 방향)
        const dx = s2.x - s1.x;
        const dy = s2.y - s1.y;
        const d = Math.hypot(dx, dy);
        if (d > 20) {
          const arrowLen = Math.min(d * 0.35, 45);
          const ux = dx / d;
          const uy = dy / d;

          // b1에서 b2를 향하는 화살표
          this.drawArrow(s1.x, s1.y, s1.x + ux * arrowLen, s1.y + uy * arrowLen, '#ffd700');
          // b2에서 b1을 향하는 화살표
          this.drawArrow(s2.x, s2.y, s2.x - ux * arrowLen, s2.y - uy * arrowLen, '#ffd700');
        }
      }
    }
  }

  // 속도 벡터 (Velocity Vector)
  drawVelocityVectors(bodies) {
    if (!this.showVelocityVectors) return;
    const ctx = this.ctx;

    for (const body of bodies) {
      const speed = body.velocity.magnitude();
      if (speed <= 0) continue;

      const s = this.camera.worldToScreen(body.position.x, body.position.y);
      // 속도 방향 및 시각적 크기 (화면 픽셀 25~80px 정도)
      const arrowLen = Math.max(20, Math.min(80, Math.log10(speed + 1) * 15));
      const ux = body.velocity.x / speed;
      const uy = body.velocity.y / speed;

      this.drawArrow(s.x, s.y, s.x + ux * arrowLen, s.y + uy * arrowLen, '#00ffcc', 2);
    }
  }

  // 질량 중심 (Center of Mass) 십자 마크
  drawCenterOfMass(engine) {
    if (!this.showCenterOfMass || engine.bodies.length < 2) return;
    const com = engine.getCenterOfMass();
    const s = this.camera.worldToScreen(com.x, com.y);
    const ctx = this.ctx;

    ctx.save();
    ctx.strokeStyle = '#ff3366';
    ctx.fillStyle = '#ff3366';
    ctx.lineWidth = 1.5;

    // + 마크
    const size = 9;
    ctx.beginPath();
    ctx.moveTo(s.x - size, s.y);
    ctx.lineTo(s.x + size, s.y);
    ctx.moveTo(s.x, s.y - size);
    ctx.lineTo(s.x, s.y + size);
    ctx.stroke();

    // 외부 원
    ctx.beginPath();
    ctx.arc(s.x, s.y, size * 0.7, 0, Math.PI * 2);
    ctx.stroke();

    ctx.font = '11px sans-serif';
    ctx.fillText('질량 중심 (COM)', s.x + 12, s.y - 6);
    ctx.restore();
  }

  // 천체 본체 및 발광(Glow) 렌더링
  drawBodies(bodies, selectedBodyId = null) {
    const ctx = this.ctx;

    for (const body of bodies) {
      const s = this.camera.worldToScreen(body.position.x, body.position.y);

      // 화면에 보이지 않으면 스킵
      const vpW = this.camera.getViewportWidth();
      const vpH = this.camera.getViewportHeight();
      if (s.x < -100 || s.x > vpW + 100 || s.y < -100 || s.y > vpH + 100) {
        continue;
      }

      // 화면상의 픽셀 반지름 계산 (최소 6px ~ 최대 120px)
      const truePxRadius = body.radius / this.camera.metersPerPixel;
      const displayRadius = Math.max(6, Math.min(120, truePxRadius));

      ctx.save();

      // 외부 발광 (Glow)
      const glowGrad = ctx.createRadialGradient(
        s.x, s.y, displayRadius * 0.4,
        s.x, s.y, displayRadius * 2.6
      );
      glowGrad.addColorStop(0, this.hexToRgba(body.color, 0.45));
      glowGrad.addColorStop(0.5, this.hexToRgba(body.color, 0.15));
      glowGrad.addColorStop(1, 'rgba(0,0,0,0)');

      ctx.fillStyle = glowGrad;
      ctx.beginPath();
      ctx.arc(s.x, s.y, displayRadius * 2.6, 0, Math.PI * 2);
      ctx.fill();

      // 본체 구체 (그라데이션 효과)
      const bodyGrad = ctx.createRadialGradient(
        s.x - displayRadius * 0.3, s.y - displayRadius * 0.3, displayRadius * 0.1,
        s.x, s.y, displayRadius
      );
      bodyGrad.addColorStop(0, '#ffffff');
      bodyGrad.addColorStop(0.3, body.color);
      bodyGrad.addColorStop(1, this.hexToRgba(body.color, 0.85));

      ctx.fillStyle = bodyGrad;
      ctx.beginPath();
      ctx.arc(s.x, s.y, displayRadius, 0, Math.PI * 2);
      ctx.fill();

      // 선택된 천체 링 하이라이트
      if (body.id === selectedBodyId) {
        ctx.strokeStyle = '#00ffff';
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        ctx.arc(s.x, s.y, displayRadius + 8, 0, Math.PI * 2);
        ctx.stroke();
      }

      // 텍스트 라벨 (이름 및 질량)
      if (this.showLabels) {
        ctx.fillStyle = '#ffffff';
        ctx.font = '12px "Pretendard", -apple-system, sans-serif';
        ctx.textAlign = 'center';
        ctx.shadowColor = 'rgba(0,0,0,0.8)';
        ctx.shadowBlur = 4;
        ctx.fillText(body.name, s.x, s.y + displayRadius + 16);

        ctx.fillStyle = 'rgba(255, 255, 255, 0.65)';
        ctx.font = '10px monospace';
        const massStr = this.formatMass(body.mass);
        ctx.fillText(massStr, s.x, s.y + displayRadius + 28);
      }

      ctx.restore();
    }
  }

  // 생성 중인 천체 드래그 질량 팽창 프리뷰 렌더링
  drawSpawnPreview(startScreen, currentScreen, mass, previewColor = '#38bdf8') {
    const ctx = this.ctx;

    const dx = currentScreen.x - startScreen.x;
    const dy = currentScreen.y - startScreen.y;
    const dragDist = Math.max(8, Math.hypot(dx, dy));

    // 질량에 따른 시각적 반경
    const displayRadius = Math.max(8, Math.min(260, dragDist));

    ctx.save();

    // 질량 크기에 따른 동적 색상 및 등급 분류 (1kg, 100kg, 1톤, 10톤, 소행성, 달, 지구, 목성, 태양)
    let dynamicColor = previewColor;
    let rankName = '1kg급 (인간 소지품)';

    if (mass >= 1.989e30) {
      dynamicColor = '#f59e0b'; // 황금빛 항성
      rankName = '태양급 항성 (Sun)';
    } else if (mass >= 1e27) {
      dynamicColor = '#fb923c'; // 거대 가스행성
      rankName = '목성급 거대행성 (Giant)';
    } else if (mass >= 1e24) {
      dynamicColor = '#38bdf8'; // 지구형 행성
      rankName = '지구급 행성 (Earth)';
    } else if (mass >= 1e22) {
      dynamicColor = '#e2e8f0'; // 달/위성
      rankName = '달/위성급 (Moon)';
    } else if (mass >= 1e11) {
      dynamicColor = '#c084fc'; // 소행성
      rankName = '소행성급 (Asteroid)';
    } else if (mass >= 5000) {
      dynamicColor = '#10b981'; // 10톤
      rankName = '10톤급 (대형트럭/버스)';
    } else if (mass >= 500) {
      dynamicColor = '#34d399'; // 1톤
      rankName = '1톤급 (승용차)';
    } else if (mass >= 50) {
      dynamicColor = '#67e8f9'; // 100kg
      rankName = '100kg급 (성인/오토바이)';
    } else {
      dynamicColor = '#38bdf8'; // 1kg
      rankName = '1kg급 (소형 물체)';
    }

    // 1. 외부 중력 오라(Glow) 팽창 효과
    const glowGrad = ctx.createRadialGradient(
      startScreen.x, startScreen.y, displayRadius * 0.2,
      startScreen.x, startScreen.y, displayRadius * 2.2
    );
    glowGrad.addColorStop(0, this.hexToRgba(dynamicColor, 0.45));
    glowGrad.addColorStop(0.6, this.hexToRgba(dynamicColor, 0.12));
    glowGrad.addColorStop(1, 'rgba(0,0,0,0)');

    ctx.fillStyle = glowGrad;
    ctx.beginPath();
    ctx.arc(startScreen.x, startScreen.y, displayRadius * 2.2, 0, Math.PI * 2);
    ctx.fill();

    // 2. 본체 구체 프리뷰
    const bodyGrad = ctx.createRadialGradient(
      startScreen.x - displayRadius * 0.3, startScreen.y - displayRadius * 0.3, displayRadius * 0.1,
      startScreen.x, startScreen.y, displayRadius
    );
    bodyGrad.addColorStop(0, '#ffffff');
    bodyGrad.addColorStop(0.35, dynamicColor);
    bodyGrad.addColorStop(1, this.hexToRgba(dynamicColor, 0.8));

    ctx.fillStyle = bodyGrad;
    ctx.beginPath();
    ctx.arc(startScreen.x, startScreen.y, displayRadius, 0, Math.PI * 2);
    ctx.fill();

    // 3. 반경 가이드 원선 (점선)
    ctx.setLineDash([4, 4]);
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.6)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(startScreen.x, startScreen.y, displayRadius, 0, Math.PI * 2);
    ctx.stroke();

    // 4. 중심에서 커서까지의 반경 조절 선
    ctx.setLineDash([2, 4]);
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.4)';
    ctx.beginPath();
    ctx.moveTo(startScreen.x, startScreen.y);
    ctx.lineTo(currentScreen.x, currentScreen.y);
    ctx.stroke();

    // 5. 실시간 질량 및 등급 텍스트 표시
    ctx.setLineDash([]);
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 13px -apple-system, sans-serif';
    ctx.textAlign = 'left';
    ctx.shadowColor = 'rgba(0,0,0,0.85)';
    ctx.shadowBlur = 6;

    const textX = currentScreen.x + 14;
    const textY = currentScreen.y + 4;

    ctx.fillText(`질량: ${this.formatMass(mass)}`, textX, textY);
    ctx.font = '11px -apple-system, sans-serif';
    ctx.fillStyle = dynamicColor;
    ctx.fillText(`[${rankName}]  마우스를 놓으면 생성`, textX, textY + 18);

    ctx.restore();
  }

  // 화면 좌하단 스케일바
  drawScaleBar() {
    const ctx = this.ctx;
    const isMobile = this.camera.getViewportWidth() <= 768;
    const targetPx = isMobile ? 80 : 150;
    const targetMeters = targetPx * this.camera.metersPerPixel;

    // 보기 쉬운 단위로 라운딩
    const exponent = Math.floor(Math.log10(targetMeters));
    const base = Math.pow(10, exponent);
    let niceMeters = base;
    if (targetMeters / base >= 5) niceMeters = base * 5;
    else if (targetMeters / base >= 2) niceMeters = base * 2;

    const actualPx = niceMeters / this.camera.metersPerPixel;
    const x = isMobile ? 14 : 30;
    const y = this.camera.getViewportHeight() - (isMobile ? 125 : 30);

    ctx.save();
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.7)';
    ctx.fillStyle = 'rgba(255, 255, 255, 0.85)';
    ctx.lineWidth = 2;

    // |-----| 형태
    ctx.beginPath();
    ctx.moveTo(x, y - 5);
    ctx.lineTo(x, y);
    ctx.lineTo(x + actualPx, y);
    ctx.lineTo(x + actualPx, y - 5);
    ctx.stroke();

    ctx.font = '11px monospace';
    ctx.textAlign = 'center';
    ctx.fillText(this.formatDistance(niceMeters), x + actualPx / 2, y - 8);
    ctx.restore();
  }

  // 헬퍼: 화살표 그리기
  drawArrow(fromX, fromY, toX, toY, color = '#ffffff', lineWidth = 2) {
    const ctx = this.ctx;
    const headLen = 9;
    const angle = Math.atan2(toY - fromY, toX - fromX);

    ctx.save();
    ctx.strokeStyle = color;
    ctx.fillStyle = color;
    ctx.lineWidth = lineWidth;

    ctx.beginPath();
    ctx.moveTo(fromX, fromY);
    ctx.lineTo(toX, toY);
    ctx.stroke();

    // 화살표 머리
    ctx.beginPath();
    ctx.moveTo(toX, toY);
    ctx.lineTo(toX - headLen * Math.cos(angle - Math.PI / 6), toY - headLen * Math.sin(angle - Math.PI / 6));
    ctx.lineTo(toX - headLen * Math.cos(angle + Math.PI / 6), toY - headLen * Math.sin(angle + Math.PI / 6));
    ctx.closePath();
    ctx.fill();

    ctx.restore();
  }

  hexToRgba(hex, alpha = 1) {
    let c = hex.replace('#', '');
    if (c.length === 3) c = c.split('').map(x => x + x).join('');
    const num = parseInt(c, 16);
    const r = (num >> 16) & 255;
    const g = (num >> 8) & 255;
    const b = num & 255;
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
  }

  formatDistance(meters) {
    if (meters >= 1.496e11) return `${(meters / 1.496e11).toFixed(2)} AU`;
    if (meters >= 1e6) return `${(meters / 1e3).toLocaleString()} km`;
    if (meters >= 1e3) return `${(meters / 1e3).toFixed(1)} km`;
    return `${meters.toFixed(0)} m`;
  }

  formatVelocity(mPerSec) {
    if (mPerSec >= 1000) return `${(mPerSec / 1000).toFixed(2)} km/s`;
    return `${mPerSec.toFixed(1)} m/s`;
  }

  formatMass(kg) {
    if (kg >= 1.989e30) return `${(kg / 1.989e30).toFixed(2)} M☉ (태양)`;
    if (kg >= 1.898e27) return `${(kg / 1.898e27).toFixed(2)} M♃ (목성)`;
    if (kg >= 5.972e24) return `${(kg / 5.972e24).toFixed(2)} M⊕ (지구)`;
    if (kg >= 7.342e22) return `${(kg / 7.342e22).toFixed(2)} M☽ (달)`;
    if (kg >= 1e12) return `${(kg / 1e12).toFixed(1)}조 톤 (소행성급)`;
    if (kg >= 1e9) return `${(kg / 1e9).toFixed(1)}백만 톤 (소행성급)`;
    if (kg >= 1e6) return `${(kg / 1e3).toLocaleString()} 톤 (천 톤급)`;
    if (kg >= 10000) return `${(kg / 1e3).toFixed(1)} 톤 (10톤급)`;
    if (kg >= 1000) return `${(kg / 1e3).toFixed(2)} 톤 (1톤급)`;
    if (kg >= 100) return `${kg.toFixed(0)} kg (100kg급)`;
    if (kg >= 1) return `${kg.toFixed(1)} kg`;
    return `${kg.toFixed(2)} kg`;
  }
}

