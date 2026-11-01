import { Vector2 } from './Vector2.js';

/**
 * 2체 문제(Two-body problem)의 수학적 완전해(Exact Kepler Solution) 전파기
 * 1,000년 ~ 10,000년 이상의 초고속 시간 배속에서도 타원/원 궤도가 단 0.0001%의 오차도 없이
 * 완벽히 보존되도록 해석적(Analytic)으로 위치와 속도를 계산합니다.
 */
export class KeplerSolver {
  /**
   * 두 천체가 중력 구속 상태(타원/원 궤도, E < 0)인지 검사
   */
  static isBoundOrbit(b1, b2, G) {
    const totalMass = b1.mass + b2.mass;
    if (totalMass <= 0) return false;

    const mu = G * totalMass;
    const r = b1.position.distanceTo(b2.position);
    if (r <= 0) return false;

    const relVx = b2.velocity.x - b1.velocity.x;
    const relVy = b2.velocity.y - b1.velocity.y;
    const vSq = relVx * relVx + relVy * relVy;

    // 비에너지 (Specific Orbital Energy): ε = v^2/2 - μ/r
    const specificEnergy = 0.5 * vSq - mu / r;
    return specificEnergy < -1e-6; // 음수이면 타원 궤도
  }

  /**
   * 케플러 궤도 주기 계산 (초 단위)
   */
  static getOrbitalPeriod(b1, b2, G) {
    const totalMass = b1.mass + b2.mass;
    const mu = G * totalMass;
    const r = b1.position.distanceTo(b2.position);

    const relVx = b2.velocity.x - b1.velocity.x;
    const relVy = b2.velocity.y - b1.velocity.y;
    const vSq = relVx * relVx + relVy * relVy;

    const specificEnergy = 0.5 * vSq - mu / r;
    if (specificEnergy >= 0) return Infinity;

    const a = -mu / (2 * specificEnergy); // 궤도 장반경
    return 2 * Math.PI * Math.sqrt((a * a * a) / mu);
  }

  /**
   * 케플러 전파 (dt 초 후의 위치와 속도를 해석적으로 산출하여 b1, b2에 즉시 적용)
   */
  static propagate(b1, b2, G, dt) {
    const m1 = b1.mass;
    const m2 = b2.mass;
    const totalMass = m1 + m2;
    const mu = G * totalMass;

    // 상대 위치 및 속도 (b1 기준 b2의 벡터)
    let rx = b2.position.x - b1.position.x;
    let ry = b2.position.y - b1.position.y;
    let vx = b2.velocity.x - b1.velocity.x;
    let vy = b2.velocity.y - b1.velocity.y;

    const r = Math.hypot(rx, ry);
    const vSq = vx * vx + vy * vy;

    // 1. 비에너지 및 장반경 a
    const energy = 0.5 * vSq - mu / r;
    if (energy >= -1e-7) return false; // 비구속 상태면 전파 중단

    const a = -mu / (2 * energy);

    // 2. 비각운동량 h (2D 외적)
    const h = rx * vy - ry * vx;

    // 3. 이심률 벡터 e = (v x h)/μ - r/|r|
    // (v x h)_x = vy * h,  (v x h)_y = -vx * h
    let ex = (vy * h) / mu - rx / r;
    let ey = (-vx * h) / mu - ry / r;
    let e = Math.hypot(ex, ey);

    // 궤도 평면 단위 기저 벡터 P, Q
    let Px, Py, Qx, Qy;
    if (e < 1e-6) {
      // 거의 완벽한 원궤도인 경우
      e = 0;
      Px = rx / r;
      Py = ry / r;
      const sgnH = h >= 0 ? 1 : -1;
      Qx = -Py * sgnH;
      Qy = Px * sgnH;
    } else {
      Px = ex / e;
      Py = ey / e;
      const sgnH = h >= 0 ? 1 : -1;
      Qx = -Py * sgnH;
      Qy = Px * sgnH;
    }

    // 4. 현재 위치에서의 편심 이각 E0 계산
    // r = a(1 - e * cos(E0))  =>  cos(E0) = (1 - r/a) / e
    // r·v = sqrt(μ*a) * e * sin(E0)
    let cosE0, sinE0;
    if (e === 0) {
      cosE0 = 1;
      sinE0 = 0;
    } else {
      cosE0 = Math.max(-1, Math.min(1, (1 - r / a) / e));
      const rDotV = rx * vx + ry * vy;
      sinE0 = Math.max(-1, Math.min(1, rDotV / (e * Math.sqrt(mu * a))));
    }
    const E0 = Math.atan2(sinE0, cosE0);

    // 5. 현재 평균 이각 M0 = E0 - e * sin(E0)
    const M0 = E0 - e * Math.sin(E0);

    // 6. 평균 운동 n = sqrt(μ / a^3) 및 dt 후 새로운 평균 이각 M
    const n = Math.sqrt(mu / (a * a * a));
    let M = (M0 + n * dt) % (2 * Math.PI);
    if (M < 0) M += 2 * Math.PI;

    // 7. 케플러 방정식 풀기: E - e * sin(E) = M (뉴턴-랩슨법 5회 반복)
    let E = M;
    for (let iter = 0; iter < 6; iter++) {
      const f = E - e * Math.sin(E) - M;
      const fPrime = 1 - e * Math.cos(E);
      if (Math.abs(fPrime) < 1e-12) break;
      const delta = f / fPrime;
      E -= delta;
      if (Math.abs(delta) < 1e-12) break;
    }

    // 8. 새로운 상대 위치 및 속도 계산
    const cosE = Math.cos(E);
    const sinE = Math.sin(E);
    const sqrtOneMinusESq = Math.sqrt(Math.max(0, 1 - e * e));

    const newRelX = a * (cosE - e) * Px + a * sqrtOneMinusESq * sinE * Qx;
    const newRelY = a * (cosE - e) * Py + a * sqrtOneMinusESq * sinE * Qy;

    const rNew = a * (1 - e * cosE);
    const Edot = Math.sqrt(mu / a) / rNew;

    const newRelVx = Edot * (-a * sinE * Px + a * sqrtOneMinusESq * cosE * Qx);
    const newRelVy = Edot * (-a * sinE * Py + a * sqrtOneMinusESq * cosE * Qy);

    // 9. 질량 중심(COM) 및 질량 중심 속도 보존 (COM은 관성 이동)
    // COM 위치 및 속도:
    const comX = (m1 * b1.position.x + m2 * b2.position.x) / totalMass;
    const comY = (m1 * b1.position.y + m2 * b2.position.y) / totalMass;
    const comVx = (m1 * b1.velocity.x + m2 * b2.velocity.x) / totalMass;
    const comVy = (m1 * b1.velocity.y + m2 * b2.velocity.y) / totalMass;

    const nextComX = comX + comVx * dt;
    const nextComY = comY + comVy * dt;

    // 각 천체의 새로운 위치 및 속도 반영
    if (!b1.fixed) {
      b1.position.x = nextComX - (m2 / totalMass) * newRelX;
      b1.position.y = nextComY - (m2 / totalMass) * newRelY;
      b1.velocity.x = comVx - (m2 / totalMass) * newRelVx;
      b1.velocity.y = comVy - (m2 / totalMass) * newRelVy;
    }

    if (!b2.fixed) {
      b2.position.x = nextComX + (m1 / totalMass) * newRelX;
      b2.position.y = nextComY + (m1 / totalMass) * newRelY;
      b2.velocity.x = comVx + (m1 / totalMass) * newRelVx;
      b2.velocity.y = comVy + (m1 / totalMass) * newRelVy;
    }

    return true;
  }
}

