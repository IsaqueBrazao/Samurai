'use client';

import React, { useEffect, useRef, useState, useCallback } from 'react';
import { Volume2, VolumeX, RotateCcw, User, Users } from 'lucide-react';
import { audioEngine } from '@/lib/audio';
import {
  PixelGameRenderer,
  CharacterAction,
  Bullet,
  Particle,
} from '@/components/PixelRenderer';

type GameMode = '1P_CPU' | '2P_LOCAL';
type RoundPhase =
  | 'STANDBY'
  | 'LOAD'
  | 'AIM'
  | 'SUSPENSE'
  | 'SHOOT_ACTIVE'
  | 'BULLET_FLIGHT'
  | 'ROUND_RESOLVED'
  | 'TIMES_UP'
  | 'MATCH_OVER';

const BASE_BULLET_SPEED = 0.016;
const BULLET_SPEED_STEP = 0.004; // Increases speed on each shot fired without damage
const MAX_BULLET_SPEED = 0.052;

// Clean minimalist text stamp directly rendered on canvas or overlay
function drawJapaneseStamp(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  text: string,
  subtext: string,
  color: string = '#f59e0b'
) {
  ctx.save();
  ctx.translate(x, y);

  // Background calligraphy banner
  ctx.fillStyle = 'rgba(0, 0, 0, 0.65)';
  const boxW = Math.max(160, text.length * 28 + 40);
  ctx.fillRect(-boxW / 2, -32, boxW, 64);

  ctx.strokeStyle = color;
  ctx.lineWidth = 2;
  ctx.strokeRect(-boxW / 2, -32, boxW, 64);

  // Main text
  ctx.fillStyle = color;
  ctx.font = '900 32px monospace';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, 0, -5);

  // Subtext
  if (subtext) {
    ctx.fillStyle = '#ffffff';
    ctx.font = '600 11px monospace';
    ctx.fillText(subtext, 0, 18);
  }

  ctx.restore();
}

// Letter Prompt directly over samurai head (matching the original game mechanic)
function drawSamuraiPrompt(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  keyText: string,
  label: string,
  color: string = '#ffffff'
) {
  ctx.save();
  ctx.translate(x, y);

  // Subtle bounce
  const bounce = Math.sin(Date.now() * 0.02) * 3;
  ctx.translate(0, bounce);

  // Clean prompt badge
  ctx.fillStyle = 'rgba(0, 0, 0, 0.85)';
  ctx.fillRect(-20, -24, 40, 48);

  ctx.strokeStyle = color;
  ctx.lineWidth = 2;
  ctx.strokeRect(-20, -24, 40, 48);

  // Key letter
  ctx.fillStyle = color;
  ctx.font = '900 24px monospace';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(keyText, 0, -3);

  // Tiny label
  ctx.fillStyle = '#f8fafc';
  ctx.font = '700 8px monospace';
  ctx.fillText(label, 0, 14);

  ctx.restore();
}

export default function GameDuel() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const rendererRef = useRef<PixelGameRenderer | null>(null);
  const animFrameIdRef = useRef<number | null>(null);
  const phaseTimerRef = useRef<NodeJS.Timeout | null>(null);
  const shootStartTimeRef = useRef<number>(0);

  // Function refs
  const startRoundRef = useRef<(round: number) => void>(() => {});
  const handleTimesUpRef = useRef<() => void>(() => {});
  const triggerShootRef = useRef<(player: 1 | 2, overrideMs?: number) => void>(() => {});
  const triggerDeflectRef = useRef<(player: 1 | 2) => void>(() => {});

  // State
  const [isMuted, setIsMuted] = useState(false);
  const [gameMode, setGameMode] = useState<GameMode>('1P_CPU');
  const [p1Hearts, setP1Hearts] = useState(3);
  const [p2Hearts, setP2Hearts] = useState(3);
  const [roundNumber, setRoundNumber] = useState(1);
  const [phase, setPhase] = useState<RoundPhase>('STANDBY');
  const [winner, setWinner] = useState<1 | 2 | null>(null);

  // Character Actions (NO WALKING: starts directly in idle)
  const [p1Action, setP1Action] = useState<CharacterAction>('idle');
  const [p2Action, setP2Action] = useState<CharacterAction>('idle');

  // Bullets & Particles
  const bulletRef = useRef<Bullet | null>(null);
  const particlesRef = useRef<Particle[]>([]);
  const bulletSpeedRef = useRef<number>(BASE_BULLET_SPEED);

  // Sound toggle
  const toggleSound = () => {
    const next = !isMuted;
    setIsMuted(next);
    audioEngine.setMuted(next);
  };

  // Initialize renderer
  useEffect(() => {
    rendererRef.current = new PixelGameRenderer();
  }, []);

  const clearGameTimers = useCallback(() => {
    if (phaseTimerRef.current) {
      clearTimeout(phaseTimerRef.current);
      phaseTimerRef.current = null;
    }
  }, []);

  // Deflect Katana Slash
  const triggerPlayerDeflect = useCallback(
    (player: 1 | 2) => {
      if (phase !== 'BULLET_FLIGHT' || !bulletRef.current) return;

      const bullet = bulletRef.current;
      const isTarget =
        (bullet.direction === 1 && player === 2) || (bullet.direction === -1 && player === 1);

      if (!isTarget || bullet.deflected) return;

      if (bullet.progress >= 0.20 && bullet.progress <= 0.92) {
        bullet.deflected = true;
        bullet.deflectAngle = (player === 1 ? -1 : 1) * (Math.PI * 0.35);

        audioEngine.playDeflect();

        if (player === 1) {
          setP1Action('deflect');
        } else {
          setP2Action('deflect');
        }

        if (rendererRef.current) {
          particlesRef.current.push(...rendererRef.current.createDeflectionSparks(bullet.x, bullet.y));
        }

        clearGameTimers();
        phaseTimerRef.current = setTimeout(() => {
          setPhase('ROUND_RESOLVED');
          phaseTimerRef.current = setTimeout(() => {
            startRoundRef.current(roundNumber + 1);
          }, 1500);
        }, 900);
      }
    },
    [clearGameTimers, phase, roundNumber]
  );

  // Shoot Action
  const triggerPlayerShoot = useCallback(
    (player: 1 | 2, overrideReactionMs?: number) => {
      // False start / early shot
      if (phase === 'AIM' || phase === 'SUSPENSE' || phase === 'LOAD') {
        clearGameTimers();
        setPhase('ROUND_RESOLVED');
        audioEngine.playMisfire();
        bulletSpeedRef.current = BASE_BULLET_SPEED; // Reset speed on damage

        if (player === 1) {
          setP1Action('hit');
          setP2Action('idle');
          setP1Hearts((h) => {
            const next = Math.max(0, h - 1);
            if (next === 0) setWinner(2);
            return next;
          });
        } else {
          setP2Action('hit');
          setP1Action('idle');
          setP2Hearts((h) => {
            const next = Math.max(0, h - 1);
            if (next === 0) setWinner(1);
            return next;
          });
        }

        phaseTimerRef.current = setTimeout(() => {
          if (p1Hearts <= 1 || p2Hearts <= 1) {
            setPhase('MATCH_OVER');
          } else {
            startRoundRef.current(roundNumber + 1);
          }
        }, 1800);
        return;
      }

      if (phase !== 'SHOOT_ACTIVE') return;

      clearGameTimers();
      audioEngine.playGunshot();

      if (player === 1) {
        setP1Action('shoot');
        setP2Action('aim');
      } else {
        setP2Action('shoot');
        setP1Action('aim');
      }

      setPhase('BULLET_FLIGHT');

      const canvas = canvasRef.current;
      const w = canvas ? canvas.width : 960;
      const h = canvas ? canvas.height : 540;
      const startX = player === 1 ? w * 0.28 : w * 0.72;
      const targetX = player === 1 ? w * 0.72 : w * 0.28;
      const groundY = h * 0.81;

      const currentSpeed = bulletSpeedRef.current;

      bulletRef.current = {
        x: startX,
        y: groundY - 105,
        targetX,
        progress: 0,
        direction: player === 1 ? 1 : -1,
        speed: currentSpeed,
        deflected: false,
      };

      // Each shot fired while nobody takes damage gradually increases bullet speed
      bulletSpeedRef.current = Math.min(MAX_BULLET_SPEED, currentSpeed + BULLET_SPEED_STEP);

      if (rendererRef.current) {
        particlesRef.current.push(
          ...rendererRef.current.createMuzzleSmoke(startX, groundY - 105, player === 1 ? 1 : -1)
        );
      }

      // CPU Deflection in 1P mode (reaction scaled to bullet speed)
      if (player === 1 && gameMode === '1P_CPU') {
        const willDeflect = Math.random() < 0.45;
        if (willDeflect) {
          const deflectDelay = Math.max(160, Math.round(480 * (BASE_BULLET_SPEED / currentSpeed)));
          setTimeout(() => {
            triggerDeflectRef.current(2);
          }, deflectDelay);
        }
      }
    },
    [clearGameTimers, gameMode, p1Hearts, p2Hearts, phase, roundNumber]
  );

  // Time's Up
  const handleTimesUp = useCallback(() => {
    clearGameTimers();
    setPhase('TIMES_UP');
    audioEngine.playTimesUp();
    setP1Action('idle');
    setP2Action('idle');

    phaseTimerRef.current = setTimeout(() => {
      startRoundRef.current(roundNumber + 1);
    }, 1600);
  }, [clearGameTimers, roundNumber]);

  // Start round - NO WALKING ANIMATION! Direct idle stance!
  const startRound = useCallback(
    (round: number, targetMode?: GameMode) => {
      clearGameTimers();
      const activeMode = targetMode ?? gameMode;
      setRoundNumber(round);
      bulletRef.current = null;
      // Immediately set idle combat stance, no walk
      setP1Action('idle');
      setP2Action('idle');
      setPhase('LOAD');
      audioEngine.playPhase('load');

      // 1.0s -> AIM
      phaseTimerRef.current = setTimeout(() => {
        setP1Action('aim');
        setP2Action('aim');
        setPhase('AIM');
        audioEngine.playPhase('aim');

        // Suspense interval
        const suspenseDuration = 1100 + Math.random() * 1800;
        setPhase('SUSPENSE');

        phaseTimerRef.current = setTimeout(() => {
          setPhase('SHOOT_ACTIVE');
          audioEngine.playPhase('shoot');
          shootStartTimeRef.current = performance.now();

          // CPU shoot only when active mode is 1P_CPU
          if (activeMode === '1P_CPU') {
            const cpuMs = 450 + Math.random() * 260;
            phaseTimerRef.current = setTimeout(() => {
              triggerShootRef.current(2, cpuMs);
            }, cpuMs);
          }

          // Times up after 2.5s
          const timesUp = setTimeout(() => {
            handleTimesUpRef.current();
          }, 2500);

          phaseTimerRef.current = timesUp;
        }, suspenseDuration);
      }, 1000);
    },
    [clearGameTimers, gameMode]
  );

  // Synchronize ref callbacks
  useEffect(() => {
    triggerDeflectRef.current = triggerPlayerDeflect;
    triggerShootRef.current = triggerPlayerShoot;
    handleTimesUpRef.current = handleTimesUp;
    startRoundRef.current = startRound;
  }, [triggerPlayerDeflect, triggerPlayerShoot, handleTimesUp, startRound]);

  // Start / Restart match from beginning
  const startNewMatch = useCallback((targetMode?: GameMode) => {
    clearGameTimers();
    bulletSpeedRef.current = BASE_BULLET_SPEED;
    if (targetMode) {
      setGameMode(targetMode);
    }
    setP1Hearts(3);
    setP2Hearts(3);
    setRoundNumber(1);
    setWinner(null);
    bulletRef.current = null;
    particlesRef.current = [];
    setP1Action('idle');
    setP2Action('idle');
    startRound(1, targetMode);
  }, [clearGameTimers, startRound]);

  // Keyboard Inputs
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const key = e.key.toUpperCase();

      if ([' ', 'ARROWUP', 'ARROWDOWN', 'W', 'S', 'R'].includes(key)) {
        e.preventDefault();
      }

      // Restart hotkey
      if (key === 'R') {
        startNewMatch();
        return;
      }

      // Standby start with Space
      if (key === ' ' && phase === 'STANDBY') {
        startNewMatch();
        return;
      }

      // Player 1 controls: [W] Shoot, [S] Deflect
      if (key === 'W') {
        triggerShootRef.current(1);
      } else if (key === 'S') {
        triggerDeflectRef.current(1);
      }

      // Player 2 controls: [↑] Shoot, [↓] Deflect
      if (key === 'ARROWUP' || key === 'I') {
        triggerShootRef.current(2);
      } else if (key === 'ARROWDOWN' || key === 'K') {
        triggerDeflectRef.current(2);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [phase, startNewMatch]);

  // Main Canvas Render & Animation Loop
  useEffect(() => {
    let animFrame = 0;

    const renderLoop = () => {
      animFrame++;
      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      const w = canvas.width;
      const h = canvas.height;
      const groundY = h * 0.81;

      ctx.imageSmoothingEnabled = true;

      // 1. Japanese Background with Mount Fuji, Torii, & Sakura Petals
      if (rendererRef.current) {
        rendererRef.current.drawBackground(ctx, w, h, animFrame);
      }

      // 2. Flying Bullet
      const bullet = bulletRef.current;
      if (bullet) {
        if (!bullet.deflected) {
          bullet.progress += bullet.speed;
          bullet.x =
            bullet.direction === 1
              ? w * 0.28 + (w * 0.44) * bullet.progress
              : w * 0.72 - (w * 0.44) * bullet.progress;

          if (bullet.progress >= 0.95 && phase === 'BULLET_FLIGHT') {
            bulletRef.current = null;
            audioEngine.playHit();
            bulletSpeedRef.current = BASE_BULLET_SPEED; // Reset bullet speed back to base on hit!

            if (bullet.direction === 1) {
              setP2Action('hit');
              setP2Hearts((hearts) => {
                const next = Math.max(0, hearts - 1);
                if (next === 0) {
                  setWinner(1);
                  audioEngine.playVictory();
                  setPhase('MATCH_OVER');
                } else {
                  setPhase('ROUND_RESOLVED');
                  phaseTimerRef.current = setTimeout(() => {
                    startRoundRef.current(roundNumber + 1);
                  }, 1600);
                }
                return next;
              });
              if (rendererRef.current) {
                particlesRef.current.push(...rendererRef.current.createHitBurst(w * 0.72, groundY - 110));
              }
            } else {
              setP1Action('hit');
              setP1Hearts((hearts) => {
                const next = Math.max(0, hearts - 1);
                if (next === 0) {
                  setWinner(2);
                  audioEngine.playVictory();
                  setPhase('MATCH_OVER');
                } else {
                  setPhase('ROUND_RESOLVED');
                  phaseTimerRef.current = setTimeout(() => {
                    startRoundRef.current(roundNumber + 1);
                  }, 1600);
                }
                return next;
              });
              if (rendererRef.current) {
                particlesRef.current.push(...rendererRef.current.createHitBurst(w * 0.28, groundY - 110));
              }
            }
          }
        } else {
          bullet.x += bullet.direction * 12;
          bullet.y -= 14;
          if (bullet.y < -50) {
            bulletRef.current = null;
          }
        }

        if (bulletRef.current && rendererRef.current) {
          rendererRef.current.drawBullet(ctx, bulletRef.current);
        }
      }

      // 3. Particles
      if (particlesRef.current.length > 0) {
        particlesRef.current.forEach((p) => {
          p.x += p.vx;
          p.y += p.vy;
          if (p.gravity) p.vy += p.gravity;
          p.life--;
        });
        particlesRef.current = particlesRef.current.filter((p) => p.life > 0);
        if (rendererRef.current) {
          rendererRef.current.drawParticles(ctx, particlesRef.current);
        }
      }

      // 4. Samurai Fighters (Japanese Feudal Sprites)
      const p1X = w * 0.28;
      const p2X = w * 0.72;

      if (rendererRef.current) {
        rendererRef.current.drawSamurai(
          ctx,
          p1X,
          groundY,
          1,
          p1Hearts === 0 ? 'dead' : p1Action,
          animFrame,
          2.6
        );

        rendererRef.current.drawSamurai(
          ctx,
          p2X,
          groundY,
          2,
          p2Hearts === 0 ? 'dead' : p2Action,
          animFrame,
          2.6
        );
      }

      // 5. In-Game Phase Cues (Clean, Minimalist Text Callouts on Canvas)
      if (phase === 'LOAD') {
        drawJapaneseStamp(ctx, w * 0.5, h * 0.22, 'CARREGAR', '準備');
      } else if (phase === 'AIM' || phase === 'SUSPENSE') {
        drawJapaneseStamp(ctx, w * 0.5, h * 0.22, 'MIRAR...', '狙え');
      } else if (phase === 'SHOOT_ACTIVE') {
        drawJapaneseStamp(ctx, w * 0.5, h * 0.22, 'FOGO!', '撃て！', '#ef4444');
        // Letter Prompt directly on Samurai heads
        drawSamuraiPrompt(ctx, p1X, groundY - 260, 'W', 'ATIRAR', '#38bdf8');
        if (gameMode === '2P_LOCAL') {
          drawSamuraiPrompt(ctx, p2X, groundY - 260, '↑', 'ATIRAR', '#ef4444');
        }
      } else if (phase === 'BULLET_FLIGHT' && bulletRef.current) {
        const bullet = bulletRef.current;
        if (bullet.direction === 1 && !bullet.deflected) {
          drawSamuraiPrompt(ctx, p2X, groundY - 260, '↓', 'CORTAR', '#fbbf24');
        } else if (bullet.direction === -1 && !bullet.deflected) {
          drawSamuraiPrompt(ctx, p1X, groundY - 260, 'S', 'CORTAR', '#fbbf24');
        }
      } else if (phase === 'TIMES_UP') {
        drawJapaneseStamp(ctx, w * 0.5, h * 0.22, 'TEMPO ESGOTADO', '引き分け', '#94a3b8');
      }

      // Subtle minimalist health dots at bottom corners of screen
      if (phase !== 'STANDBY' && phase !== 'MATCH_OVER') {
        // P1 hearts
        for (let i = 0; i < 3; i++) {
          ctx.fillStyle = i < p1Hearts ? '#ef4444' : 'rgba(255,255,255,0.15)';
          ctx.beginPath();
          ctx.arc(40 + i * 20, h - 30, 6, 0, Math.PI * 2);
          ctx.fill();
        }
        // P2 hearts
        for (let i = 0; i < 3; i++) {
          ctx.fillStyle = i < p2Hearts ? '#ef4444' : 'rgba(255,255,255,0.15)';
          ctx.beginPath();
          ctx.arc(w - 80 + i * 20, h - 30, 6, 0, Math.PI * 2);
          ctx.fill();
        }
      }

      animFrameIdRef.current = requestAnimationFrame(renderLoop);
    };

    animFrameIdRef.current = requestAnimationFrame(renderLoop);

    return () => {
      if (animFrameIdRef.current) cancelAnimationFrame(animFrameIdRef.current);
    };
  }, [phase, p1Action, p2Action, p1Hearts, p2Hearts, gameMode, roundNumber]);

  return (
    <div className="relative w-screen h-screen bg-black overflow-hidden flex items-center justify-center select-none">
      {/* Edge-to-edge Cinematic Canvas */}
      <canvas
        ref={canvasRef}
        width={960}
        height={540}
        className="w-full h-full object-contain block"
      />

      {/* Invisible Touch Controls for Mobile (Left side = P1, Right side = P2) */}
      <div className="absolute inset-0 flex pointer-events-auto md:pointer-events-none">
        {/* P1 Touch Area */}
        <div
          className="w-1/2 h-full flex flex-col justify-end p-6 active:bg-blue-500/5 transition-colors"
          onTouchStart={(e) => {
            e.preventDefault();
            if (phase === 'BULLET_FLIGHT' && bulletRef.current?.direction === -1) {
              triggerPlayerDeflect(1);
            } else {
              triggerPlayerShoot(1);
            }
          }}
          onClick={() => {
            if (phase === 'STANDBY' || phase === 'MATCH_OVER') {
              startNewMatch();
            } else if (phase === 'BULLET_FLIGHT' && bulletRef.current?.direction === -1) {
              triggerPlayerDeflect(1);
            } else {
              triggerPlayerShoot(1);
            }
          }}
        />

        {/* P2 Touch Area */}
        <div
          className="w-1/2 h-full flex flex-col justify-end p-6 active:bg-red-500/5 transition-colors"
          onTouchStart={(e) => {
            e.preventDefault();
            if (gameMode === '2P_LOCAL') {
              if (phase === 'BULLET_FLIGHT' && bulletRef.current?.direction === 1) {
                triggerPlayerDeflect(2);
              } else {
                triggerPlayerShoot(2);
              }
            }
          }}
          onClick={() => {
            if (phase === 'STANDBY' || phase === 'MATCH_OVER') {
              startNewMatch();
            } else if (gameMode === '2P_LOCAL') {
              if (phase === 'BULLET_FLIGHT' && bulletRef.current?.direction === 1) {
                triggerPlayerDeflect(2);
              } else {
                triggerPlayerShoot(2);
              }
            }
          }}
        />
      </div>

      {/* Ultra-minimal floating corner tools (sound, mode, reset) */}
      <div className="absolute top-4 right-4 flex items-center gap-2 z-30">
        {/* Mode Toggle: resets from beginning with 2nd player */}
        <button
          onClick={() => {
            const nextMode = gameMode === '1P_CPU' ? '2P_LOCAL' : '1P_CPU';
            startNewMatch(nextMode);
          }}
          className="px-2.5 py-1.5 rounded bg-black/40 hover:bg-black/80 text-white/80 hover:text-white backdrop-blur-sm border border-white/20 text-xs transition-colors flex items-center gap-1.5 active:scale-95"
          title={gameMode === '1P_CPU' ? 'Reiniciar com 2 Jogadores (2P)' : 'Reiniciar com 1 Jogador vs CPU (1P)'}
        >
          {gameMode === '1P_CPU' ? <Users className="w-4 h-4 text-amber-400" /> : <User className="w-4 h-4 text-blue-400" />}
          <span className="font-mono font-bold text-[11px]">{gameMode === '1P_CPU' ? '2P' : '1P'}</span>
        </button>

        {/* Sound Toggle */}
        <button
          onClick={toggleSound}
          className="p-2 rounded bg-black/40 hover:bg-black/80 text-white/70 hover:text-white backdrop-blur-sm border border-white/10 text-xs transition-colors"
          title={isMuted ? 'Desmutar' : 'Mutar'}
        >
          {isMuted ? <VolumeX className="w-4 h-4 text-red-400" /> : <Volume2 className="w-4 h-4 text-white" />}
        </button>

        {/* Restart Button */}
        <button
          onClick={() => startNewMatch()}
          className="p-2 rounded bg-black/40 hover:bg-black/80 text-white/70 hover:text-white backdrop-blur-sm border border-white/10 text-xs transition-colors"
          title="Reiniciar (R)"
        >
          <RotateCcw className="w-4 h-4" />
        </button>
      </div>

      {/* Minimal Start Overlay */}
      {phase === 'STANDBY' && (
        <div
          onClick={() => startNewMatch()}
          className="absolute inset-0 bg-black/60 backdrop-blur-xs flex flex-col items-center justify-center p-4 text-center z-20 cursor-pointer"
        >
          <h1 className="text-4xl sm:text-6xl font-black text-white tracking-widest uppercase mb-4 drop-shadow-[0_4px_12px_rgba(0,0,0,0.8)]">
            Carregar, Mirar... Fogo!
          </h1>
          <div className="px-6 py-2 border border-white/30 rounded bg-black/50 text-white text-sm sm:text-base font-mono tracking-wider animate-pulse">
            CLIQUE OU ESPAÇO PARA INICIAR
          </div>
          <div className="text-white/50 text-xs font-mono mt-6">
            P1: [W] Atirar · [S] Cortar com Katana | P2: [↑] Atirar · [↓] Cortar
          </div>
        </div>
      )}

      {/* Minimal Victory Overlay */}
      {phase === 'MATCH_OVER' && (
        <div
          onClick={() => startNewMatch()}
          className="absolute inset-0 bg-black/70 backdrop-blur-xs flex flex-col items-center justify-center p-4 text-center z-20 cursor-pointer"
        >
          <h2 className="text-4xl sm:text-5xl font-black text-white tracking-widest uppercase mb-3">
            {winner === 1 ? 'VITÓRIA DO SAMURAI 1' : gameMode === '1P_CPU' ? 'VITÓRIA DA CPU' : 'VITÓRIA DO SAMURAI 2'}
          </h2>
          <div className="px-6 py-2 border border-white/30 rounded bg-black/50 text-white text-sm font-mono tracking-wider mt-2">
            CLIQUE PARA JOGAR NOVAMENTE
          </div>
        </div>
      )}
    </div>
  );
}
