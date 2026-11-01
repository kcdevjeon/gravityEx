import { Vector2 } from '../physics/Vector2.js';

export class Camera {
  constructor(canvas) {
    this.canvas = canvas;

    // 월드 좌표계 상에서 화면 중심이 가리키는 위치 (미터 단위)
    this.center = new Vector2(0, 0);

    // 줌 스케일: 1 픽셀당 미터 수 (m / pixel)
    // 작을수록 확대(Zoom In), 클수록 축소(Zoom Out)
    this.metersPerPixel = 1e6; // 기본: 1픽셀 = 1,000km

    // 추적할 천체 id (null이면 자유 카메라)
    this.trackingBodyId = null;
    this.trackCenterOfMass = false;
  }

  getViewportWidth() {
    return this.canvas.clientWidth || window.innerWidth;
  }

  getViewportHeight() {
    return this.canvas.clientHeight || window.innerHeight;
  }

  // 화면 좌표 (CSS 픽셀) -> 월드 좌표 (미터)
  screenToWorld(screenX, screenY) {
    const halfW = this.getViewportWidth() / 2;
    const halfH = this.getViewportHeight() / 2;

    const worldX = this.center.x + (screenX - halfW) * this.metersPerPixel;
    const worldY = this.center.y + (screenY - halfH) * this.metersPerPixel;

    return new Vector2(worldX, worldY);
  }

  // 월드 좌표 (미터) -> 화면 좌표 (CSS 픽셀)
  worldToScreen(worldX, worldY) {
    const halfW = this.getViewportWidth() / 2;
    const halfH = this.getViewportHeight() / 2;

    const screenX = halfW + (worldX - this.center.x) / this.metersPerPixel;
    const screenY = halfH + (worldY - this.center.y) / this.metersPerPixel;

    return { x: screenX, y: screenY };
  }

  // 줌 조절: 커서 위치(screenX, screenY)에 해당하는 월드 좌표를 정확히 고정
  zoomAt(screenX, screenY, zoomFactor) {
    // 1. 줌 직전 커서 위치의 월드 좌표
    const beforeWorld = this.screenToWorld(screenX, screenY);

    // 2. 새로운 줌 스케일 계산 (한계 범위: 1e2 m/px ~ 1e13 m/px)
    const newMetersPerPixel = Math.max(1e2, Math.min(1e13, this.metersPerPixel * zoomFactor));
    this.metersPerPixel = newMetersPerPixel;

    // 3. 커서 아래의 월드 좌표가 변하지 않도록 center 좌표를 재계산
    // beforeWorld.x = newCenter.x + (screenX - halfW) * newMetersPerPixel
    // => newCenter.x = beforeWorld.x - (screenX - halfW) * newMetersPerPixel
    const halfW = this.getViewportWidth() / 2;
    const halfH = this.getViewportHeight() / 2;

    this.center.x = beforeWorld.x - (screenX - halfW) * newMetersPerPixel;
    this.center.y = beforeWorld.y - (screenY - halfH) * newMetersPerPixel;
  }

  // 카메라 드래그 이동 (팬)
  pan(deltaPixelX, deltaPixelY) {
    this.center.x -= deltaPixelX * this.metersPerPixel;
    this.center.y -= deltaPixelY * this.metersPerPixel;
  }

  // 추적 업데이트
  updateTracking(engine) {
    if (this.trackCenterOfMass) {
      const com = engine.getCenterOfMass();
      // 부드러운 카메라 보간 (Lerp)
      this.center.x += (com.x - this.center.x) * 0.1;
      this.center.y += (com.y - this.center.y) * 0.1;
      return;
    }

    if (this.trackingBodyId) {
      const body = engine.bodies.find(b => b.id === this.trackingBodyId);
      if (body) {
        this.center.x += (body.position.x - this.center.x) * 0.1;
        this.center.y += (body.position.y - this.center.y) * 0.1;
      }
    }
  }

  // 모든 천체가 한 화면에 보이도록 자동 줌 & 포커스
  fitToBodies(bodies) {
    if (!bodies || bodies.length === 0) {
      this.center.set(0, 0);
      this.metersPerPixel = 1e6;
      return;
    }

    if (bodies.length === 1) {
      this.center.set(bodies[0].position.x, bodies[0].position.y);
      return;
    }

    let minX = Infinity, maxX = -Infinity;
    let minY = Infinity, maxY = -Infinity;

    for (const b of bodies) {
      if (b.position.x < minX) minX = b.position.x;
      if (b.position.x > maxX) maxX = b.position.x;
      if (b.position.y < minY) minY = b.position.y;
      if (b.position.y > maxY) maxY = b.position.y;
    }

    this.center.set((minX + maxX) / 2, (minY + maxY) / 2);

    const spanX = Math.max(maxX - minX, 1e7);
    const spanY = Math.max(maxY - minY, 1e7);

    const pad = 1.6; // 여백 비율
    const scaleX = (spanX * pad) / this.getViewportWidth();
    const scaleY = (spanY * pad) / this.getViewportHeight();

    this.metersPerPixel = Math.max(scaleX, scaleY);
  }
}

