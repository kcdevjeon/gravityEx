export class Vector2 {
  constructor(x = 0, y = 0) {
    this.x = x;
    this.y = y;
  }

  set(x, y) {
    this.x = x;
    this.y = y;
    return this;
  }

  clone() {
    return new Vector2(this.x, this.y);
  }

  add(v) {
    this.x += v.x;
    this.y += v.y;
    return this;
  }

  sub(v) {
    this.x -= v.x;
    this.y -= v.y;
    return this;
  }

  multiplyScalar(s) {
    this.x *= s;
    this.y *= s;
    return this;
  }

  divideScalar(s) {
    if (s !== 0) {
      this.x /= s;
      this.y /= s;
    }
    return this;
  }

  distanceTo(v) {
    return Math.hypot(this.x - v.x, this.y - v.y);
  }

  distanceToSquared(v) {
    const dx = this.x - v.x;
    const dy = this.y - v.y;
    return dx * dx + dy * dy;
  }

  magnitude() {
    return Math.hypot(this.x, this.y);
  }

  magnitudeSquared() {
    return this.x * this.x + this.y * this.y;
  }

  normalize() {
    const mag = this.magnitude();
    if (mag > 0) {
      this.x /= mag;
      this.y /= mag;
    }
    return this;
  }

  dot(v) {
    return this.x * v.x + this.y * v.y;
  }

  static add(a, b) {
    return new Vector2(a.x + b.x, a.y + b.y);
  }

  static sub(a, b) {
    return new Vector2(a.x - b.x, a.y - b.y);
  }

  static multiplyScalar(v, s) {
    return new Vector2(v.x * s, v.y * s);
  }
}

