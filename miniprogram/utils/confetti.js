/**
 * 简易彩带效果 (Confetti) for WeChat Mini Program Canvas 2D
 */

const COLORS = ['#58CC02', '#1CB0F6', '#FFC800', '#FF4B4B', '#FFFFFF'];

class Confetti {
  constructor(canvas, ctx) {
    this.canvas = canvas;
    this.ctx = ctx;
    this.particles = [];
    this.animId = null;
    this.isRunning = false;
  }

  createParticle(x, y) {
    const angle = Math.random() * Math.PI * 2;
    const velocity = 2 + Math.random() * 6;
    return {
      x: x,
      y: y,
      color: COLORS[Math.floor(Math.random() * COLORS.length)],
      radius: 4 + Math.random() * 4,
      vx: Math.cos(angle) * velocity,
      vy: Math.sin(angle) * velocity - 4, // Initial upward burst
      gravity: 0.2,
      drag: 0.96,
      rotation: Math.random() * 360,
      rotationSpeed: (Math.random() - 0.5) * 10,
      tilt: Math.random() * 10,
      tiltAngle: Math.random() * Math.PI,
      tiltAngleSpeed: 0.1 + Math.random() * 0.3
    };
  }

  burst(count = 100) {
    const { width, height } = this.canvas;
    const originX = width / 2;
    const originY = height / 3;

    for (let i = 0; i < count; i++) {
      this.particles.push(this.createParticle(originX, originY));
    }

    if (!this.isRunning) {
      this.isRunning = true;
      this.animate();
    }
  }

  update() {
    const { height } = this.canvas;

    for (let i = 0; i < this.particles.length; i++) {
      const p = this.particles[i];
      
      // Physics
      p.vx *= p.drag;
      p.vy *= p.drag;
      p.vy += p.gravity;
      p.x += p.vx;
      p.y += p.vy;
      
      // Rotation & Tilt
      p.rotation += p.rotationSpeed;
      p.tiltAngle += p.tiltAngleSpeed;
      p.y += Math.sin(p.tiltAngle) * 0.5; // Flutter effect

      // Remove off-screen
      if (p.y > height + 20) {
        this.particles.splice(i, 1);
        i--;
      }
    }
  }

  draw() {
    const { width, height } = this.canvas;
    this.ctx.clearRect(0, 0, width, height);

    this.particles.forEach(p => {
      this.ctx.save();
      this.ctx.translate(p.x, p.y);
      this.ctx.rotate((p.rotation * Math.PI) / 180);
      
      this.ctx.fillStyle = p.color;
      
      // Draw confetti shape (simple rectangle/square for "paper" feel)
      const size = p.radius * 2;
      // Simulate 3D flip using scale based on tilt
      const scaleX = Math.cos(p.tiltAngle);
      
      this.ctx.scale(scaleX, 1);
      this.ctx.fillRect(-p.radius, -p.radius, size, size);
      
      this.ctx.restore();
    });
  }

  animate() {
    if (this.particles.length === 0) {
      this.isRunning = false;
      this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
      return;
    }

    this.update();
    this.draw();

    this.canvas.requestAnimationFrame(() => this.animate());
  }

  clear() {
    this.particles = [];
    this.isRunning = false;
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
  }
}

module.exports = Confetti;
