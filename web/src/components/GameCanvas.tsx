import { useEffect, useRef, useState } from "react";
import * as THREE from "three";

interface Props {
  versionId: number;
  baseAltitude: number;
  hazardRate: number;
  enemySpeed: number;
  lootMultiplier: number;
  tiles: [string, string][];
  runNonce: number;
  onAltitudeChange?: (altitude: number) => void;
}

type ArenaState = {
  versionId: number;
  baseAltitude: number;
  hazardRate: number;
  enemySpeed: number;
  lootMultiplier: number;
  tiles: [string, string][];
};

type Platform = {
  mesh: any;
  size: any;
  driftAxis: "x" | "z";
  driftSpeed: number;
  driftAmp: number;
  driftPhase: number;
  baseX: number;
  baseZ: number;
};

type Bumper = {
  mesh: any;
  center: any;
  radius: number;
  speed: number;
  phase: number;
};

type Rotor = {
  pivot: any;
  width: number;
  height: number;
  length: number;
  speed: number;
};

type PatchCollider = {
  mesh: any;
  pos: any;
  radius: number;
};

type PhysicsConfig = {
  gravity: number;
  collisionPush: number;
  platformDriftScale: number;
  rotorSpeedScale: number;
  bumperSpeedScale: number;
  obstacleSpawnRate: number;
};

type Hud = {
  altitude: number;
  bestAltitude: number;
  score: number;
  version: number;
  gravity: number;
  danger: number;
  message: string;
};

const PLAYER_RADIUS = 0.45;
const PLAYER_HEIGHT = 1.8;
const BASE_RADIUS = 13;
const LOOKAHEAD_HEIGHT = 42;
const FALL_DEATH_Y = -14;

export function GameCanvas({
  versionId,
  baseAltitude,
  hazardRate,
  enemySpeed,
  lootMultiplier,
  tiles,
  runNonce,
  onAltitudeChange
}: Props) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const arenaRef = useRef<ArenaState>({
    versionId,
    baseAltitude,
    hazardRate,
    enemySpeed,
    lootMultiplier,
    tiles
  });
  const runNonceRef = useRef(runNonce);

  const [hud, setHud] = useState<Hud>({
    altitude: 0,
    bestAltitude: 0,
    score: 0,
    version: versionId,
    gravity: 28,
    danger: hazardRate,
    message: "World is live. Keep moving up."
  });

  useEffect(() => {
    arenaRef.current = { versionId, baseAltitude, hazardRate, enemySpeed, lootMultiplier, tiles };
  }, [versionId, baseAltitude, hazardRate, enemySpeed, lootMultiplier, tiles]);

  useEffect(() => {
    runNonceRef.current = runNonce;
  }, [runNonce]);

  useEffect(() => {
    if (!hostRef.current) return;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x050a14);
    scene.fog = new THREE.Fog(0x050a14, 20, 150);

    const camera = new THREE.PerspectiveCamera(62, 4 / 3, 0.1, 300);
    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    hostRef.current.appendChild(renderer.domElement);

    const hemi = new THREE.HemisphereLight(0xdbeafe, 0x1e293b, 0.95);
    scene.add(hemi);

    const sun = new THREE.DirectionalLight(0xffffff, 1.2);
    sun.position.set(14, 32, 12);
    scene.add(sun);

    const skyRing = new THREE.Mesh(
      new THREE.TorusGeometry(46, 0.24, 20, 200),
      new THREE.MeshStandardMaterial({ color: 0x38bdf8, emissive: 0x0c4a6e, roughness: 0.28 })
    );
    skyRing.rotation.x = Math.PI / 2;
    skyRing.position.y = 36;
    scene.add(skyRing);

    const cloudLayer = new THREE.Group();
    scene.add(cloudLayer);
    for (let i = 0; i < 16; i += 1) {
      const puff = new THREE.Mesh(
        new THREE.SphereGeometry(1.2 + Math.random() * 1.5, 10, 10),
        new THREE.MeshStandardMaterial({ color: 0xe2e8f0, roughness: 0.8, transparent: true, opacity: 0.55 })
      );
      puff.position.set((Math.random() - 0.5) * 52, Math.random() * 50, (Math.random() - 0.5) * 52);
      cloudLayer.add(puff);
    }

    const player = new THREE.Group();
    const body = new THREE.Mesh(
      new THREE.CapsuleGeometry(PLAYER_RADIUS, 0.95, 6, 12),
      new THREE.MeshStandardMaterial({ color: 0xf8fafc, roughness: 0.28, emissive: 0x0f172a })
    );
    const visor = new THREE.Mesh(
      new THREE.SphereGeometry(0.23, 14, 14),
      new THREE.MeshStandardMaterial({ color: 0x22d3ee, emissive: 0x0e7490, roughness: 0.15 })
    );
    visor.position.set(0, 0.35, 0.26);
    player.add(body);
    player.add(visor);
    scene.add(player);

    const platforms: Platform[] = [];
    const bumpers: Bumper[] = [];
    const rotors: Rotor[] = [];
    const patchColliders: PatchCollider[] = [];

    const keys: Record<string, boolean> = {
      ArrowUp: false,
      ArrowDown: false,
      ArrowLeft: false,
      ArrowRight: false,
      w: false,
      a: false,
      s: false,
      d: false,
      Shift: false,
      " ": false
    };

    const vel = new THREE.Vector3(0, 0, 0);
    const moveDir = new THREE.Vector3(0, 0, -1);

    let elapsed = 0;
    let bestAltitude = 0;
    let score = 0;
    let notice = "World is live. Keep moving up.";
    let running = false;

    let grounded = false;
    let coyoteTime = 0;
    let jumpBuffer = 0;
    let jumpHold = 0;
    let wasJumpDown = false;

    let dashBoost = 0;
    let dashCooldown = 0;
    let knockbackCooldown = 0;

    let highestPlatformY = arenaRef.current.baseAltitude + 1.2;
    let spawnPoint = new THREE.Vector3(0, highestPlatformY + PLAYER_HEIGHT / 2 + 0.36, 0);
    let currentVersion = arenaRef.current.versionId;
    let seenRunNonce = runNonceRef.current;

    let physics: PhysicsConfig = {
      gravity: 28,
      collisionPush: 6,
      platformDriftScale: 1,
      rotorSpeedScale: 1,
      bumperSpeedScale: 1,
      obstacleSpawnRate: 0.18
    };
    let rngState = 1;
    const rand = () => {
      rngState = (rngState * 1664525 + 1013904223) % 4294967296;
      return rngState / 4294967296;
    };
    const reseed = (salt: number) => {
      rngState = Math.max(1, Math.floor(salt) >>> 0);
    };
    let genX = 0;
    let genY = 0;
    let genZ = 0;
    let genAngle = 0;

    let lastTick = performance.now();
    let lastHudSync = 0;

    const updateRendererSize = () => {
      if (!hostRef.current) return;
      const width = Math.max(320, hostRef.current.clientWidth);
      const height = Math.max(360, Math.round(width * 0.72));
      renderer.setSize(width, height, false);
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
    };

    const setPhysicsFromChain = () => {
      const s = arenaRef.current;
      physics = {
        gravity: THREE.MathUtils.clamp(16 + s.hazardRate * 0.24 + s.enemySpeed * 2.8, 16, 52),
        collisionPush: THREE.MathUtils.clamp(5 + s.hazardRate * 0.14 + s.enemySpeed * 1.2, 5, 22),
        platformDriftScale: THREE.MathUtils.clamp(0.7 + s.enemySpeed * 0.95 + s.hazardRate * 0.01, 0.7, 4.5),
        rotorSpeedScale: THREE.MathUtils.clamp(0.8 + s.enemySpeed * 0.9 + s.hazardRate * 0.008, 0.8, 4.8),
        bumperSpeedScale: THREE.MathUtils.clamp(0.8 + s.enemySpeed * 0.65 + s.hazardRate * 0.007, 0.8, 4.2),
        obstacleSpawnRate: THREE.MathUtils.clamp(0.12 + s.hazardRate * 0.004 + s.enemySpeed * 0.035, 0.12, 0.7)
      };
    };

    const clearArena = () => {
      for (const p of platforms) scene.remove(p.mesh);
      for (const b of bumpers) scene.remove(b.mesh);
      for (const r of rotors) scene.remove(r.pivot);
      for (const c of patchColliders) scene.remove(c.mesh);
      platforms.length = 0;
      bumpers.length = 0;
      rotors.length = 0;
      patchColliders.length = 0;
    };

    const createPlatform = (x: number, y: number, z: number, size: number, drift: boolean) => {
      const mesh = new THREE.Mesh(
        new THREE.BoxGeometry(size, 0.58, size),
        new THREE.MeshStandardMaterial({ color: 0x1d4ed8, roughness: 0.38, metalness: 0.14 })
      );
      mesh.position.set(x, y, z);
      scene.add(mesh);

      const p: Platform = {
        mesh,
        size: new THREE.Vector3(size, 0.58, size),
        driftAxis: Math.random() > 0.5 ? "x" : "z",
        driftSpeed: drift ? THREE.MathUtils.lerp(0.5, 1.2, Math.random()) : 0,
        driftAmp: drift ? THREE.MathUtils.lerp(0.35, 1.15, Math.random()) : 0,
        driftPhase: Math.random() * Math.PI * 2,
        baseX: x,
        baseZ: z
      };
      platforms.push(p);
      highestPlatformY = Math.max(highestPlatformY, y);
      return p;
    };

    const createRotor = (x: number, y: number, z: number, length: number, speed: number) => {
      const pivot = new THREE.Group();
      pivot.position.set(x, y, z);
      const bar = new THREE.Mesh(
        new THREE.BoxGeometry(0.42, 0.3, length),
        new THREE.MeshStandardMaterial({ color: 0xfb7185, roughness: 0.24, metalness: 0.16 })
      );
      pivot.add(bar);
      scene.add(pivot);
      rotors.push({ pivot, width: 0.42, height: 0.3, length, speed });
    };

    const createBumper = (x: number, y: number, z: number, radius: number, speed: number) => {
      const mesh = new THREE.Mesh(
        new THREE.SphereGeometry(0.63, 14, 14),
        new THREE.MeshStandardMaterial({ color: 0xa78bfa, emissive: 0x5b21b6, roughness: 0.24 })
      );
      mesh.position.set(x, y, z);
      scene.add(mesh);
      bumpers.push({ mesh, center: mesh.position.clone(), radius, speed, phase: Math.random() * Math.PI * 2 });
    };

    const buildInitialMap = () => {
      clearArena();
      setPhysicsFromChain();

      const startY = arenaRef.current.baseAltitude + 1.2;
      highestPlatformY = startY;
      reseed(
        currentVersion * 97 +
          Math.round(arenaRef.current.hazardRate * 13) +
          Math.round(arenaRef.current.enemySpeed * 29) +
          Math.round(arenaRef.current.baseAltitude * 11)
      );

      genX = 0;
      genY = startY;
      genZ = 0;
      genAngle = rand() * Math.PI * 2;

      const start = createPlatform(genX, genY, genZ, 4.3, false);
      spawnPoint.set(start.mesh.position.x, start.mesh.position.y + start.size.y / 2 + PLAYER_HEIGHT / 2 + 0.05, start.mesh.position.z);
      player.position.set(spawnPoint.x, spawnPoint.y, spawnPoint.z);

      const ensureGeneratedAhead = (targetY: number) => {
        let guard = 0;
        while (highestPlatformY < targetY && guard < 180) {
          const dist = THREE.MathUtils.lerp(3.8, 6.4, rand()) * THREE.MathUtils.clamp(0.95 + arenaRef.current.enemySpeed * 0.06, 0.9, 1.16);
          const rise = THREE.MathUtils.lerp(2.2, 3.8, rand()) * THREE.MathUtils.clamp(0.96 + arenaRef.current.lootMultiplier * 0.05, 0.9, 1.15);
          genAngle += THREE.MathUtils.lerp(-1.05, 1.05, rand());

          genX += Math.cos(genAngle) * dist;
          genZ += Math.sin(genAngle) * dist;
          genY += rise;

          const radial = Math.hypot(genX, genZ);
          if (radial > BASE_RADIUS) {
            const scale = BASE_RADIUS / radial;
            genX *= scale;
            genZ *= scale;
          }

          const size = THREE.MathUtils.lerp(3.2, 5.1, rand());
          const driftChance = THREE.MathUtils.clamp(0.2 + arenaRef.current.hazardRate * 0.0025, 0.2, 0.72);
          const drift = rand() < driftChance;
          createPlatform(genX, genY, genZ, size, drift);

          if (rand() < 0.2) {
            const sideA = genAngle + (rand() > 0.5 ? 1 : -1) * THREE.MathUtils.lerp(0.45, 1.15, rand());
            createPlatform(
              genX + Math.cos(sideA) * THREE.MathUtils.lerp(2.2, 4.4, rand()),
              genY + THREE.MathUtils.lerp(-0.35, 0.7, rand()),
              genZ + Math.sin(sideA) * THREE.MathUtils.lerp(2.2, 4.4, rand()),
              THREE.MathUtils.lerp(2.4, 3.5, rand()),
              rand() < driftChance * 0.6
            );
          }

          if (rand() < physics.obstacleSpawnRate) {
            createBumper(
              genX + (rand() - 0.5) * 3.2,
              genY + THREE.MathUtils.lerp(0.8, 2.5, rand()),
              genZ + (rand() - 0.5) * 3.2,
              THREE.MathUtils.lerp(0.8, 1.5, rand()),
              THREE.MathUtils.lerp(0.45, 1.1, rand())
            );
          }

          if (rand() < physics.obstacleSpawnRate * 0.85) {
            createRotor(
              genX + (rand() - 0.5) * 2.2,
              genY + THREE.MathUtils.lerp(1.2, 2.8, rand()),
              genZ + (rand() - 0.5) * 2.2,
              THREE.MathUtils.lerp(7, 12, rand()),
              THREE.MathUtils.lerp(0.5, 1.25, rand()) * (rand() > 0.5 ? 1 : -1)
            );
          }

          guard += 1;
        }
      };

      ensureGeneratedAhead(startY + LOOKAHEAD_HEIGHT);

      for (const [key, value] of arenaRef.current.tiles.slice(0, 18)) {
        const [gxRaw, gyRaw] = key.split(":");
        const gx = Number(gxRaw);
        const gy = Number(gyRaw);
        if (!Number.isFinite(gx) || !Number.isFinite(gy)) continue;

        const a = THREE.MathUtils.mapLinear(gx, 0, 19, 0, Math.PI * 2);
        const r = THREE.MathUtils.mapLinear(gy, 0, 19, 2.1, BASE_RADIUS - 1.3);
        const yPos = THREE.MathUtils.mapLinear((gx + gy) % 10, 0, 9, startY + 4, highestPlatformY - 2);

        if (value === "HAZARD") {
          const cone = new THREE.Mesh(
            new THREE.ConeGeometry(0.45, 1.05, 8),
            new THREE.MeshStandardMaterial({ color: 0xfb923c, emissive: 0x9a3412, roughness: 0.32 })
          );
          cone.position.set(Math.cos(a) * r, yPos, Math.sin(a) * r);
          scene.add(cone);
          patchColliders.push({ mesh: cone, pos: cone.position.clone(), radius: 0.84 });
        }

        if (value === "BLOCKED") {
          const box = new THREE.Mesh(
            new THREE.BoxGeometry(1, 1.8, 1),
            new THREE.MeshStandardMaterial({ color: 0x475569, roughness: 0.44 })
          );
          box.position.set(Math.cos(a) * r, yPos, Math.sin(a) * r);
          scene.add(box);
          patchColliders.push({ mesh: box, pos: box.position.clone(), radius: 0.86 });
        }
      }

      notice = `Run started at altitude ${Math.round(startY)}.`;
    };

    const ensureGeneratedAhead = (targetY: number) => {
      let guard = 0;
      while (highestPlatformY < targetY && guard < 140) {
        const dist = THREE.MathUtils.lerp(3.8, 6.4, rand()) * THREE.MathUtils.clamp(0.95 + arenaRef.current.enemySpeed * 0.06, 0.9, 1.16);
        const rise = THREE.MathUtils.lerp(2.2, 3.8, rand()) * THREE.MathUtils.clamp(0.96 + arenaRef.current.lootMultiplier * 0.05, 0.9, 1.15);
        genAngle += THREE.MathUtils.lerp(-1.05, 1.05, rand());

        genX += Math.cos(genAngle) * dist;
        genZ += Math.sin(genAngle) * dist;
        genY += rise;

        const radial = Math.hypot(genX, genZ);
        if (radial > BASE_RADIUS) {
          const scale = BASE_RADIUS / radial;
          genX *= scale;
          genZ *= scale;
        }

        const size = THREE.MathUtils.lerp(3.2, 5.1, rand());
        const driftChance = THREE.MathUtils.clamp(0.14 + arenaRef.current.hazardRate * 0.0018, 0.14, 0.4);
        const drift = rand() < driftChance;
        createPlatform(genX, genY, genZ, size, drift);

        if (rand() < 0.14) {
          const sideA = genAngle + (rand() > 0.5 ? 1 : -1) * THREE.MathUtils.lerp(0.45, 1.15, rand());
          createPlatform(
            genX + Math.cos(sideA) * THREE.MathUtils.lerp(2.2, 4.4, rand()),
            genY + THREE.MathUtils.lerp(-0.35, 0.7, rand()),
            genZ + Math.sin(sideA) * THREE.MathUtils.lerp(2.2, 4.4, rand()),
            THREE.MathUtils.lerp(2.4, 3.5, rand()),
            rand() < driftChance * 0.6
          );
        }
        if (rand() < THREE.MathUtils.clamp(0.04 + arenaRef.current.hazardRate * 0.001, 0.04, 0.2)) {
          createBumper(
            genX + (rand() - 0.5) * 3.2,
            genY + THREE.MathUtils.lerp(0.8, 2.5, rand()),
            genZ + (rand() - 0.5) * 3.2,
            THREE.MathUtils.lerp(0.8, 1.5, rand()),
            THREE.MathUtils.lerp(0.45, 1.1, rand())
          );
        }

        if (rand() < THREE.MathUtils.clamp(0.03 + arenaRef.current.enemySpeed * 0.035, 0.03, 0.2)) {
          createRotor(
            genX + (rand() - 0.5) * 2.2,
            genY + THREE.MathUtils.lerp(1.2, 2.8, rand()),
            genZ + (rand() - 0.5) * 2.2,
            THREE.MathUtils.lerp(7, 12, rand()),
            THREE.MathUtils.lerp(0.5, 1.25, rand()) * (rand() > 0.5 ? 1 : -1)
          );
        }

        guard += 1;
      }
    };

    const recoverToNearestPlatform = () => {
      let candidate: Platform | null = null;
      let bestY = -Infinity;
      for (const p of platforms) {
        const y = p.mesh.position.y + p.size.y / 2;
        if (y > bestY && y <= player.position.y + 8) {
          bestY = y;
          candidate = p;
        }
      }

      if (!candidate) {
        player.position.set(spawnPoint.x, spawnPoint.y, spawnPoint.z);
        vel.set(0, 0, 0);
        return;
      }

      player.position.set(
        candidate.mesh.position.x,
        candidate.mesh.position.y + candidate.size.y / 2 + PLAYER_HEIGHT / 2 + 0.05,
        candidate.mesh.position.z
      );
      vel.set(0, 0, 0);
      grounded = false;
      coyoteTime = 0;
      jumpBuffer = 0;
      notice = "Recovered from fall. Keep going up.";
    };

    const updateMovingPlatforms = (timeSec: number) => {
      for (const p of platforms) {
        if (p.driftAmp > 0) {
          const offset = Math.sin(timeSec * p.driftSpeed * physics.platformDriftScale + p.driftPhase) * p.driftAmp;
          if (p.driftAxis === "x") {
            p.mesh.position.x = p.baseX + offset;
          } else {
            p.mesh.position.z = p.baseZ + offset;
          }
        }
      }

      for (const b of bumpers) {
        b.phase += b.speed * 0.016 * physics.bumperSpeedScale;
        b.mesh.position.x = b.center.x + Math.cos(b.phase) * b.radius;
        b.mesh.position.z = b.center.z + Math.sin(b.phase) * b.radius;
      }

      for (const r of rotors) {
        r.pivot.rotation.y += r.speed * 0.016 * physics.rotorSpeedScale;
      }

      for (const c of patchColliders) {
        c.mesh.rotation.y += 0.02;
      }
    };

    const getSupport = (x: number, z: number, footY: number, prevFootY: number): { top: number } | null => {
      let bestTop: number | null = null;

      for (const p of platforms) {
        const px = p.mesh.position.x;
        const py = p.mesh.position.y;
        const pz = p.mesh.position.z;
        const top = py + p.size.y / 2;

        const halfX = p.size.x / 2 + PLAYER_RADIUS * 0.75;
        const halfZ = p.size.z / 2 + PLAYER_RADIUS * 0.75;
        const within = Math.abs(x - px) <= halfX && Math.abs(z - pz) <= halfZ;
        if (!within) continue;

        const crossed = prevFootY >= top - 0.25 && footY <= top + 0.14;
        const standing = Math.abs(footY - top) <= 0.2;
        if (!crossed && !standing) continue;

        if (bestTop === null || top > bestTop) {
          bestTop = top;
        }
      }

      return bestTop === null ? null : { top: bestTop };
    };

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key in keys) keys[e.key] = true;
    };

    const onKeyUp = (e: KeyboardEvent) => {
      if (e.key in keys) keys[e.key] = false;
    };

    const onResize = () => updateRendererSize();

    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    window.addEventListener("resize", onResize);

    const applyImpulse = (source: any, label: string) => {
      if (knockbackCooldown > 0) return;
      const push = player.position.clone().sub(source);
      push.y = 0;
      if (push.lengthSq() < 0.0001) push.set(0.001, 0, 1);
      push.normalize();

      vel.x = push.x * physics.collisionPush;
      vel.z = push.z * physics.collisionPush;
      vel.y = Math.max(vel.y, 2.6 + arenaRef.current.enemySpeed * 0.2);
      knockbackCooldown = 0.2;
      notice = label;
    };

    const applyInput = (delta: number) => {
      const f = Number(keys.ArrowUp || keys.w) - Number(keys.ArrowDown || keys.s);
      const s = Number(keys.ArrowRight || keys.d) - Number(keys.ArrowLeft || keys.a);

      const input = new THREE.Vector3(s, 0, -f);
      if (input.lengthSq() > 0) {
        input.normalize();
        moveDir.lerp(input, 0.4);
      }

      const jumpDown = keys[" "];
      const jumpPressed = jumpDown && !wasJumpDown;
      wasJumpDown = jumpDown;
      if (jumpPressed) jumpBuffer = 0.14;

      if (jumpBuffer > 0 && coyoteTime > 0) {
        vel.y = 11.2;
        grounded = false;
        coyoteTime = 0;
        jumpBuffer = 0;
        jumpHold = 0.2;
      }

      if (jumpDown && jumpHold > 0) {
        vel.y += 28 * delta;
        jumpHold -= delta;
      } else {
        jumpHold = 0;
      }

      if (keys.Shift && dashCooldown <= 0) {
        dashBoost = 0.15;
        dashCooldown = 1.0;
      }

      const moveSpeed = 8.4 * (1 + arenaRef.current.enemySpeed * 0.07) * (dashBoost > 0 ? 2 : 1);
      const targetX = moveDir.x * moveSpeed * (input.lengthSq() > 0 ? 1 : 0);
      const targetZ = moveDir.z * moveSpeed * (input.lengthSq() > 0 ? 1 : 0);

      const accel = grounded ? 19 : 11;
      vel.x = THREE.MathUtils.lerp(vel.x, targetX, Math.min(1, accel * delta));
      vel.z = THREE.MathUtils.lerp(vel.z, targetZ, Math.min(1, accel * delta));

      if (input.lengthSq() > 0.01) {
        player.rotation.y = Math.atan2(moveDir.x, moveDir.z);
      }

      dashBoost = Math.max(0, dashBoost - delta);
      dashCooldown = Math.max(0, dashCooldown - delta);
      jumpBuffer = Math.max(0, jumpBuffer - delta);
      coyoteTime = Math.max(0, coyoteTime - delta);
      knockbackCooldown = Math.max(0, knockbackCooldown - delta);
    };

    const applyPhysics = (delta: number) => {
      const prevFootY = player.position.y - PLAYER_HEIGHT / 2;

      // Mario-like jump arc: lighter gravity when rising with button held, heavier when falling.
      const jumpDown = keys[" "];
      let gravity = physics.gravity;
      if (vel.y > 0) {
        gravity = jumpDown ? physics.gravity * 0.62 : physics.gravity * 1.5;
      } else {
        gravity = physics.gravity * 1.2;
      }

      vel.y -= gravity * delta;

      player.position.x += vel.x * delta;
      player.position.z += vel.z * delta;
      player.position.y += vel.y * delta;

      const footY = player.position.y - PLAYER_HEIGHT / 2;
      const support = getSupport(player.position.x, player.position.z, footY, prevFootY);

      if (support && vel.y <= 0) {
        player.position.y = support.top + PLAYER_HEIGHT / 2;
        vel.y = 0;
        grounded = true;
        coyoteTime = 0.12;
      } else {
        grounded = false;
      }

      if (player.position.y < FALL_DEATH_Y) {
        recoverToNearestPlatform();
      }
    };

    const updateCollisions = () => {
      for (const r of rotors) {
        const rel = player.position.clone().sub(r.pivot.position);
        rel.applyAxisAngle(new THREE.Vector3(0, 1, 0), -r.pivot.rotation.y);

        const hitY = Math.abs(rel.y) <= r.height / 2 + PLAYER_HEIGHT * 0.46;
        const hitX = Math.abs(rel.x) <= r.width / 2 + PLAYER_RADIUS;
        const hitZ = Math.abs(rel.z) <= r.length / 2 + PLAYER_RADIUS;
        if (hitY && hitX && hitZ) {
          applyImpulse(r.pivot.position, "Rotor collision.");
        }
      }

      for (const b of bumpers) {
        if (player.position.distanceTo(b.mesh.position) < 1.08) {
          applyImpulse(b.mesh.position, "Bumper collision.");
        }
      }

      for (const c of patchColliders) {
        if (player.position.distanceTo(c.pos) < c.radius) {
          applyImpulse(c.pos, "Patch collider impact.");
        }
      }
    };

    const maybeApplyChainChaos = () => {
      if (arenaRef.current.versionId === currentVersion) return;
      currentVersion = arenaRef.current.versionId;
      setPhysicsFromChain();
      reseed(
        rngState ^
          (currentVersion * 8191 +
            Math.round(arenaRef.current.hazardRate * 37) +
            Math.round(arenaRef.current.enemySpeed * 101) +
            Math.round(arenaRef.current.lootMultiplier * 151))
      );
      notice = `On-chain chaos v${currentVersion}: gravity ${physics.gravity.toFixed(1)}, push ${physics.collisionPush.toFixed(1)}.`;
    };

    const updateCamera = (delta: number) => {
      const behind = new THREE.Vector3(0, 9.5, 8.8);
      const desired = player.position.clone().add(behind);
      camera.position.lerp(desired, Math.min(1, delta * 4.3));
      camera.lookAt(player.position.x, player.position.y + 1.0, player.position.z);
    };

    updateRendererSize();
    buildInitialMap();
    // Auto-start when user opens page.
    running = true;

    const frame = () => {
      const now = performance.now();
      const delta = Math.min(0.05, (now - lastTick) / 1000);
      const nowSec = now / 1000;
      lastTick = now;

      if (runNonceRef.current !== seenRunNonce) {
        seenRunNonce = runNonceRef.current;
        running = true;
        recoverToNearestPlatform();
        notice = "Run recentered. Keep climbing.";
      }

      maybeApplyChainChaos();
      ensureGeneratedAhead(player.position.y + LOOKAHEAD_HEIGHT);

      if (running) {
        elapsed += delta;
        bestAltitude = Math.max(bestAltitude, player.position.y);
        score = Math.round(elapsed * (100 + arenaRef.current.lootMultiplier * 28));

        updateMovingPlatforms(nowSec);
        applyInput(delta);
        applyPhysics(delta);
        updateCollisions();
      }

      skyRing.rotation.z += delta * 0.17;
      updateCamera(delta);
      renderer.render(scene, camera);

      if (now - lastHudSync > 120) {
        lastHudSync = now;
        onAltitudeChange?.(player.position.y);
        setHud({
          altitude: Math.max(0, player.position.y),
          bestAltitude,
          score,
          version: arenaRef.current.versionId,
          gravity: physics.gravity,
          danger: arenaRef.current.hazardRate,
          message: notice
        });
      }

      requestAnimationFrame(frame);
    };

    requestAnimationFrame(frame);

    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      window.removeEventListener("resize", onResize);
      clearArena();
      renderer.dispose();
      hostRef.current?.removeChild(renderer.domElement);
    };
  }, []);

  return (
    <div className="game-canvas" ref={hostRef}>
      <div className="game-overlay">
        <div className="game-line">v{hud.version} | Gravity {hud.gravity.toFixed(1)} | Danger {hud.danger}%</div>
        <div className="game-line">Altitude {hud.altitude.toFixed(1)} | Best {hud.bestAltitude.toFixed(1)} | Score {hud.score}</div>
        <div className="game-note">{hud.message}</div>
      </div>
    </div>
  );
}
