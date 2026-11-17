import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Pause, Play, RotateCcw, Trophy, Volume2, VolumeX } from 'lucide-react';
import { sound } from '../utils/sound';

export type GameState = 'TITLE_MENU' | 'READY' | 'PLAYING' | 'PAUSED' | 'GAME_OVER';
export type Difficulty = 'easy' | 'normal' | 'hard';

interface DifficultyConfig {
  label: string;
  speed: number;
  gap: number;
  gravity: number;
  jump: number;
  spawnInterval: number;
}

const DIFFICULTY_PRESETS: Record<Difficulty, DifficultyConfig> = {
  easy: {
    label: 'Dễ',
    speed: 145,
    gap: 158,
    gravity: 1080,
    jump: -355,
    spawnInterval: 1.75,
  },
  normal: {
    label: 'Vừa',
    speed: 185,
    gap: 136,
    gravity: 1260,
    jump: -390,
    spawnInterval: 1.48,
  },
  hard: {
    label: 'Khó',
    speed: 225,
    gap: 118,
    gravity: 1420,
    jump: -415,
    spawnInterval: 1.24,
  },
};

const GAME_WIDTH = 420;
const GAME_HEIGHT = 640;
const GROUND_HEIGHT = 88;
const PLAYABLE_HEIGHT = GAME_HEIGHT - GROUND_HEIGHT;
const BIRD_X = 112;
const BIRD_RADIUS = 14;
const PIPE_WIDTH = 64;
const PIPE_CAP_HEIGHT = 24;
const PIPE_CAP_OVERHANG = 5;

interface PipePair {
  x: number;
  gapTop: number;
  gapHeight: number;
  passed: boolean;
}

interface Cloud {
  x: number;
  y: number;
  scale: number;
  speedFactor: number;
}

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  alpha: number;
}

function getMedal(score: number): { name: string; color: string; ring: string } | null {
  if (score >= 40) return { name: 'Bạch kim', color: 'bg-cyan-100 text-cyan-900', ring: 'border-cyan-300' };
  if (score >= 25) return { name: 'Vàng', color: 'bg-amber-300 text-amber-950', ring: 'border-amber-100' };
  if (score >= 12) return { name: 'Bạc', color: 'bg-slate-200 text-slate-900', ring: 'border-slate-50' };
  if (score >= 5) return { name: 'Đồng', color: 'bg-orange-300 text-orange-950', ring: 'border-orange-200' };
  return null;
}

export const FlappyGame: React.FC = () => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  const [gameState, setGameState] = useState<GameState>('TITLE_MENU');
  const [difficulty, setDifficulty] = useState<Difficulty>('normal');
  const [score, setScore] = useState(0);
  const [bestScore, setBestScore] = useState<number>(() => {
    try {
      const saved = localStorage.getItem('flappy_best_score');
      return saved ? parseInt(saved, 10) || 0 : 0;
    } catch {
      return 0;
    }
  });
  const [isNewBest, setIsNewBest] = useState(false);
  const [muted, setMuted] = useState<boolean>(() => sound.isMuted());

  const stateRef = useRef<GameState>('TITLE_MENU');
  const difficultyRef = useRef<Difficulty>('normal');
  const scoreRef = useRef(0);
  const bestScoreRef = useRef(bestScore);
  const gameOverTimestampRef = useRef(0);

  const birdRef = useRef({
    y: PLAYABLE_HEIGHT * 0.45,
    vy: 0,
    rotation: 0,
    wingPhase: 0,
  });

  const pipesRef = useRef<PipePair[]>([]);
  const spawnTimerRef = useRef(0);
  const groundOffsetRef = useRef(0);
  const flashAlphaRef = useRef(0);
  const shakeTimerRef = useRef(0);
  const particlesRef = useRef<Particle[]>([]);
  const cloudsRef = useRef<Cloud[]>([
    { x: 60, y: 95, scale: 1.0, speedFactor: 0.16 },
    { x: 210, y: 155, scale: 0.78, speedFactor: 0.11 },
    { x: 350, y: 78, scale: 1.15, speedFactor: 0.2 },
    { x: 480, y: 130, scale: 0.85, speedFactor: 0.13 },
  ]);

  useEffect(() => {
    stateRef.current = gameState;
  }, [gameState]);

  useEffect(() => {
    difficultyRef.current = difficulty;
  }, [difficulty]);

  const resetWorld = useCallback(() => {
    birdRef.current = {
      y: PLAYABLE_HEIGHT * 0.45,
      vy: 0,
      rotation: 0,
      wingPhase: 0,
    };
    pipesRef.current = [];
    particlesRef.current = [];
    spawnTimerRef.current = 0.35;
    flashAlphaRef.current = 0;
    shakeTimerRef.current = 0;
    scoreRef.current = 0;
    setScore(0);
    setIsNewBest(false);
  }, []);

  const spawnFlapParticles = useCallback((y: number) => {
    for (let i = 0; i < 5; i++) {
      particlesRef.current.push({
        x: BIRD_X - 10 + (Math.random() - 0.5) * 6,
        y: y + 4 + (Math.random() - 0.5) * 6,
        vx: -45 - Math.random() * 55,
        vy: 20 + (Math.random() - 0.5) * 45,
        radius: 2.5 + Math.random() * 2.5,
        alpha: 0.85,
      });
    }
  }, []);

  const startReady = useCallback(() => {
    resetWorld();
    stateRef.current = 'READY';
    setGameState('READY');
  }, [resetWorld]);

  const triggerFlap = useCallback(() => {
    const current = stateRef.current;

    if (current === 'TITLE_MENU') {
      resetWorld();
      stateRef.current = 'PLAYING';
      setGameState('PLAYING');
      const cfg = DIFFICULTY_PRESETS[difficultyRef.current];
      birdRef.current.vy = cfg.jump;
      birdRef.current.wingPhase = 1.6;
      spawnFlapParticles(birdRef.current.y);
      sound.playFlap();
      return;
    }

    if (current === 'READY') {
      stateRef.current = 'PLAYING';
      setGameState('PLAYING');
      const cfg = DIFFICULTY_PRESETS[difficultyRef.current];
      birdRef.current.vy = cfg.jump;
      birdRef.current.wingPhase = 1.6;
      spawnFlapParticles(birdRef.current.y);
      sound.playFlap();
      return;
    }

    if (current === 'PLAYING') {
      const cfg = DIFFICULTY_PRESETS[difficultyRef.current];
      birdRef.current.vy = cfg.jump;
      birdRef.current.wingPhase = 1.6;
      spawnFlapParticles(birdRef.current.y);
      sound.playFlap();
    }
  }, [resetWorld, spawnFlapParticles]);

  const togglePause = useCallback(() => {
    if (stateRef.current === 'PLAYING') {
      stateRef.current = 'PAUSED';
      setGameState('PAUSED');
    } else if (stateRef.current === 'PAUSED') {
      stateRef.current = 'PLAYING';
      setGameState('PLAYING');
    }
  }, []);

  const toggleMute = useCallback(() => {
    const next = !sound.isMuted();
    sound.setMuted(next);
    setMuted(next);
  }, []);

  const handleRestart = useCallback(() => {
    resetWorld();
    stateRef.current = 'READY';
    setGameState('READY');
  }, [resetWorld]);

  // Keyboard shortcuts
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.repeat) return;

      if (e.code === 'Space' || e.code === 'ArrowUp' || e.code === 'KeyW') {
        e.preventDefault();
        if (stateRef.current === 'GAME_OVER') {
          if (performance.now() - gameOverTimestampRef.current > 380) {
            handleRestart();
          }
        } else if (stateRef.current === 'PAUSED') {
          togglePause();
        } else {
          triggerFlap();
        }
      } else if (e.code === 'KeyP' || e.code === 'Escape') {
        if (stateRef.current === 'PLAYING' || stateRef.current === 'PAUSED') {
          e.preventDefault();
          togglePause();
        }
      } else if (e.code === 'KeyM') {
        e.preventDefault();
        toggleMute();
      } else if (e.code === 'Enter' && stateRef.current === 'GAME_OVER') {
        if (performance.now() - gameOverTimestampRef.current > 380) {
          e.preventDefault();
          handleRestart();
        }
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [handleRestart, toggleMute, togglePause, triggerFlap]);

  // Main requestAnimationFrame loop
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = GAME_WIDTH * dpr;
    canvas.height = GAME_HEIGHT * dpr;

    let animId = 0;
    let lastTime = performance.now();

    const triggerGameOver = () => {
      if (stateRef.current === 'GAME_OVER') return;
      stateRef.current = 'GAME_OVER';
      gameOverTimestampRef.current = performance.now();
      flashAlphaRef.current = 0.7;
      shakeTimerRef.current = 0.24;
      sound.playHit();

      if (scoreRef.current > bestScoreRef.current) {
        bestScoreRef.current = scoreRef.current;
        setBestScore(scoreRef.current);
        setIsNewBest(true);
        try {
          localStorage.setItem('flappy_best_score', String(scoreRef.current));
        } catch {
          // Ignore storage error
        }
      }
      setGameState('GAME_OVER');
    };

    const drawCloud = (c: Cloud) => {
      ctx.save();
      ctx.translate(c.x, c.y);
      ctx.scale(c.scale, c.scale);
      ctx.fillStyle = 'rgba(255, 255, 255, 0.88)';
      ctx.beginPath();
      ctx.arc(0, 0, 18, 0, Math.PI * 2);
      ctx.arc(18, -6, 22, 0, Math.PI * 2);
      ctx.arc(38, 0, 16, 0, Math.PI * 2);
      ctx.arc(19, 8, 16, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    };

    const drawPipe = (pipe: PipePair) => {
      const { x, gapTop, gapHeight } = pipe;
      const bottomY = gapTop + gapHeight;

      const drawTubeSegment = (rx: number, ry: number, rw: number, rh: number) => {
        if (rh <= 0) return;
        const grad = ctx.createLinearGradient(rx, 0, rx + rw, 0);
        grad.addColorStop(0, '#15803d');
        grad.addColorStop(0.22, '#4ade80');
        grad.addColorStop(0.55, '#22c55e');
        grad.addColorStop(1, '#14532d');

        ctx.fillStyle = grad;
        ctx.fillRect(rx, ry, rw, rh);

        // Specular highlight stripe
        ctx.fillStyle = 'rgba(255, 255, 255, 0.24)';
        ctx.fillRect(rx + 8, ry, 7, rh);

        ctx.strokeStyle = '#052e16';
        ctx.lineWidth = 2.5;
        ctx.strokeRect(rx, ry, rw, rh);
      };

      // Top pipe body + cap
      const topBodyH = Math.max(0, gapTop - PIPE_CAP_HEIGHT);
      drawTubeSegment(x, -2, PIPE_WIDTH, topBodyH + 2);
      drawTubeSegment(
        x - PIPE_CAP_OVERHANG,
        gapTop - PIPE_CAP_HEIGHT,
        PIPE_WIDTH + PIPE_CAP_OVERHANG * 2,
        PIPE_CAP_HEIGHT
      );

      // Bottom pipe cap + body
      const bottomBodyY = bottomY + PIPE_CAP_HEIGHT;
      const bottomBodyH = Math.max(0, PLAYABLE_HEIGHT - bottomBodyY);
      drawTubeSegment(x, bottomBodyY, PIPE_WIDTH, bottomBodyH + 2);
      drawTubeSegment(
        x - PIPE_CAP_OVERHANG,
        bottomY,
        PIPE_WIDTH + PIPE_CAP_OVERHANG * 2,
        PIPE_CAP_HEIGHT
      );
    };

    const drawBird = (y: number, rotation: number, wingPhase: number) => {
      ctx.save();
      ctx.translate(BIRD_X, y);
      ctx.rotate(rotation);

      // Body shadow/outline
      ctx.fillStyle = '#f59e0b';
      ctx.strokeStyle = '#451a03';
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.ellipse(0, 0, 17, 14, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();

      // Warm belly highlight
      ctx.fillStyle = '#fef08a';
      ctx.beginPath();
      ctx.ellipse(-2, 4, 11, 7, 0.1, 0, Math.PI * 2);
      ctx.fill();

      // Animated wing
      const wingOffset = Math.sin(wingPhase * Math.PI * 2) * 4;
      ctx.fillStyle = '#fffbeb';
      ctx.strokeStyle = '#451a03';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.ellipse(-4, 1 + wingOffset * 0.4, 9, 5.5, -0.2 + wingOffset * 0.08, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();

      // Eye
      ctx.fillStyle = '#ffffff';
      ctx.strokeStyle = '#451a03';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(7, -4, 5.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();

      // Pupil
      ctx.fillStyle = '#0f172a';
      ctx.beginPath();
      ctx.arc(8.8, -4, 2.3, 0, Math.PI * 2);
      ctx.fill();

      // Eye sparkle
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(9.5, -5.2, 0.9, 0, Math.PI * 2);
      ctx.fill();

      // Beak
      ctx.fillStyle = '#f97316';
      ctx.strokeStyle = '#451a03';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(12, -1);
      ctx.lineTo(23, 2.5);
      ctx.lineTo(12, 6.5);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();

      ctx.restore();
    };

    const drawBackground = (nowSec: number) => {
      // Sky gradient
      const skyGrad = ctx.createLinearGradient(0, 0, 0, PLAYABLE_HEIGHT);
      skyGrad.addColorStop(0, '#0ea5e9');
      skyGrad.addColorStop(0.65, '#7dd3fc');
      skyGrad.addColorStop(1, '#e0f2fe');
      ctx.fillStyle = skyGrad;
      ctx.fillRect(0, 0, GAME_WIDTH, PLAYABLE_HEIGHT);

      // Soft sun glow
      ctx.fillStyle = 'rgba(254, 240, 138, 0.35)';
      ctx.beginPath();
      ctx.arc(340, 92, 46, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = 'rgba(254, 249, 195, 0.7)';
      ctx.beginPath();
      ctx.arc(340, 92, 26, 0, Math.PI * 2);
      ctx.fill();

      // Clouds
      for (const c of cloudsRef.current) {
        drawCloud(c);
      }

      // Distant soft hills / treeline silhouette
      const hillShift = (groundOffsetRef.current * 0.22) % 210;
      ctx.fillStyle = '#86efac';
      ctx.beginPath();
      ctx.moveTo(0, PLAYABLE_HEIGHT);
      for (let x = -210; x <= GAME_WIDTH + 210; x += 105) {
        const drawX = x - hillShift;
        ctx.quadraticCurveTo(drawX + 52, PLAYABLE_HEIGHT - 56, drawX + 105, PLAYABLE_HEIGHT);
      }
      ctx.lineTo(GAME_WIDTH, PLAYABLE_HEIGHT);
      ctx.closePath();
      ctx.fill();

      // Closer bushes band
      const bushShift = (groundOffsetRef.current * 0.42) % 84;
      ctx.fillStyle = '#4ade80';
      for (let x = -84; x <= GAME_WIDTH + 84; x += 42) {
        ctx.beginPath();
        ctx.arc(x - bushShift, PLAYABLE_HEIGHT - 4, 24, Math.PI, 0);
        ctx.fill();
      }

      // Subtle sway factor unused directly, keeps clock reference crisp
      void nowSec;
    };

    const drawGround = () => {
      // Dirt base
      ctx.fillStyle = '#d9b97b';
      ctx.fillRect(0, PLAYABLE_HEIGHT, GAME_WIDTH, GROUND_HEIGHT);

      // Deeper earth band
      ctx.fillStyle = '#c29b57';
      ctx.fillRect(0, PLAYABLE_HEIGHT + 24, GAME_WIDTH, GROUND_HEIGHT - 24);

      // Top grass border
      ctx.fillStyle = '#22c55e';
      ctx.fillRect(0, PLAYABLE_HEIGHT, GAME_WIDTH, 18);

      // Scrolling diagonal grass chevrons
      ctx.save();
      ctx.beginPath();
      ctx.rect(0, PLAYABLE_HEIGHT, GAME_WIDTH, 18);
      ctx.clip();

      ctx.fillStyle = '#16a34a';
      const stripeW = 28;
      const offset = groundOffsetRef.current % stripeW;
      for (let x = -stripeW; x < GAME_WIDTH + stripeW; x += stripeW) {
        ctx.beginPath();
        ctx.moveTo(x - offset, PLAYABLE_HEIGHT);
        ctx.lineTo(x - offset + 14, PLAYABLE_HEIGHT);
        ctx.lineTo(x - offset + 4, PLAYABLE_HEIGHT + 18);
        ctx.lineTo(x - offset - 10, PLAYABLE_HEIGHT + 18);
        ctx.closePath();
        ctx.fill();
      }
      ctx.restore();

      // Crisp horizon line
      ctx.fillStyle = '#14532d';
      ctx.fillRect(0, PLAYABLE_HEIGHT, GAME_WIDTH, 3);
      ctx.fillStyle = '#a16207';
      ctx.fillRect(0, PLAYABLE_HEIGHT + 18, GAME_WIDTH, 2);
    };

    const tick = (now: number) => {
      const rawDt = (now - lastTime) / 1000;
      lastTime = now;
      const dt = Math.min(rawDt, 0.05);
      const nowSec = now / 1000;

      const current = stateRef.current;
      const cfg = DIFFICULTY_PRESETS[difficultyRef.current];

      // Update clouds gently in non-paused states
      if (current !== 'PAUSED' && current !== 'GAME_OVER') {
        for (const c of cloudsRef.current) {
          c.x -= cfg.speed * c.speedFactor * dt;
          if (c.x < -80) {
            c.x = GAME_WIDTH + 60;
          }
        }
        groundOffsetRef.current += cfg.speed * dt;
      }

      // Idle hover animation in TITLE_MENU / READY
      if (current === 'TITLE_MENU' || current === 'READY') {
        birdRef.current.y = PLAYABLE_HEIGHT * 0.45 + Math.sin(nowSec * 4.2) * 8;
        birdRef.current.rotation = Math.sin(nowSec * 4.2) * 0.08;
        birdRef.current.wingPhase += dt * 3.2;
      } else if (current === 'PLAYING') {
        // Bird physics
        birdRef.current.vy += cfg.gravity * dt;
        birdRef.current.y += birdRef.current.vy * dt;
        birdRef.current.wingPhase += dt * (birdRef.current.vy < 0 ? 7.5 : 3.0);

        const targetRot =
          birdRef.current.vy < 0
            ? -0.44
            : Math.min(Math.PI / 2.2, ((birdRef.current.vy - 80) / 520) * (Math.PI / 2));
        birdRef.current.rotation += (targetRot - birdRef.current.rotation) * Math.min(1, dt * 11);

        // Ceiling clamp
        if (birdRef.current.y - BIRD_RADIUS < 0) {
          birdRef.current.y = BIRD_RADIUS;
          birdRef.current.vy = 0;
        }

        // Spawn pipes
        spawnTimerRef.current -= dt;
        if (spawnTimerRef.current <= 0) {
          spawnTimerRef.current = cfg.spawnInterval;
          const minGapTop = 68;
          const maxGapTop = PLAYABLE_HEIGHT - cfg.gap - 68;
          const gapTop = minGapTop + Math.random() * Math.max(20, maxGapTop - minGapTop);
          pipesRef.current.push({
            x: GAME_WIDTH + 12,
            gapTop,
            gapHeight: cfg.gap,
            passed: false,
          });
        }

        // Move pipes, score & collision
        const hitRadius = BIRD_RADIUS - 2; // Fair forgiving hitbox
        for (let i = pipesRef.current.length - 1; i >= 0; i--) {
          const p = pipesRef.current[i];
          p.x -= cfg.speed * dt;

          // Score check
          if (!p.passed && p.x + PIPE_WIDTH / 2 < BIRD_X) {
            p.passed = true;
            scoreRef.current += 1;
            setScore(scoreRef.current);
            sound.playScore();
          }

          // Collision check with top & bottom pipes
          const withinPipeX =
            BIRD_X + hitRadius > p.x && BIRD_X - hitRadius < p.x + PIPE_WIDTH;
          if (withinPipeX) {
            const hitsTop = birdRef.current.y - hitRadius < p.gapTop;
            const hitsBottom = birdRef.current.y + hitRadius > p.gapTop + p.gapHeight;
            if (hitsTop || hitsBottom) {
              triggerGameOver();
              break;
            }
          }

          if (p.x + PIPE_WIDTH < -20) {
            pipesRef.current.splice(i, 1);
          }
        }

        // Ground collision
        if (birdRef.current.y + BIRD_RADIUS >= PLAYABLE_HEIGHT) {
          birdRef.current.y = PLAYABLE_HEIGHT - BIRD_RADIUS;
          triggerGameOver();
        }
      } else if (current === 'GAME_OVER') {
        // Bird falls smoothly to ground after collision
        if (birdRef.current.y + BIRD_RADIUS < PLAYABLE_HEIGHT) {
          birdRef.current.vy += 1350 * dt;
          birdRef.current.y = Math.min(
            PLAYABLE_HEIGHT - BIRD_RADIUS,
            birdRef.current.y + birdRef.current.vy * dt
          );
          birdRef.current.rotation = Math.min(Math.PI / 2, birdRef.current.rotation + dt * 6);
        }
      }

      // Particles update
      for (let i = particlesRef.current.length - 1; i >= 0; i--) {
        const pt = particlesRef.current[i];
        pt.x += pt.vx * dt;
        pt.y += pt.vy * dt;
        pt.alpha -= dt * 2.2;
        if (pt.alpha <= 0) {
          particlesRef.current.splice(i, 1);
        }
      }

      if (flashAlphaRef.current > 0) {
        flashAlphaRef.current = Math.max(0, flashAlphaRef.current - dt * 3.2);
      }
      if (shakeTimerRef.current > 0) {
        shakeTimerRef.current = Math.max(0, shakeTimerRef.current - dt);
      }

      // Render frame
      ctx.save();
      ctx.scale(dpr, dpr);

      if (shakeTimerRef.current > 0) {
        const mag = (shakeTimerRef.current / 0.24) * 6;
        ctx.translate((Math.random() - 0.5) * mag * 2, (Math.random() - 0.5) * mag * 2);
      }

      drawBackground(nowSec);

      for (const p of pipesRef.current) {
        drawPipe(p);
      }

      // Feather puff particles
      for (const pt of particlesRef.current) {
        ctx.fillStyle = `rgba(255, 255, 255, ${pt.alpha})`;
        ctx.beginPath();
        ctx.arc(pt.x, pt.y, pt.radius, 0, Math.PI * 2);
        ctx.fill();
      }

      drawGround();
      drawBird(birdRef.current.y, birdRef.current.rotation, birdRef.current.wingPhase);

      if (flashAlphaRef.current > 0) {
        ctx.fillStyle = `rgba(255, 255, 255, ${flashAlphaRef.current})`;
        ctx.fillRect(0, 0, GAME_WIDTH, GAME_HEIGHT);
      }

      ctx.restore();

      animId = requestAnimationFrame(tick);
    };

    animId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(animId);
  }, []);

  const handleCanvasPointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    if (gameState === 'READY' || gameState === 'PLAYING') {
      triggerFlap();
    }
  };

  const medal = getMedal(score);

  return (
    <div className="flex flex-col items-center justify-center w-full">
      {/* Main Game Frame */}
      <div className="relative w-full max-w-[420px] aspect-[420/640] max-h-[calc(100dvh-130px)] rounded-2xl overflow-hidden shadow-2xl shadow-slate-950/80 border border-slate-700/70 bg-sky-400 select-none">
        <canvas
          ref={canvasRef}
          onPointerDown={handleCanvasPointerDown}
          aria-label="Màn hình trò chơi Chim Bay"
          className="w-full h-full block cursor-pointer touch-manipulation"
        />

        {/* Top-Right Compact Controls (Mute & Pause) */}
        <div className="absolute top-3 right-3 z-20 flex items-center gap-2">
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              toggleMute();
            }}
            title={muted ? 'Bật âm thanh (M)' : 'Tắt âm thanh (M)'}
            aria-label={muted ? 'Bật âm thanh' : 'Tắt âm thanh'}
            className="w-10 h-10 rounded-xl bg-slate-900/55 hover:bg-slate-900/80 backdrop-blur-sm text-white flex items-center justify-center border border-white/15 transition-colors cursor-pointer"
          >
            {muted ? <VolumeX className="w-5 h-5" /> : <Volume2 className="w-5 h-5" />}
          </button>

          {(gameState === 'PLAYING' || gameState === 'PAUSED') && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                togglePause();
              }}
              title={gameState === 'PAUSED' ? 'Tiếp tục (P)' : 'Tạm dừng (P)'}
              aria-label={gameState === 'PAUSED' ? 'Tiếp tục' : 'Tạm dừng'}
              className="w-10 h-10 rounded-xl bg-slate-900/55 hover:bg-slate-900/80 backdrop-blur-sm text-white flex items-center justify-center border border-white/15 transition-colors cursor-pointer"
            >
              {gameState === 'PAUSED' ? <Play className="w-5 h-5" /> : <Pause className="w-5 h-5" />}
            </button>
          )}
        </div>

        {/* Live Score HUD */}
        {(gameState === 'PLAYING' || gameState === 'READY' || gameState === 'PAUSED') && (
          <div className="pointer-events-none absolute top-5 inset-x-0 flex justify-center z-10">
            <span
              className="font-display font-extrabold text-5xl text-white tracking-tight font-mono-num"
              style={{
                textShadow: '0 3px 0 #0f172a, 0 6px 14px rgba(15, 23, 42, 0.45)',
                WebkitTextStroke: '2px #0f172a',
              }}
            >
              {score}
            </span>
          </div>
        )}

        {/* READY prompt */}
        {gameState === 'READY' && (
          <div className="pointer-events-none absolute inset-x-0 bottom-[136px] flex flex-col items-center px-6 text-center z-10">
            <div className="bg-slate-900/75 backdrop-blur-sm border border-white/15 rounded-xl px-5 py-3 shadow-lg">
              <p className="text-sm font-semibold text-white">
                Nhấn <span className="text-amber-300">Space</span> hoặc <span className="text-amber-300">Chạm</span> để bay
              </p>
            </div>
          </div>
        )}

        {/* TITLE_MENU Overlay */}
        {gameState === 'TITLE_MENU' && (
          <div className="absolute inset-0 z-20 flex flex-col items-center justify-center p-6 bg-slate-950/35 backdrop-blur-[2px]">
            <div className="w-full max-w-[330px] bg-slate-900/90 border border-slate-700/80 rounded-2xl p-6 text-center shadow-2xl">
              <h2 className="font-display text-3xl font-extrabold text-white tracking-tight mb-1.5">
                Chim Bay
              </h2>
              <p className="text-sm text-slate-300 mb-5">
                Giữ nhịp bay qua các ống xanh để ghi điểm cao nhất.
              </p>

              {/* Difficulty Segmented Selector */}
              <div className="mb-5">
                <p className="text-xs font-medium text-slate-400 mb-2">Độ khó</p>
                <div className="grid grid-cols-3 gap-1.5 p-1 bg-slate-950/80 rounded-xl border border-slate-800">
                  {(['easy', 'normal', 'hard'] as Difficulty[]).map((level) => (
                    <button
                      key={level}
                      type="button"
                      onClick={() => setDifficulty(level)}
                      className={`py-2 text-xs font-semibold rounded-lg transition-colors cursor-pointer whitespace-nowrap ${
                        difficulty === level
                          ? 'bg-amber-400 text-slate-950 shadow-sm'
                          : 'text-slate-300 hover:text-white hover:bg-slate-800/60'
                      }`}
                    >
                      {DIFFICULTY_PRESETS[level].label}
                    </button>
                  ))}
                </div>
              </div>

              {bestScore > 0 && (
                <div className="flex items-center justify-center gap-2 text-sm text-slate-300 mb-5">
                  <Trophy className="w-4 h-4 text-amber-400" />
                  <span>Kỷ lục hiện tại:</span>
                  <span className="font-mono-num font-bold text-white">{bestScore}</span>
                </div>
              )}

              <button
                type="button"
                onClick={startReady}
                className="w-full py-3 px-6 rounded-xl bg-amber-400 hover:bg-amber-300 active:scale-[0.99] text-slate-950 font-bold text-base shadow-lg shadow-amber-500/20 transition-all cursor-pointer flex items-center justify-center gap-2"
              >
                <Play className="w-5 h-5 fill-current" />
                <span>Bắt đầu chơi</span>
              </button>
            </div>
          </div>
        )}

        {/* PAUSED Overlay */}
        {gameState === 'PAUSED' && (
          <div className="absolute inset-0 z-20 flex flex-col items-center justify-center p-6 bg-slate-950/55 backdrop-blur-xs">
            <div className="w-full max-w-[300px] bg-slate-900/95 border border-slate-700/80 rounded-2xl p-6 text-center shadow-2xl">
              <h2 className="font-display text-2xl font-bold text-white mb-1">Tạm dừng</h2>
              <p className="text-sm text-slate-400 mb-5">Điểm hiện tại: <span className="font-mono-num font-bold text-white">{score}</span></p>
              <div className="flex flex-col gap-2.5">
                <button
                  type="button"
                  onClick={togglePause}
                  className="w-full py-2.5 px-4 rounded-xl bg-amber-400 hover:bg-amber-300 text-slate-950 font-bold text-sm transition-colors cursor-pointer flex items-center justify-center gap-2"
                >
                  <Play className="w-4 h-4 fill-current" />
                  <span>Tiếp tục</span>
                </button>
                <button
                  type="button"
                  onClick={handleRestart}
                  className="w-full py-2.5 px-4 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 font-semibold text-sm transition-colors cursor-pointer flex items-center justify-center gap-2"
                >
                  <RotateCcw className="w-4 h-4" />
                  <span>Chơi lại</span>
                </button>
              </div>
            </div>
          </div>
        )}

        {/* GAME_OVER Overlay */}
        {gameState === 'GAME_OVER' && (
          <div className="absolute inset-0 z-20 flex flex-col items-center justify-center p-6 bg-slate-950/55 backdrop-blur-[2px]">
            <div className="w-full max-w-[320px] bg-slate-900/95 border border-slate-700/80 rounded-2xl p-6 text-center shadow-2xl">
              <h2 className="font-display text-2xl font-extrabold text-white mb-4">
                Kết thúc lượt
              </h2>

              <div className="bg-slate-950/75 border border-slate-800 rounded-xl p-4 mb-5">
                <div className="grid grid-cols-2 divide-x divide-slate-800">
                  <div className="pr-3">
                    <p className="text-xs text-slate-400 mb-1">Điểm số</p>
                    <p className="font-mono-num text-3xl font-bold text-white">{score}</p>
                  </div>
                  <div className="pl-3">
                    <p className="text-xs text-slate-400 mb-1">
                      {isNewBest ? 'Kỷ lục mới' : 'Kỷ lục'}
                    </p>
                    <p className="font-mono-num text-3xl font-bold text-amber-400">{bestScore}</p>
                  </div>
                </div>

                {medal && (
                  <div className="mt-4 pt-3 border-t border-slate-800 flex items-center justify-center gap-2.5">
                    <span
                      className={`w-6 h-6 rounded-full border-2 flex items-center justify-center text-[11px] font-bold ${medal.color} ${medal.ring}`}
                    >
                      ★
                    </span>
                    <span className="text-xs font-medium text-slate-200">
                      Huy chương {medal.name}
                    </span>
                  </div>
                )}
              </div>

              <div className="flex flex-col gap-2.5">
                <button
                  type="button"
                  onClick={handleRestart}
                  className="w-full py-3 px-5 rounded-xl bg-amber-400 hover:bg-amber-300 active:scale-[0.99] text-slate-950 font-bold text-base shadow-lg shadow-amber-500/20 transition-all cursor-pointer flex items-center justify-center gap-2 whitespace-nowrap"
                >
                  <RotateCcw className="w-4 h-4" />
                  <span>Chơi lại</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    resetWorld();
                    stateRef.current = 'TITLE_MENU';
                    setGameState('TITLE_MENU');
                  }}
                  className="w-full py-2 px-4 rounded-xl text-slate-300 hover:text-white hover:bg-slate-800/70 font-medium text-xs transition-colors cursor-pointer"
                >
                  Đổi độ khó
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Subtle Bottom Control Guide */}
      <div className="mt-3 flex flex-wrap items-center justify-center gap-x-3 gap-y-1 text-xs text-slate-400">
        <span>Space / Click: Bay</span>
        <span aria-hidden="true">·</span>
        <span>P: Tạm dừng</span>
        <span aria-hidden="true">·</span>
        <span>M: Âm thanh</span>
      </div>
    </div>
  );
};
