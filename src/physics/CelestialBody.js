import { Vector2 } from './Vector2.js';

export class CelestialBody {
  constructor({
    id = `body_${Date.now()}_${Math.floor(Math.random() * 1000)}`,
    name = '천체',
    position = new Vector2(),
    velocity = new Vector2(),
    mass = 5.972e24, // kg (기본: 지구 질량)
    radius = null,    // m (지정하지 않으면 표준 평균 밀도로 계산)
    color = '#4fa3ff',
    density = 5515,  // kg/m^3 (기본: 지구 평균 밀도)
    fixed = false
  }) {
    this.id = id;
    this.name = name;
    this.position = position.clone();
    this.velocity = velocity.clone();
    this.acceleration = new Vector2();
    this.mass = mass;
    this.density = density;
    this.fixed = fixed;
    this.color = color;

    // 질량과 밀도로부터 반지름 계산 (R = (3M / 4πρ)^(1/3))
    if (radius !== null && radius > 0) {
      this.radius = radius;
    } else {
      this.calculateRadiusFromDensity();
    }

    // 궤적 포인트 기록 (최대 1200포인트)
    this.trail = [];
    this.maxTrailLength = 1200;
    this.trailSampleCounter = 0;
  }

  calculateRadiusFromDensity() {
    if (this.mass <= 0) {
      this.radius = 1e5;
      return;
    }
    const volume = this.mass / this.density;
    this.radius = Math.cbrt((3 * volume) / (4 * Math.PI));
  }

  updateRadius() {
    this.calculateRadiusFromDensity();
  }

  recordTrail(sampleInterval = 2) {
    this.trailSampleCounter++;
    if (this.trailSampleCounter % sampleInterval === 0) {
      this.trail.push(this.position.clone());
      if (this.trail.length > this.maxTrailLength) {
        this.trail.shift();
      }
    }
  }

  clearTrail() {
    this.trail = [];
  }
}

