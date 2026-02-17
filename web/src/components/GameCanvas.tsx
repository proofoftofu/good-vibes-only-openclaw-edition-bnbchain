import { useEffect, useRef, useState } from "react";
import * as THREE from "three";

interface Props {
  versionId: number;
  hazardRate: number;
  enemySpeed: number;
  lootMultiplier: number;
  tiles: [string, string][];
  runNonce: number;
}

type Platform = {
  mesh: any;
  size: any;
};

type Hazard = {
  mesh: any;
  base: any;
  axis: "x" | "z";
  range: number;
  phase: number;
};

type Orb = {
  mesh: any;
  taken: boolean;
};

type ArenaState = {
  versionId: number;
  hazardRate: number;
  enemySpeed: number;
  lootMultiplier: number;
  tiles: [string, string][];
};

type Hud = {
  hp: number;
  time: number;
  orbs: number;
  score: number;
  version: number;
  message: string;
};

const WORLD_BOUNDS = {
  minX: -12,
  maxX: 18,
  minZ: -8,
  maxZ: 8
};

export function GameCanvas({ versionId, hazardRate, enemySpeed, lootMultiplier, tiles, runNonce }: Props) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const arenaRef = useRef<ArenaState>({ versionId, hazardRate, enemySpeed, lootMultiplier, tiles });
  const runNonceRef = useRef(runNonce);

  const [hud, setHud] = useState<Hud>({
    hp: 100,
    time: 90,
    orbs: 0,
    score: 0,
    version: versionId,
    message: "Press Start Run"
  });

  useEffect(() => {
    arenaRef.current = { versionId, hazardRate, enemySpeed, lootMultiplier, tiles };
  }, [versionId, hazardRate, enemySpeed, lootMultiplier, tiles]);

  useEffect(() => {
    runNonceRef.current = runNonce;
  }, [runNonce]);

  useEffect(() => {
    if (!hostRef.current) return;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x070d1a);
    scene.fog = new THREE.Fog(0x070d1a, 12, 45);

    const camera = new THREE.PerspectiveCamera(62, 4 / 3, 0.1, 120);
    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    hostRef.current.appendChild(renderer.domElement);

    const hemi = new THREE.HemisphereLight(0xbbe7ff, 0x223344, 1.05);
    scene.add(hemi);

    const dir = new THREE.DirectionalLight(0xffffff, 1.2);
    dir.position.set(10, 16, 8);
    scene.add(dir);

    const skyRing = new THREE.Mesh(
      new THREE.TorusGeometry(24, 0.18, 18, 120),
      new THREE.MeshStandardMaterial({ color: 0x0ea5e9, emissive: 0x082f49, metalness: 0.2, roughness: 0.4 })
    );
    skyRing.rotation.x = Math.PI / 2;
    skyRing.position.y = 12;
    scene.add(skyRing);

    const lava = new THREE.Mesh(
      new THREE.PlaneGeometry(80, 80),
      new THREE.MeshStandardMaterial({ color: 0xdc2626, emissive: 0x7f1d1d, metalness: 0.1, roughness: 0.8 })
    );
    lava.rotation.x = -Math.PI / 2;
    lava.position.y = -4;
    scene.add(lava);

    const platformMat = new THREE.MeshStandardMaterial({ color: 0x1d4ed8, roughness: 0.45, metalness: 0.2 });
    const platformTopMat = new THREE.MeshStandardMaterial({ color: 0x38bdf8, roughness: 0.3, metalness: 0.15 });

    const platforms: Platform[] = [];
    const addPlatform = (x: number, y: number, z: number, w: number, h: number, d: number) => {
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), [platformMat, platformMat, platformTopMat, platformMat, platformMat, platformMat]);
      mesh.position.set(x, y, z);
      scene.add(mesh);
      platforms.push({ mesh, size: new THREE.Vector3(w, h, d) });
    };

    addPlatform(-8, 0, 0, 8, 1, 8);
    addPlatform(-1.5, 1.5, 0, 5, 1, 5);
    addPlatform(4.5, 3, -1.5, 5, 1, 5);
    addPlatform(10.5, 4.5, 1.5, 5, 1, 5);
    addPlatform(15, 6, 0, 6, 1, 6);

    const goal = new THREE.Mesh(
      new THREE.ConeGeometry(0.8, 2, 10),
      new THREE.MeshStandardMaterial({ color: 0x22c55e, emissive: 0x14532d, roughness: 0.35 })
    );
    goal.position.set(15, 7.6, 0);
    scene.add(goal);

    const player = new THREE.Group();
    const body = new THREE.Mesh(
      new THREE.CapsuleGeometry(0.45, 0.9, 4, 8),
      new THREE.MeshStandardMaterial({ color: 0xf8fafc, emissive: 0x1e293b, roughness: 0.3 })
    );
    const visor = new THREE.Mesh(
      new THREE.SphereGeometry(0.22, 12, 12),
      new THREE.MeshStandardMaterial({ color: 0x38bdf8, emissive: 0x082f49, roughness: 0.2 })
    );
    visor.position.set(0, 0.35, 0.28);
    player.add(body);
    player.add(visor);
    scene.add(player);

    const hazards: Hazard[] = [];
    const orbs: Orb[] = [];
    const patchHazards: any[] = [];

    const keys: Record<string, boolean> = {
      ArrowUp: false,
      ArrowDown: false,
      ArrowLeft: false,
      ArrowRight: false,
      w: false,
      a: false,
      s: false,
      d: false,
      " ": false,
      Shift: false
    };

    const velocity = new THREE.Vector3(0, 0, 0);
    const moveDir = new THREE.Vector3(1, 0, 0);

    let hp = 100;
    let score = 0;
    let remaining = 90;
    let orbCount = 0;
    let running = false;
    let grounded = false;
    let invuln = 0;
    let dashCooldown = 0;
    let dashBoost = 0;
    let lastTick = performance.now();
    let lastHudSync = 0;
    let seenRunNonce = runNonceRef.current;
    let notice = "Press Start Run";

    const playerRadius = 0.45;
    const playerHeight = 1.8;
    const firstPlatformTop = 0.5;
    const startPlayerY = firstPlatformTop + playerHeight / 2 + 0.08;

    const updateRendererSize = () => {
      if (!hostRef.current) return;
      const width = Math.max(320, hostRef.current.clientWidth);
      const height = Math.max(360, Math.round(width * 0.72));
      renderer.setSize(width, height, false);
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
    };

    const clearArenaObjects = () => {
      for (const h of hazards) scene.remove(h.mesh);
      for (const o of orbs) scene.remove(o.mesh);
      for (const p of patchHazards) scene.remove(p);
      hazards.length = 0;
      orbs.length = 0;
      patchHazards.length = 0;
    };

    const rebuildArenaFromState = () => {
      clearArenaObjects();
      const arena = arenaRef.current;

      const hazardCount = THREE.MathUtils.clamp(Math.round(arena.hazardRate / 12), 3, 12);
      for (let i = 0; i < hazardCount; i += 1) {
        const mesh = new THREE.Mesh(
          new THREE.DodecahedronGeometry(0.45, 0),
          new THREE.MeshStandardMaterial({ color: 0xfb7185, emissive: 0x7f1d1d, roughness: 0.25 })
        );
        const base = new THREE.Vector3(
          THREE.MathUtils.randFloat(-6, 14),
          THREE.MathUtils.randFloat(1.3, 6.6),
          THREE.MathUtils.randFloat(-5, 5)
        );
        mesh.position.copy(base);
        scene.add(mesh);
        hazards.push({
          mesh,
          base,
          axis: i % 2 === 0 ? "x" : "z",
          range: THREE.MathUtils.randFloat(1.1, 3.4),
          phase: i * 0.65
        });
      }

      const orbTotal = THREE.MathUtils.clamp(Math.round(4 + arena.lootMultiplier * 2), 4, 9);
      for (let i = 0; i < orbTotal; i += 1) {
        const mesh = new THREE.Mesh(
          new THREE.IcosahedronGeometry(0.34, 0),
          new THREE.MeshStandardMaterial({ color: 0xfacc15, emissive: 0x854d0e, roughness: 0.25 })
        );
        mesh.position.set(
          THREE.MathUtils.randFloat(-8, 16),
          THREE.MathUtils.randFloat(1.2, 7.2),
          THREE.MathUtils.randFloat(-5.5, 5.5)
        );
        scene.add(mesh);
        orbs.push({ mesh, taken: false });
      }

      const tileEntries = arena.tiles.slice(0, 40);
      for (const [key, state] of tileEntries) {
        const [gxRaw, gyRaw] = key.split(":");
        const gx = Number(gxRaw);
        const gy = Number(gyRaw);
        if (!Number.isFinite(gx) || !Number.isFinite(gy)) continue;

        const x = THREE.MathUtils.mapLinear(gx, 0, 19, -10, 16);
        const z = THREE.MathUtils.mapLinear(gy, 0, 19, -6.5, 6.5);
        const y = THREE.MathUtils.mapLinear((gx + gy) % 5, 0, 4, 0.7, 6.2);

        if (state === "BLOCKED") {
          const mesh = new THREE.Mesh(
            new THREE.BoxGeometry(0.8, 1.5, 0.8),
            new THREE.MeshStandardMaterial({ color: 0x64748b, roughness: 0.5 })
          );
          mesh.position.set(x, y, z);
          scene.add(mesh);
          patchHazards.push(mesh);
        } else if (state === "HAZARD") {
          const mesh = new THREE.Mesh(
            new THREE.ConeGeometry(0.45, 1.2, 8),
            new THREE.MeshStandardMaterial({ color: 0xf97316, emissive: 0x9a3412, roughness: 0.3 })
          );
          mesh.position.set(x, y, z);
          scene.add(mesh);
          patchHazards.push(mesh);
        }
      }

      notice = `On-chain v${arena.versionId}: hazards=${arena.hazardRate} enemy=${arena.enemySpeed.toFixed(2)} loot=${arena.lootMultiplier.toFixed(2)}`;
    };

    const resetRun = () => {
      running = true;
      hp = 100;
      score = 0;
      orbCount = 0;
      remaining = 90;
      grounded = true;
      invuln = 0;
      dashBoost = 0;
      dashCooldown = 0;
      velocity.set(0, 0, 0);
      moveDir.set(1, 0, 0);

      player.position.set(-8, startPlayerY, 0);
      rebuildArenaFromState();
      notice = "Run started. Reach the green goal with at least 3 relic orbs.";
    };

    const isOnPlatform = (x: number, z: number, footY: number, previousFootY: number) => {
      for (const p of platforms) {
        const px = p.mesh.position.x;
        const py = p.mesh.position.y;
        const pz = p.mesh.position.z;
        const top = py + p.size.y / 2;
        const halfX = p.size.x / 2 + playerRadius * 0.75;
        const halfZ = p.size.z / 2 + playerRadius * 0.75;

        const within = Math.abs(x - px) <= halfX && Math.abs(z - pz) <= halfZ;
        const crossed = previousFootY >= top - 0.1 && footY <= top + 0.08;
        const standing = Math.abs(footY - top) <= 0.18 || Math.abs(previousFootY - top) <= 0.18;
        if (within && (crossed || standing)) {
          return top;
        }
      }
      return null;
    };

    const applyInput = (delta: number) => {
      const forward = Number(keys.ArrowUp || keys.w) - Number(keys.ArrowDown || keys.s);
      const sideways = Number(keys.ArrowRight || keys.d) - Number(keys.ArrowLeft || keys.a);

      const dirXZ = new THREE.Vector3(sideways, 0, -forward);
      if (dirXZ.lengthSq() > 0) {
        dirXZ.normalize();
        moveDir.lerp(dirXZ, 0.35);
      }

      if ((keys[" "] || keys.Space) && grounded) {
        velocity.y = 8.7;
        grounded = false;
      }

      if (keys.Shift && dashCooldown <= 0) {
        dashBoost = 0.18;
        dashCooldown = 1.2;
      }

      const baseSpeed = 7.5;
      const speedScale = 1 + arenaRef.current.enemySpeed * 0.08;
      const dashScale = dashBoost > 0 ? 2.5 : 1;
      const moveSpeed = baseSpeed * speedScale * dashScale;

      const vx = moveDir.x * moveSpeed * (dirXZ.lengthSq() > 0 ? 1 : 0);
      const vz = moveDir.z * moveSpeed * (dirXZ.lengthSq() > 0 ? 1 : 0);

      player.position.x = THREE.MathUtils.clamp(player.position.x + vx * delta, WORLD_BOUNDS.minX, WORLD_BOUNDS.maxX);
      player.position.z = THREE.MathUtils.clamp(player.position.z + vz * delta, WORLD_BOUNDS.minZ, WORLD_BOUNDS.maxZ);

      if (dirXZ.lengthSq() > 0.01) {
        const angle = Math.atan2(moveDir.x, moveDir.z);
        player.rotation.y = angle;
      }

      dashBoost = Math.max(0, dashBoost - delta);
      dashCooldown = Math.max(0, dashCooldown - delta);
    };

    const applyPhysics = (delta: number) => {
      const previousFoot = player.position.y - playerHeight / 2;
      velocity.y -= 18 * delta;
      player.position.y += velocity.y * delta;

      const foot = player.position.y - playerHeight / 2;
      const supportTop = isOnPlatform(player.position.x, player.position.z, foot, previousFoot);

      if (supportTop !== null && velocity.y <= 0) {
        player.position.y = supportTop + playerHeight / 2;
        velocity.y = 0;
        grounded = true;
      } else {
        grounded = false;
      }

      if (player.position.y < -3.2) {
        hp = 0;
        notice = "You fell into the abyss.";
      }
    };

    const updateArenaEntities = (elapsed: number, delta: number) => {
      const arena = arenaRef.current;
      const hazardSpeed = 0.8 + arena.enemySpeed * 0.45;

      for (const h of hazards) {
        const t = elapsed * hazardSpeed + h.phase;
        if (h.axis === "x") {
          h.mesh.position.x = h.base.x + Math.sin(t) * h.range;
        } else {
          h.mesh.position.z = h.base.z + Math.sin(t) * h.range;
        }
        h.mesh.rotation.x += delta * 1.8;
        h.mesh.rotation.y += delta * 1.2;

        const hitDist = 0.8;
        if (player.position.distanceTo(h.mesh.position) < hitDist && invuln <= 0) {
          hp -= THREE.MathUtils.clamp(6 + arena.hazardRate * 0.08, 6, 18);
          invuln = 0.5;
          notice = "Hit by sentinel hazard.";
        }
      }

      for (const patch of patchHazards) {
        if (player.position.distanceTo(patch.position) < 0.75 && invuln <= 0) {
          hp -= THREE.MathUtils.clamp(5 + arena.hazardRate * 0.06, 5, 14);
          invuln = 0.45;
          notice = "Touched a patched dungeon trap.";
        }
      }

      for (const orb of orbs) {
        if (orb.taken) continue;
        orb.mesh.rotation.y += delta * 1.7;
        orb.mesh.position.y += Math.sin(elapsed * 2.8 + orb.mesh.position.x) * 0.002;

        if (player.position.distanceTo(orb.mesh.position) < 0.85) {
          orb.taken = true;
          orb.mesh.visible = false;
          orbCount += 1;
          score += Math.round(25 * arena.lootMultiplier);
          notice = `Relic collected (${orbCount}).`;
        }
      }

      if (running && player.position.distanceTo(goal.position) < 1.1) {
        if (orbCount >= 3) {
          score += Math.round(remaining * 4 + hp * 2);
          running = false;
          notice = `Goal reached. Final score ${score}.`;
        } else {
          notice = "Goal locked. Collect at least 3 relic orbs.";
        }
      }

      const lavaDamage = THREE.MathUtils.clamp((arena.hazardRate - 20) * 0.015, 0, 1.4);
      if (running && lavaDamage > 0) {
        hp -= lavaDamage * delta;
      }

      goal.rotation.y += delta * 1.4;
      invuln = Math.max(0, invuln - delta);
    };

    const syncCamera = (delta: number) => {
      const followOffset = new THREE.Vector3(-4.8, 4.2, 6.6);
      const targetCam = player.position.clone().add(followOffset);
      camera.position.lerp(targetCam, Math.min(1, delta * 5));
      camera.lookAt(player.position.x + 1.2, player.position.y + 0.5, player.position.z);
    };

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key in keys) {
        keys[e.key] = true;
      }
    };

    const onKeyUp = (e: KeyboardEvent) => {
      if (e.key in keys) {
        keys[e.key] = false;
      }
    };

    const onResize = () => updateRendererSize();

    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    window.addEventListener("resize", onResize);

    updateRendererSize();
    rebuildArenaFromState();

    const frame = () => {
      const now = performance.now();
      const delta = Math.min(0.05, (now - lastTick) / 1000);
      const elapsed = now / 1000;
      lastTick = now;

      if (runNonceRef.current !== seenRunNonce) {
        seenRunNonce = runNonceRef.current;
        resetRun();
      }

      if (running) {
        remaining = Math.max(0, remaining - delta);
        applyInput(delta);
        applyPhysics(delta);
        updateArenaEntities(elapsed, delta);

        if (remaining <= 0 && running) {
          running = false;
          notice = `Time out. Final score ${score}.`;
        }
        if (hp <= 0 && running) {
          running = false;
          notice = "Run failed. Try again with better routing.";
        }
      }

      skyRing.rotation.z += delta * 0.2;
      syncCamera(delta);
      renderer.render(scene, camera);

      if (now - lastHudSync > 120) {
        lastHudSync = now;
        setHud({
          hp: Math.max(0, Math.round(hp)),
          time: Math.max(0, remaining),
          orbs: orbCount,
          score: Math.round(score),
          version: arenaRef.current.versionId,
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
      clearArenaObjects();
      renderer.dispose();
      hostRef.current?.removeChild(renderer.domElement);
    };
  }, []);

  return (
    <div className="game-canvas" ref={hostRef}>
      <div className="game-overlay">
        <div className="game-line">v{hud.version} | HP {hud.hp} | Time {hud.time.toFixed(1)}s</div>
        <div className="game-line">Relics {hud.orbs}/3 | Score {hud.score}</div>
        <div className="game-note">{hud.message}</div>
      </div>
    </div>
  );
}
