import { Vector2 } from './Vector2.js';
import { CelestialBody } from './CelestialBody.js';
import { KeplerSolver } from './KeplerSolver.js';

export class GravityEngine {
  constructor() {
    // 실제 우주 만유인력 상수 G (m^3 kg^-1 s^-2)
    this.G = 6.67430e-11;

    // 우주에 존재하는 천체 목록
    this.bodies = [];

    // 시뮬레이션 상태
    this.simulatedTime = 0; // 초 단위 누적 시간
    this.timeScale = 86400; // 기본 배속: 1초 = 1일 (86,400초)
    this.isPaused = false;
    this.enableCollisions = true; // 충돌 합체 허용 여부
    this.onCollision = null; // 충돌 발생 시 콜백 리스너

    // 수치 안정성을 위한 서브스텝 설정 (초고속 배속 지원)
    this.maxSubsteps = 600;
  }

  addBody(body) {
    this.bodies.push(body);
    this.computeAccelerations();
    return body;
  }

  removeBody(id) {
    const idx = this.bodies.findIndex(b => b.id === id);
    if (idx !== -1) {
      this.bodies.splice(idx, 1);
      this.computeAccelerations();
    }
  }

  clear() {
    this.bodies = [];
    this.simulatedTime = 0;
  }

  computeAccelerations() {
    // 가속도 초기화
    for (const body of this.bodies) {
      body.acceleration.set(0, 0);
    }

    const n = this.bodies.length;
    for (let i = 0; i < n; i++) {
      const b1 = this.bodies[i];
      for (let j = i + 1; j < n; j++) {
        const b2 = this.bodies[j];

        const dx = b2.position.x - b1.position.x;
        const dy = b2.position.y - b1.position.y;
        const distSq = dx * dx + dy * dy;
        const dist = Math.sqrt(distSq);

        if (dist === 0) continue;

        // 천체의 실제 물리적 반지름을 반영한 적응형 소프트닝 (특이점/무한대 가속도 폭발 완벽 차단)
        const combinedRadius = b1.radius + b2.radius;
        const softening = Math.max(1e5, combinedRadius * 0.6); // 천체 크기 기반
        const effectiveDistSq = distSq + softening * softening;

        // F = G * m1 * m2 / (r^2 + ε^2)
        const forceMagnitude = (this.G * b1.mass * b2.mass) / effectiveDistSq;

        // 단위 방향 벡터
        const nx = dx / dist;
        const ny = dy / dist;

        if (!b1.fixed && b1.mass > 0) {
          b1.acceleration.x += (forceMagnitude / b1.mass) * nx;
          b1.acceleration.y += (forceMagnitude / b1.mass) * ny;
        }

        if (!b2.fixed && b2.mass > 0) {
          b2.acceleration.x -= (forceMagnitude / b2.mass) * nx;
          b2.acceleration.y -= (forceMagnitude / b2.mass) * ny;
        }
      }
    }
  }

  // 연속 충돌 검사 (Continuous Collision Detection, CCD)
  // 고속 이동 시 한 스텝만에 상대방을 뚫고 지나가는 터널링을 100% 감지
  checkContinuousCollisions(prevPositions) {
    if (!this.enableCollisions || this.bodies.length < 2) return false;

    for (let i = 0; i < this.bodies.length; i++) {
      for (let j = i + 1; j < this.bodies.length; j++) {
        const b1 = this.bodies[i];
        const b2 = this.bodies[j];

        const prevP1 = prevPositions.get(b1.id) || b1.position;
        const prevP2 = prevPositions.get(b2.id) || b2.position;
        const currP1 = b1.position;
        const currP2 = b2.position;

        const combinedRadius = b1.radius + b2.radius;

        // 1. 현재 스냅샷 거리 검사
        const currDist = currP1.distanceTo(currP2);
        let hasCollided = (currDist <= combinedRadius);

        // 2. 이동 경로(선분) 터널링 검사
        if (!hasCollided) {
          const relPrevX = prevP1.x - prevP2.x;
          const relPrevY = prevP1.y - prevP2.y;
          const relCurrX = currP1.x - currP2.x;
          const relCurrY = currP1.y - currP2.y;

          const dRelX = relCurrX - relPrevX;
          const dRelY = relCurrY - relPrevY;
          const dRelSq = dRelX * dRelX + dRelY * dRelY;

          if (dRelSq > 0) {
            let tMin = -(relPrevX * dRelX + relPrevY * dRelY) / dRelSq;
            tMin = Math.max(0, Math.min(1, tMin));

            const closestRelX = relPrevX + tMin * dRelX;
            const closestRelY = relPrevY + tMin * dRelY;
            const closestDistSq = closestRelX * closestRelX + closestRelY * closestRelY;

            if (closestDistSq <= combinedRadius * combinedRadius) {
              hasCollided = true;
            }
          }
        }

        if (hasCollided) {
          // 완전 비탄성 충돌 (합체 및 운동량 보존)
          this.mergeBodies(b1, b2);
          return true;
        }
      }
    }
    return false;
  }

  // 두 천체 병합 처리 (완전 비탄성 충돌 & 운동량 보존)
  mergeBodies(b1, b2) {
    const totalMass = b1.mass + b2.mass;

    // 운동량 보존: v_new = (m1*v1 + m2*v2) / (m1 + m2)
    const newVx = (b1.mass * b1.velocity.x + b2.mass * b2.velocity.x) / totalMass;
    const newVy = (b1.mass * b1.velocity.y + b2.mass * b2.velocity.y) / totalMass;

    // 질량 중심 위치
    const newX = (b1.mass * b1.position.x + b2.mass * b2.position.x) / totalMass;
    const newY = (b1.mass * b1.position.y + b2.mass * b2.position.y) / totalMass;

    const dominant = b1.mass >= b2.mass ? b1 : b2;
    const absorbed = b1.mass >= b2.mass ? b2 : b1;

    dominant.mass = totalMass;
    dominant.position.set(newX, newY);
    dominant.velocity.set(newVx, newVy);
    dominant.updateRadius();

    this.removeBody(absorbed.id);

    if (typeof this.onCollision === 'function') {
      this.onCollision(dominant, absorbed);
    }
  }

  // 1회의 Velocity Verlet 서브스텝 적분 (연속 충돌 검사 통합)
  stepVerlet(dt) {
    const halfDt = 0.5 * dt;

    // 이동 전 위치 기록 (CCD 용)
    const prevPositions = new Map();
    for (const b of this.bodies) {
      prevPositions.set(b.id, b.position.clone());
    }

    // 1. 위치 업데이트 & 중간 속도: v(t + dt/2) = v(t) + a(t) * dt/2
    for (const b of this.bodies) {
      if (b.fixed) continue;
      b.position.x += b.velocity.x * dt + 0.5 * b.acceleration.x * dt * dt;
      b.position.y += b.velocity.y * dt + 0.5 * b.acceleration.y * dt * dt;
      b.velocity.x += b.acceleration.x * halfDt;
      b.velocity.y += b.acceleration.y * halfDt;
    }

    // 2. 이동 경로 상의 충돌 체크 (터널링 방지)
    const collisionOccurred = this.checkContinuousCollisions(prevPositions);
    if (collisionOccurred) {
      this.computeAccelerations();
      return;
    }

    // 3. 새로운 위치에서의 가속도 재계산
    this.computeAccelerations();

    // 4. 최종 속도 업데이트: v(t + dt) = v(t + dt/2) + a(t + dt) * dt/2
    for (const b of this.bodies) {
      if (b.fixed) continue;
      b.velocity.x += b.acceleration.x * halfDt;
      b.velocity.y += b.acceleration.y * halfDt;
    }
  }

  // 매 프레임 호출되는 메인 업데이트 함수 (하이브리드 케플러-베를레 솔버)
  update(realDeltaTimeSec) {
    if (this.isPaused || this.bodies.length === 0) return;

    const targetSimDt = realDeltaTimeSec * this.timeScale;
    if (targetSimDt <= 0) return;

    // --- 초고속 배속 케플러 완전해 (하이브리드 모드) ---
    // 2체 중력 시스템이 구속 궤도(타원/원)일 때,
    // 1프레임 동안 공전 주기의 2.5% 이상을 점프할 정도로 초고속 배속인 경우:
    // 수치 적분의 이산화 오차(다각형 붕괴 및 발산)를 원천 차단하기 위해
    // 수학적 완전해(Kepler exact analytic solution)로 전파합니다.
    if (this.bodies.length === 2 && KeplerSolver.isBoundOrbit(this.bodies[0], this.bodies[1], this.G)) {
      const period = KeplerSolver.getOrbitalPeriod(this.bodies[0], this.bodies[1], this.G);
      if (period > 0 && targetSimDt >= period * 0.02) {
        const success = KeplerSolver.propagate(this.bodies[0], this.bodies[1], this.G, targetSimDt);
        if (success) {
          this.computeAccelerations();
          this.simulatedTime += targetSimDt;

          // 초고속 배속에서도 궤적 기록
          for (const b of this.bodies) {
            b.recordTrail();
          }
          return;
        }
      }
    }

    // 일반 수치 적분 모드 (저/중속 배속 및 3체 이상 N-body)
    let minDistance = Infinity;
    let minCombinedRadius = 1e6;
    let maxVelocity = 1;

    for (let i = 0; i < this.bodies.length; i++) {
      const v = this.bodies[i].velocity.magnitude();
      if (v > maxVelocity) maxVelocity = v;

      for (let j = i + 1; j < this.bodies.length; j++) {
        const d = this.bodies[i].position.distanceTo(this.bodies[j].position);
        if (d < minDistance) {
          minDistance = d;
          minCombinedRadius = this.bodies[i].radius + this.bodies[j].radius;
        }
      }
    }

    // 천체가 서로 근접할 때 시간 간격을 동적으로 축소
    const contactMargin = Math.max(minCombinedRadius, minDistance - minCombinedRadius);
    let safeSubstepDt = Math.max(0.5, (contactMargin / maxVelocity) * 0.1);

    // 서브스텝 수 결정 (최소 2, 최대 this.maxSubsteps)
    let steps = Math.ceil(targetSimDt / safeSubstepDt);
    if (steps < 2) steps = 2;
    if (steps > this.maxSubsteps) steps = this.maxSubsteps;

    const subDt = targetSimDt / steps;

    for (let s = 0; s < steps; s++) {
      if (this.bodies.length === 0) break;
      this.stepVerlet(subDt);
    }

    this.simulatedTime += targetSimDt;

    // 궤적 기록
    for (const b of this.bodies) {
      b.recordTrail();
    }
  }

  // 질량 중심(Center of Mass) 계산
  getCenterOfMass() {
    let totalMass = 0;
    let comX = 0;
    let comY = 0;

    for (const b of this.bodies) {
      totalMass += b.mass;
      comX += b.mass * b.position.x;
      comY += b.mass * b.position.y;
    }

    if (totalMass === 0) return new Vector2(0, 0);
    return new Vector2(comX / totalMass, comY / totalMass);
  }

  // 총 역학적 에너지 계산 (운동에너지 + 위치에너지)
  getTotalEnergy() {
    let kinetic = 0;
    let potential = 0;

    const n = this.bodies.length;
    for (let i = 0; i < n; i++) {
      const b1 = this.bodies[i];
      // K = 1/2 * m * v^2
      kinetic += 0.5 * b1.mass * b1.velocity.magnitudeSquared();

      for (let j = i + 1; j < n; j++) {
        const b2 = this.bodies[j];
        const dist = b1.position.distanceTo(b2.position);
        if (dist > 0) {
          // U = - G * m1 * m2 / r
          potential -= (this.G * b1.mass * b2.mass) / dist;
        }
      }
    }

    return { kinetic, potential, total: kinetic + potential };
  }

  // 두 물체 사이의 거리 및 중력 계산 (임의의 두 천체 id1, id2 지정 가능)
  getTwoBodyMetrics(id1 = null, id2 = null) {
    if (this.bodies.length < 2) return null;

    let b1 = id1 ? this.bodies.find(b => b.id === id1) : null;
    let b2 = id2 ? this.bodies.find(b => b.id === id2) : null;

    // 전달된 id가 없거나 유효하지 않으면 기본 처음 두 천체 선택
    if (!b1 || !b2 || b1.id === b2.id) {
      b1 = this.bodies[0];
      b2 = this.bodies[1];
    }

    const dist = b1.position.distanceTo(b2.position);
    const force = dist > 0 ? (this.G * b1.mass * b2.mass) / (dist * dist) : 0;

    return {
      distance: dist,
      force: force,
      body1: b1,
      body2: b2
    };
  }
}

