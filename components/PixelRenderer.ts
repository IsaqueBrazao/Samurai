// Realistic Japanese Samurai Duel Renderer for "Load, Aim... Shoot!"
// Direct 32-bit hardware-accelerated transparent PNG sprites.
// Completely solid, opaque warrior characters, large scale, anchored to the ground.

export type CharacterAction = 'idle' | 'aim' | 'shoot' | 'deflect' | 'hit' | 'dead' | 'victory';

export interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  color: string;
  size: number;
  gravity?: number;
  rotation?: number;
  vRot?: number;
}

export interface SakuraPetal {
  x: number;
  y: number;
  size: number;
  speedY: number;
  speedX: number;
  angle: number;
  angularSpeed: number;
  color: string;
}

export interface Bullet {
  x: number;
  y: number;
  targetX: number;
  progress: number;
  direction: 1 | -1;
  speed: number;
  deflected: boolean;
  deflectAngle?: number;
}

export class PixelGameRenderer {
  private bgImage: HTMLImageElement | null = null;
  private bgLoaded = false;
  private sakuraPetals: SakuraPetal[] = [];

  // 100% Solid Transparent PNG Sprites
  private idleImg: HTMLImageElement | null = null;
  private aimImg: HTMLImageElement | null = null;
  private deflectImg: HTMLImageElement | null = null;
  private deadImg: HTMLImageElement | null = null;

  constructor() {
    if (typeof window !== 'undefined') {
      // 1. Arena Background
      this.bgImage = new Image();
      this.bgImage.src = '/images/japanese_bg.jpg';
      this.bgImage.onload = () => {
        this.bgLoaded = true;
      };

      // 2. Direct 100% Solid Pre-cut PNG Character Sprites
      this.idleImg = new Image();
      this.idleImg.src = '/images/samurai_idle.png';

      this.aimImg = new Image();
      this.aimImg.src = '/images/samurai_aim.png';

      this.deflectImg = new Image();
      this.deflectImg.src = '/images/samurai_deflect.png';

      this.deadImg = new Image();
      this.deadImg.src = '/images/samurai_dead.png';

      // 3. Floating Sakura Petals
      for (let i = 0; i < 45; i++) {
        this.sakuraPetals.push({
          x: Math.random() * 960,
          y: Math.random() * 540,
          size: 3 + Math.random() * 3,
          speedY: 0.6 + Math.random() * 1.2,
          speedX: 0.8 + Math.random() * 1.5,
          angle: Math.random() * Math.PI * 2,
          angularSpeed: (Math.random() - 0.5) * 0.05,
          color: Math.random() > 0.4 ? '#fbcfe8' : '#f472b6',
        });
      }
    }
  }

  // Draw Japanese background + falling cherry blossom petals
  public drawBackground(ctx: CanvasRenderingContext2D, width: number, height: number, time: number) {
    if (this.bgLoaded && this.bgImage) {
      ctx.drawImage(this.bgImage, 0, 0, width, height);
      ctx.fillStyle = 'rgba(15, 23, 42, 0.06)';
      ctx.fillRect(0, 0, width, height);
    } else {
      // Procedural Sunset & Mount Fuji
      const grad = ctx.createLinearGradient(0, 0, 0, height);
      grad.addColorStop(0, '#1e1b4b');
      grad.addColorStop(0.3, '#701a75');
      grad.addColorStop(0.6, '#be185d');
      grad.addColorStop(0.85, '#f43f5e');
      grad.addColorStop(1, '#fda4af');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, width, height);

      // Distant Mount Fuji Silhouette
      ctx.fillStyle = '#4a044e';
      ctx.beginPath();
      ctx.moveTo(width * 0.22, height * 0.72);
      ctx.lineTo(width * 0.44, height * 0.36);
      ctx.lineTo(width * 0.56, height * 0.36);
      ctx.lineTo(width * 0.78, height * 0.72);
      ctx.closePath();
      ctx.fill();

      // Fuji Snowcap
      ctx.fillStyle = '#fce7f3';
      ctx.beginPath();
      ctx.moveTo(width * 0.44, height * 0.36);
      ctx.lineTo(width * 0.56, height * 0.36);
      ctx.lineTo(width * 0.61, height * 0.45);
      ctx.lineTo(width * 0.39, height * 0.45);
      ctx.closePath();
      ctx.fill();

      // Giant Red Sun
      ctx.fillStyle = '#e11d48';
      ctx.beginPath();
      ctx.arc(width * 0.5, height * 0.42, height * 0.16, 0, Math.PI * 2);
      ctx.fill();
    }

    // Ground platform & traditional stone pavement (placed lower as requested)
    const groundY = height * 0.81;
    ctx.fillStyle = 'rgba(10, 10, 15, 0.45)';
    ctx.fillRect(0, groundY, width, height - groundY);

    ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
    ctx.fillRect(0, groundY, width, 4);

    // Falling Sakura Petals
    this.sakuraPetals.forEach((petal) => {
      petal.x += petal.speedX;
      petal.y += petal.speedY;
      petal.angle += petal.angularSpeed;

      if (petal.x > width + 20) petal.x = -20;
      if (petal.y > height + 20) {
        petal.y = -10;
        petal.x = Math.random() * width;
      }

      ctx.save();
      ctx.translate(petal.x, petal.y);
      ctx.rotate(petal.angle);
      ctx.fillStyle = petal.color;
      ctx.beginPath();
      ctx.ellipse(0, 0, petal.size, petal.size * 0.5, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    });
  }

  // Draw 100% Solid, Larger, Grounded Realistic Samurai Character
  public drawSamurai(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    player: 1 | 2,
    action: CharacterAction,
    animFrame: number,
    scale: number = 2.6
  ) {
    ctx.save();
    ctx.translate(x, y);
    ctx.globalAlpha = 1.0;
    ctx.globalCompositeOperation = 'source-over';

    // Direction: Player 1 faces right (1), Player 2 faces left (-1)
    const dir = player === 1 ? 1 : -1;
    const isP1 = player === 1;

    // Contact shadow beneath the feet (larger for bigger character)
    ctx.fillStyle = 'rgba(0, 0, 0, 0.55)';
    ctx.beginPath();
    ctx.ellipse(0, 4, 38, 9, 0, 0, Math.PI * 2);
    ctx.fill();

    // Minimized breathing animation (barely noticeable martial poise)
    const bobY = action === 'idle' ? Math.sin(animFrame * 0.03) * 0.4 : 0;

    // ==========================================
    // 1. DEAD / FALLEN POSE (REALISTIC DEFEAT)
    // ==========================================
    if (action === 'dead') {
      // Draw realistic blood pool on the stone
      ctx.fillStyle = '#4c0519';
      ctx.beginPath();
      ctx.ellipse(0, 2, 75, 22, 0, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = '#881337';
      ctx.beginPath();
      ctx.ellipse(6, 0, 58, 15, 0.08, 0, Math.PI * 2);
      ctx.fill();

      // Blood spatter drops
      ctx.fillStyle = '#9f1239';
      ctx.fillRect(-52, 3, 5, 4);
      ctx.fillRect(58, -4, 6, 4);
      ctx.fillRect(38, 8, 5, 3);

      if (this.deadImg && this.deadImg.complete && this.deadImg.naturalWidth > 0) {
        ctx.save();
        ctx.scale(dir, 1);
        // Larger dead samurai sprite placed lower on ground
        const deadW = 310;
        const deadH = 220;
        ctx.drawImage(this.deadImg, -deadW * 0.48, -deadH + 52, deadW, deadH);
        ctx.restore();
      } else {
        this.drawRealisticDeadFallback(ctx, dir, isP1);
      }

      ctx.restore();
      return;
    }

    // Stagger rotation when hit
    if (action === 'hit') {
      ctx.translate(-12, 0);
      ctx.rotate((-dir * 0.35 * Math.PI) / 4);
    }

    // ==========================================
    // 2. ACTIVE COMBAT POSES (IDLE, AIM, DEFLECT)
    // ==========================================
    let targetImg: HTMLImageElement | null = null;
    if (action === 'aim' || action === 'shoot') {
      targetImg = this.aimImg;
    } else if (action === 'deflect') {
      targetImg = this.deflectImg;
    } else {
      targetImg = this.idleImg;
    }

    if (targetImg && targetImg.complete && targetImg.naturalWidth > 0) {
      ctx.save();
      ctx.translate(0, -bobY);
      ctx.scale(dir, 1);

      // Substantially larger samurai sprite: 235x265 (was 165x185)
      const spriteW = 235;
      const spriteH = 265;

      // Positioned lower so feet anchor firmly onto the stone ground (+34 offset)
      ctx.drawImage(targetImg, -spriteW * 0.48, -spriteH + 34, spriteW, spriteH);

      // Muzzle Flash effect on Shoot
      if (action === 'shoot') {
        const flashX = 92;
        const flashY = -spriteH * 0.52;

        ctx.fillStyle = '#fef08a';
        ctx.beginPath();
        ctx.arc(flashX, flashY, 18, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = '#f97316';
        ctx.beginPath();
        ctx.arc(flashX, flashY, 10, 0, Math.PI * 2);
        ctx.fill();

        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(flashX - 20, flashY);
        ctx.lineTo(flashX + 24, flashY);
        ctx.moveTo(flashX, flashY - 22);
        ctx.lineTo(flashX, flashY + 22);
        ctx.stroke();
      }

      // Iaido Katana Slash Cyan Arc on Deflect
      if (action === 'deflect') {
        ctx.save();
        ctx.strokeStyle = '#38bdf8';
        ctx.lineWidth = 6;
        ctx.shadowColor = '#0284c7';
        ctx.shadowBlur = 18;
        ctx.beginPath();
        ctx.arc(22, -spriteH * 0.5, 72, -Math.PI * 0.7, Math.PI * 0.35);
        ctx.stroke();

        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(22, -spriteH * 0.5, 72, -Math.PI * 0.6, Math.PI * 0.25);
        ctx.stroke();
        ctx.restore();
      }

      ctx.restore();
    } else {
      // Solid vector fallback
      this.drawRealisticStandingFallback(ctx, dir, isP1, action, animFrame, bobY);
    }

    ctx.restore();
  }

  // Realistic Dead Samurai Fallback
  private drawRealisticDeadFallback(ctx: CanvasRenderingContext2D, dir: number, isP1: boolean) {
    ctx.save();
    ctx.scale(dir * 1.3, 1.3);

    const primaryColor = isP1 ? '#1e293b' : '#450a0a';
    const secondaryColor = isP1 ? '#1d4ed8' : '#991b1b';

    ctx.fillStyle = '#0f172a';
    ctx.fillRect(-22, -12, 38, 12);
    ctx.fillStyle = primaryColor;
    ctx.fillRect(-18, -14, 34, 10);
    ctx.fillStyle = secondaryColor;
    ctx.fillRect(-8, -16, 20, 9);

    ctx.fillStyle = '#f1f5f9';
    ctx.fillRect(-28, -8, 8, 6);
    ctx.fillStyle = '#78350f';
    ctx.fillRect(-30, -4, 9, 3);

    ctx.fillStyle = secondaryColor;
    ctx.fillRect(8, -10, 16, 6);
    ctx.fillStyle = '#fcd34d';
    ctx.fillRect(23, -9, 6, 5);

    ctx.fillStyle = '#0f172a';
    ctx.fillRect(16, -18, 12, 10);
    ctx.fillStyle = '#fcd34d';
    ctx.fillRect(20, -16, 8, 8);
    ctx.fillStyle = '#000000';
    ctx.fillRect(23, -13, 4, 1);

    ctx.fillStyle = '#f8fafc';
    ctx.fillRect(4, -4, 28, 2);
    ctx.fillStyle = '#d97706';
    ctx.fillRect(3, -6, 3, 6);
    ctx.fillStyle = '#0f172a';
    ctx.fillRect(-4, -5, 7, 4);

    ctx.fillStyle = isP1 ? '#92400e' : '#581c87';
    ctx.beginPath();
    ctx.moveTo(-36, 0);
    ctx.lineTo(-20, -18);
    ctx.lineTo(-4, 0);
    ctx.closePath();
    ctx.fill();

    ctx.restore();
  }

  // Realistic Standing Samurai Fallback
  private drawRealisticStandingFallback(
    ctx: CanvasRenderingContext2D,
    dir: number,
    isP1: boolean,
    action: CharacterAction,
    animFrame: number,
    bobY: number
  ) {
    ctx.save();
    ctx.scale(dir * 3.4, 3.4);

    const primaryRobe = isP1 ? '#1e293b' : '#3f0f15';
    const secondaryRobe = isP1 ? '#1d4ed8' : '#991b1b';
    const sashColor = isP1 ? '#e2e8f0' : '#d97706';

    ctx.translate(0, -bobY);

    // Hakama Trousers
    ctx.fillStyle = '#09090b';
    ctx.fillRect(-9, -18, 7, 18);
    ctx.fillRect(2, -18, 7, 18);

    // Tabi & Waraji
    ctx.fillStyle = '#f1f5f9';
    ctx.fillRect(-9, -5, 7, 4);
    ctx.fillRect(2, -5, 7, 4);
    ctx.fillStyle = '#78350f';
    ctx.fillRect(-10, -1, 9, 2);
    ctx.fillRect(1, -1, 9, 2);

    // Kimono Jacket
    ctx.fillStyle = secondaryRobe;
    ctx.fillRect(-10, -42, 20, 24);
    ctx.fillStyle = primaryRobe;
    ctx.fillRect(-8, -40, 16, 20);

    // Obi Sash
    ctx.fillStyle = sashColor;
    ctx.fillRect(-10, -28, 20, 6);

    // Katana at hip
    ctx.fillStyle = '#09090b';
    ctx.save();
    ctx.rotate(0.28);
    ctx.fillRect(-18, -26, 26, 3);
    ctx.fillStyle = '#d97706';
    ctx.fillRect(-19, -27, 2, 5);
    ctx.restore();

    // Head & Straw Hat
    ctx.fillStyle = '#fcd34d';
    ctx.fillRect(-5, -50, 10, 11);
    ctx.fillStyle = isP1 ? '#92400e' : '#450a0a';
    ctx.beginPath();
    ctx.moveTo(-21, -47);
    ctx.lineTo(0, -62);
    ctx.lineTo(21, -47);
    ctx.closePath();
    ctx.fill();

    // Actions
    if (action === 'aim' || action === 'shoot') {
      ctx.fillStyle = secondaryRobe;
      ctx.fillRect(0, -38, 18, 6);
      ctx.fillStyle = '#fcd34d';
      ctx.fillRect(17, -37, 4, 5);
      ctx.fillStyle = '#78350f';
      ctx.fillRect(18, -35, 4, 7);
      ctx.fillStyle = '#94a3b8';
      ctx.fillRect(20, -38, 14, 4);
    } else if (action === 'deflect') {
      ctx.fillStyle = secondaryRobe;
      ctx.save();
      ctx.translate(6, -34);
      ctx.rotate(-0.85);
      ctx.fillRect(-2, -14, 7, 16);
      ctx.fillStyle = '#f8fafc';
      ctx.fillRect(-1, -54, 3, 38);
      ctx.restore();
    } else {
      ctx.fillStyle = secondaryRobe;
      ctx.fillRect(-7, -36, 7, 14);
      ctx.fillStyle = '#fcd34d';
      ctx.fillRect(-12, -28, 6, 5);
    }

    ctx.restore();
  }

  // Draw Flying Bullet with speed scaling
  public drawBullet(ctx: CanvasRenderingContext2D, bullet: Bullet) {
    ctx.save();
    ctx.translate(bullet.x, bullet.y);

    if (bullet.deflected && bullet.deflectAngle !== undefined) {
      ctx.rotate(bullet.deflectAngle);
    }

    const speedMultiplier = Math.max(1, bullet.speed / 0.016);
    const trailLen = Math.min(54, Math.round(22 * speedMultiplier));
    const isSuperFast = bullet.speed >= 0.024;

    ctx.fillStyle = isSuperFast ? '#ef4444' : '#f59e0b';
    ctx.fillRect(-6, -2, 12, 4);

    ctx.fillStyle = '#fef08a';
    ctx.fillRect(-4, -1, 8, 2);

    const trailGrad = ctx.createLinearGradient(bullet.direction === 1 ? -trailLen : trailLen, 0, 0, 0);
    trailGrad.addColorStop(0, 'rgba(239, 68, 68, 0)');
    trailGrad.addColorStop(1, isSuperFast ? 'rgba(254, 202, 202, 0.95)' : 'rgba(254, 240, 138, 0.85)');
    ctx.fillStyle = trailGrad;

    if (bullet.direction === 1) {
      ctx.fillRect(-trailLen - 6, -2, trailLen, 4);
    } else {
      ctx.fillRect(6, -2, trailLen, 4);
    }

    ctx.restore();
  }

  // Draw Particles (Sparks & Smoke)
  public drawParticles(ctx: CanvasRenderingContext2D, particles: Particle[]) {
    particles.forEach((p) => {
      const alpha = Math.max(0, p.life / p.maxLife);
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.fillStyle = p.color;
      ctx.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size);
      ctx.restore();
    });
  }

  // Spark burst for Katana deflection
  public createDeflectionSparks(x: number, y: number): Particle[] {
    const particles: Particle[] = [];
    const colors = ['#ffffff', '#fef08a', '#38bdf8', '#67e8f9', '#fbbf24'];

    for (let i = 0; i < 30; i++) {
      const angle = (Math.PI * 2 * i) / 30 + (Math.random() - 0.5) * 0.4;
      const speed = 4 + Math.random() * 8;
      particles.push({
        x,
        y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed - 2,
        life: 25 + Math.random() * 20,
        maxLife: 45,
        color: colors[Math.floor(Math.random() * colors.length)],
        size: 2 + Math.random() * 3,
        gravity: 0.18,
      });
    }
    return particles;
  }

  // Gun muzzle smoke
  public createMuzzleSmoke(x: number, y: number, dir: 1 | -1): Particle[] {
    const particles: Particle[] = [];
    for (let i = 0; i < 10; i++) {
      particles.push({
        x: x + dir * 15,
        y,
        vx: dir * (1.5 + Math.random() * 3),
        vy: (Math.random() - 0.5) * 2 - 0.5,
        life: 20 + Math.random() * 15,
        maxLife: 35,
        color: 'rgba(226, 232, 240, 0.7)',
        size: 3 + Math.random() * 4,
      });
    }
    return particles;
  }

  // Impact burst
  public createHitBurst(x: number, y: number): Particle[] {
    const particles: Particle[] = [];
    for (let i = 0; i < 18; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 2 + Math.random() * 5;
      particles.push({
        x,
        y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed - 1,
        life: 20 + Math.random() * 15,
        maxLife: 35,
        color: Math.random() > 0.4 ? '#dc2626' : '#7f1d1d',
        size: 2 + Math.random() * 3,
        gravity: 0.15,
      });
    }
    return particles;
  }
}
