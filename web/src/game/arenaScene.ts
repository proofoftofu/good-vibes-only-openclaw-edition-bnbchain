import Phaser from "phaser";

const FIELD = {
  left: 40,
  top: 40,
  width: 560,
  height: 360,
  cols: 20,
  rows: 12
};

const CELL_W = FIELD.width / FIELD.cols;
const CELL_H = FIELD.height / FIELD.rows;

type TileState = "OPEN" | "BLOCKED" | "HAZARD";

type EnemyUnit = {
  sprite: Phaser.GameObjects.Sprite;
  hp: number;
  patrol: Phaser.Math.Vector2;
};

type Projectile = {
  sprite: Phaser.GameObjects.Sprite;
  dir: Phaser.Math.Vector2;
  speed: number;
  lifeMs: number;
};

interface TileRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface SceneInput {
  versionId: number;
  hazardRate: number;
  enemySpeed: number;
  lootMultiplier: number;
  tiles: [string, string][];
}

export class ArenaScene extends Phaser.Scene {
  private statsText?: Phaser.GameObjects.Text;
  private phaseText?: Phaser.GameObjects.Text;
  private timerText?: Phaser.GameObjects.Text;
  private scoreText?: Phaser.GameObjects.Text;
  private infoText?: Phaser.GameObjects.Text;
  private metaText?: Phaser.GameObjects.Text;

  private floorLayer?: Phaser.GameObjects.Container;
  private patchLayer?: Phaser.GameObjects.Container;

  private player?: Phaser.GameObjects.Sprite;
  private gate?: Phaser.GameObjects.Sprite;
  private gateText?: Phaser.GameObjects.Text;

  private cursors?: Phaser.Types.Input.Keyboard.CursorKeys;
  private wasd?: { w: Phaser.Input.Keyboard.Key; a: Phaser.Input.Keyboard.Key; s: Phaser.Input.Keyboard.Key; d: Phaser.Input.Keyboard.Key };
  private shiftKey?: Phaser.Input.Keyboard.Key;
  private spaceKey?: Phaser.Input.Keyboard.Key;

  private enemies: EnemyUnit[] = [];
  private relics: Phaser.GameObjects.Sprite[] = [];
  private hazards: Phaser.GameObjects.Sprite[] = [];
  private potions: Phaser.GameObjects.Sprite[] = [];
  private projectiles: Projectile[] = [];

  private blockedTiles: TileRect[] = [];
  private baseDungeonBlocked: TileRect[] = [];
  private tileHazards: TileRect[] = [];

  private running = false;
  private remainingMs = 0;
  private hp = 100;
  private score = 0;
  private shards = 0;
  private killCount = 0;
  private deathCause = "";

  private versionId = 0;
  private currentHazardRate = 30;
  private currentEnemySpeed = 1;
  private currentLootMultiplier = 1;

  private dashCooldownMs = 0;
  private dashBoostMs = 0;
  private attackCooldownMs = 0;
  private invulnMs = 0;
  private hazardSpawnMs = 0;
  private enemyWaveMs = 0;

  private moveDir = new Phaser.Math.Vector2(1, 0);
  private dashDir = new Phaser.Math.Vector2(1, 0);

  constructor() {
    super("ArenaScene");
  }

  create() {
    this.createTextures();

    this.add.rectangle(320, 240, 640, 480, 0x06111f);
    this.add.rectangle(320, 240, 604, 444, 0x0f1a2d).setStrokeStyle(2, 0x14b8a6);

    this.floorLayer = this.add.container(0, 0);
    this.patchLayer = this.add.container(0, 0);
    this.buildFloor();

    this.statsText = this.add.text(18, 10, "", { color: "#fef3c7", fontSize: "14px" });
    this.phaseText = this.add.text(18, 28, "", { color: "#d8b4fe", fontSize: "13px" });
    this.timerText = this.add.text(18, 46, "", { color: "#e2e8f0", fontSize: "13px" });
    this.scoreText = this.add.text(18, 64, "", { color: "#bbf7d0", fontSize: "13px" });
    this.infoText = this.add.text(18, 418, "Start run. Move: WASD/arrows. Dash: shift. Cast: space.", {
      color: "#dbeafe",
      fontSize: "12px"
    });
    this.metaText = this.add.text(18, 436, "On-chain mutation versions reshape this dungeon.", {
      color: "#94a3b8",
      fontSize: "12px"
    });

    this.player = this.add.sprite(FIELD.left + CELL_W * 2, FIELD.top + CELL_H * 2, "player").setDepth(10);
    this.gate = this.add.sprite(FIELD.left + FIELD.width - 20, FIELD.top + FIELD.height - 20, "gate_locked").setDepth(8);
    this.gateText = this.add.text(FIELD.left + FIELD.width - 48, FIELD.top + FIELD.height + 6, "LOCKED", {
      color: "#94a3b8",
      fontSize: "11px"
    });

    this.cursors = this.input.keyboard?.createCursorKeys();
    this.wasd = this.input.keyboard?.addKeys({
      w: Phaser.Input.Keyboard.KeyCodes.W,
      a: Phaser.Input.Keyboard.KeyCodes.A,
      s: Phaser.Input.Keyboard.KeyCodes.S,
      d: Phaser.Input.Keyboard.KeyCodes.D
    }) as typeof this.wasd;
    this.shiftKey = this.input.keyboard?.addKey(Phaser.Input.Keyboard.KeyCodes.SHIFT);
    this.spaceKey = this.input.keyboard?.addKey(Phaser.Input.Keyboard.KeyCodes.SPACE);

    this.syncHud();
  }

  update(_time: number, delta: number) {
    if (!this.running || !this.player || !this.cursors || !this.wasd) {
      return;
    }

    this.remainingMs = Math.max(0, this.remainingMs - delta);
    this.dashCooldownMs = Math.max(0, this.dashCooldownMs - delta);
    this.dashBoostMs = Math.max(0, this.dashBoostMs - delta);
    this.attackCooldownMs = Math.max(0, this.attackCooldownMs - delta);
    this.invulnMs = Math.max(0, this.invulnMs - delta);
    this.hazardSpawnMs = Math.max(0, this.hazardSpawnMs - delta);
    this.enemyWaveMs = Math.max(0, this.enemyWaveMs - delta);

    this.updateGateState();
    this.trySpawnHazards();
    this.trySpawnEnemyWave();
    this.movePlayer(delta);
    this.tryCastBolt();
    this.updateProjectiles(delta);
    this.updateEnemies(delta);
    this.checkPickups();
    this.checkDamage(delta);

    if (this.hp <= 0) {
      this.endRun(`Fell to ${this.deathCause || "dungeon pressure"}`);
      return;
    }

    if (this.remainingMs <= 0) {
      this.endRun("Collapse reached you");
      return;
    }

    this.syncHud();
  }

  startRun() {
    if (!this.player) return;

    this.running = true;
    this.remainingMs = 90000;
    this.hp = 100;
    this.score = 0;
    this.shards = 0;
    this.killCount = 0;
    this.deathCause = "";

    this.dashCooldownMs = 0;
    this.dashBoostMs = 0;
    this.attackCooldownMs = 0;
    this.invulnMs = 0;
    this.hazardSpawnMs = 1000;
    this.enemyWaveMs = 8000;

    this.moveDir.set(1, 0);
    this.dashDir.set(1, 0);
    this.player.setPosition(FIELD.left + CELL_W * 2, FIELD.top + CELL_H * 2).setTexture("player");

    this.clearDynamicObjects();
    this.generateDungeonObstacles();
    this.spawnEnemies(5);
    this.spawnRelics(6);

    this.infoText?.setText("Run live: secure 4 shards, then extract through the gate.");
    this.syncHud();
  }

  applyInput(input: SceneInput) {
    this.versionId = input.versionId;
    this.currentHazardRate = input.hazardRate;
    this.currentEnemySpeed = input.enemySpeed;
    this.currentLootMultiplier = input.lootMultiplier;
    this.applyPatchedTiles(input.tiles);
    this.syncHud();
  }

  private createTextures() {
    if (!this.textures.exists("floor")) {
      const g = this.add.graphics();
      g.fillStyle(0x1e293b, 1).fillRect(0, 0, 28, 28);
      g.lineStyle(1, 0x334155, 0.8).strokeRect(0, 0, 28, 28);
      g.generateTexture("floor", 28, 28);
      g.clear();

      g.fillStyle(0x334155, 1).fillRect(0, 0, 28, 28);
      g.lineStyle(1, 0x64748b, 1).strokeRect(0, 0, 28, 28);
      g.generateTexture("wall", 28, 28);
      g.clear();

      g.fillStyle(0x0ea5e9, 1).fillRect(0, 0, 18, 18);
      g.fillStyle(0xffffff, 1).fillRect(12, 4, 3, 3);
      g.generateTexture("player", 18, 18);
      g.clear();

      g.fillStyle(0xfb7185, 1).fillRect(0, 0, 16, 16);
      g.fillStyle(0x1f2937, 1).fillRect(4, 4, 3, 3);
      g.fillStyle(0x1f2937, 1).fillRect(9, 4, 3, 3);
      g.generateTexture("enemy", 16, 16);
      g.clear();

      g.fillStyle(0xfacc15, 1).fillRect(0, 0, 14, 14);
      g.fillStyle(0xfef3c7, 1).fillRect(4, 4, 6, 6);
      g.generateTexture("relic", 14, 14);
      g.clear();

      g.fillStyle(0xf97316, 1).fillTriangle(7, 0, 14, 14, 0, 14);
      g.generateTexture("hazard", 14, 14);
      g.clear();

      g.fillStyle(0x22c55e, 1).fillRect(0, 0, 20, 20);
      g.lineStyle(2, 0x86efac, 1).strokeRect(0, 0, 20, 20);
      g.generateTexture("gate_open", 20, 20);
      g.clear();

      g.fillStyle(0x334155, 1).fillRect(0, 0, 20, 20);
      g.lineStyle(2, 0x94a3b8, 1).strokeRect(0, 0, 20, 20);
      g.generateTexture("gate_locked", 20, 20);
      g.clear();

      g.fillStyle(0x38bdf8, 1).fillRect(0, 0, 8, 4);
      g.generateTexture("bolt", 8, 4);
      g.clear();

      g.fillStyle(0x22c55e, 1).fillRect(0, 0, 12, 12);
      g.fillStyle(0xf8fafc, 1).fillRect(4, 2, 4, 8);
      g.fillStyle(0xf8fafc, 1).fillRect(2, 4, 8, 4);
      g.generateTexture("potion", 12, 12);

      g.destroy();
    }
  }

  private buildFloor() {
    this.floorLayer?.removeAll(true);
    for (let y = 0; y < FIELD.rows; y += 1) {
      for (let x = 0; x < FIELD.cols; x += 1) {
        this.floorLayer?.add(this.add.image(FIELD.left + x * CELL_W + CELL_W / 2, FIELD.top + y * CELL_H + CELL_H / 2, "floor"));
      }
    }
  }

  private generateDungeonObstacles() {
    this.baseDungeonBlocked = [];

    for (let i = 0; i < 16; i += 1) {
      const gx = Phaser.Math.Between(2, FIELD.cols - 3);
      const gy = Phaser.Math.Between(1, FIELD.rows - 2);
      const isSpawnLane = gx <= 4 && gy <= 4;
      const isGateLane = gx >= FIELD.cols - 4 && gy >= FIELD.rows - 3;
      if (isSpawnLane || isGateLane) continue;

      const rect = this.rectFromGrid(gx, gy);
      this.baseDungeonBlocked.push(rect);
    }

    this.blockedTiles = [...this.baseDungeonBlocked];
    this.redrawPatchLayer();
  }

  private spawnEnemies(count: number) {
    for (let i = 0; i < count; i += 1) {
      const pos = this.randomOpenPoint();
      const sprite = this.add.sprite(pos.x, pos.y, "enemy").setDepth(9);
      this.enemies.push({ sprite, hp: 2, patrol: this.randomOpenPoint() });
    }
  }

  private spawnRelics(count: number) {
    for (let i = 0; i < count; i += 1) {
      const pos = this.randomOpenPoint();
      const relic = this.add.sprite(pos.x, pos.y, "relic").setDepth(7);
      this.relics.push(relic);
    }
  }

  private trySpawnEnemyWave() {
    if (this.enemyWaveMs > 0) return;

    const extra = this.remainingMs < 45000 ? 2 : 1;
    const wave = Phaser.Math.Clamp(1 + Math.floor(this.currentEnemySpeed) + extra, 1, 4);
    this.spawnEnemies(wave);
    this.enemyWaveMs = Phaser.Math.Clamp(11000 - this.currentHazardRate * 30, 5000, 11000);
    this.infoText?.setText(`Dungeon pulse: ${wave} new hunters emerged.`);
  }

  private trySpawnHazards() {
    const target = Phaser.Math.Clamp(Math.round(this.currentHazardRate / 12), 2, 12);
    if (this.hazards.length > target) {
      while (this.hazards.length > target) {
        this.hazards.shift()?.destroy();
      }
    }

    if (this.hazardSpawnMs > 0 || this.hazards.length >= target) return;

    this.hazardSpawnMs = Phaser.Math.Clamp(2400 - this.currentHazardRate * 15, 500, 2400);
    const pos = this.randomOpenPoint();
    const hazard = this.add.sprite(pos.x, pos.y, "hazard").setDepth(6);
    this.hazards.push(hazard);
  }

  private movePlayer(delta: number) {
    if (!this.player || !this.cursors || !this.wasd) return;

    const input = new Phaser.Math.Vector2(0, 0);
    if (this.cursors.left.isDown || this.wasd.a.isDown) input.x -= 1;
    if (this.cursors.right.isDown || this.wasd.d.isDown) input.x += 1;
    if (this.cursors.up.isDown || this.wasd.w.isDown) input.y -= 1;
    if (this.cursors.down.isDown || this.wasd.s.isDown) input.y += 1;
    if (input.lengthSq() > 0) {
      input.normalize();
      this.moveDir.copy(input);
    }

    if (this.shiftKey && Phaser.Input.Keyboard.JustDown(this.shiftKey) && this.dashCooldownMs <= 0) {
      this.dashDir.copy(this.moveDir);
      this.dashBoostMs = 150;
      this.dashCooldownMs = 1300;
      this.infoText?.setText("Blink dash triggered.");
    }

    const sec = delta / 1000;
    const moveSpeed = 170;
    let dx = this.moveDir.x * moveSpeed * sec * (input.lengthSq() > 0 ? 1 : 0);
    let dy = this.moveDir.y * moveSpeed * sec * (input.lengthSq() > 0 ? 1 : 0);

    if (this.dashBoostMs > 0) {
      dx += this.dashDir.x * 390 * sec;
      dy += this.dashDir.y * 390 * sec;
    }

    const nx = Phaser.Math.Clamp(this.player.x + dx, FIELD.left + 8, FIELD.left + FIELD.width - 8);
    const ny = Phaser.Math.Clamp(this.player.y + dy, FIELD.top + 8, FIELD.top + FIELD.height - 8);

    if (!this.isBlocked(nx, this.player.y)) this.player.x = nx;
    if (!this.isBlocked(this.player.x, ny)) this.player.y = ny;
  }

  private tryCastBolt() {
    if (!this.spaceKey || !this.player) return;
    if (!Phaser.Input.Keyboard.JustDown(this.spaceKey) || this.attackCooldownMs > 0) return;

    this.attackCooldownMs = 240;
    const dir = this.moveDir.clone().normalize();
    if (dir.lengthSq() === 0) dir.set(1, 0);

    const bolt = this.add.sprite(this.player.x + dir.x * 10, this.player.y + dir.y * 10, "bolt").setDepth(9);
    bolt.rotation = dir.angle();
    this.projectiles.push({ sprite: bolt, dir, speed: 380, lifeMs: 700 });
  }

  private updateProjectiles(delta: number) {
    const sec = delta / 1000;

    this.projectiles = this.projectiles.filter((p) => {
      p.lifeMs -= delta;
      p.sprite.x += p.dir.x * p.speed * sec;
      p.sprite.y += p.dir.y * p.speed * sec;

      if (p.lifeMs <= 0 || this.isBlocked(p.sprite.x, p.sprite.y)) {
        p.sprite.destroy();
        return false;
      }

      for (const enemy of this.enemies) {
        if (Phaser.Math.Distance.Between(p.sprite.x, p.sprite.y, enemy.sprite.x, enemy.sprite.y) < 12) {
          enemy.hp -= 1;
          p.sprite.destroy();
          if (enemy.hp <= 0) {
            this.killEnemy(enemy);
          }
          return false;
        }
      }

      return true;
    });
  }

  private updateEnemies(delta: number) {
    if (!this.player) return;

    const sec = delta / 1000;
    const speed = 58 + this.currentEnemySpeed * 48;

    for (const enemy of this.enemies) {
      let target = enemy.patrol;
      const distToPlayer = Phaser.Math.Distance.Between(enemy.sprite.x, enemy.sprite.y, this.player.x, this.player.y);
      if (distToPlayer < 180) {
        target = new Phaser.Math.Vector2(this.player.x, this.player.y);
      } else if (Phaser.Math.Distance.Between(enemy.sprite.x, enemy.sprite.y, target.x, target.y) < 12) {
        enemy.patrol = this.randomOpenPoint();
        target = enemy.patrol;
      }

      const dx = target.x - enemy.sprite.x;
      const dy = target.y - enemy.sprite.y;
      const d = Math.max(1, Math.hypot(dx, dy));
      const nx = enemy.sprite.x + (dx / d) * speed * sec;
      const ny = enemy.sprite.y + (dy / d) * speed * sec;
      if (!this.isBlocked(nx, enemy.sprite.y)) enemy.sprite.x = nx;
      if (!this.isBlocked(enemy.sprite.x, ny)) enemy.sprite.y = ny;
    }
  }

  private checkPickups() {
    if (!this.player) return;

    this.relics = this.relics.filter((relic) => {
      if (Phaser.Math.Distance.Between(this.player!.x, this.player!.y, relic.x, relic.y) < 15) {
        this.shards += 1;
        this.score += 30 * this.currentLootMultiplier;
        relic.destroy();
        return false;
      }
      return true;
    });

    this.potions = this.potions.filter((potion) => {
      if (Phaser.Math.Distance.Between(this.player!.x, this.player!.y, potion.x, potion.y) < 14) {
        this.hp = Math.min(100, this.hp + 22);
        this.infoText?.setText("Potion consumed: +22 HP.");
        potion.destroy();
        return false;
      }
      return true;
    });

    if (this.isGateOpen() && this.gate && Phaser.Math.Distance.Between(this.player.x, this.player.y, this.gate.x, this.gate.y) < 16) {
      this.score += (this.remainingMs / 1000) * 4;
      this.endRun("Extracted with relic cache");
    }
  }

  private checkDamage(delta: number) {
    if (!this.player || this.invulnMs > 0) return;
    const sec = delta / 1000;

    for (const enemy of this.enemies) {
      if (Phaser.Math.Distance.Between(this.player.x, this.player.y, enemy.sprite.x, enemy.sprite.y) < 13) {
        this.applyDamage(18 * sec, "hunters");
      }
    }

    for (const hazard of this.hazards) {
      if (Phaser.Math.Distance.Between(this.player.x, this.player.y, hazard.x, hazard.y) < 12) {
        this.applyDamage((12 + this.currentHazardRate * 0.18) * sec, "spike traps");
      }
    }

    for (const tile of this.tileHazards) {
      if (this.pointInRect(this.player.x, this.player.y, tile)) {
        this.applyDamage((17 + this.currentHazardRate * 0.2) * sec, "mutated hazard tile");
      }
    }
  }

  private applyDamage(amount: number, cause: string) {
    this.hp -= amount;
    this.deathCause = cause;
    this.invulnMs = 100;
    this.player?.setTintFill(0xffffff);
    this.time.delayedCall(80, () => this.player?.clearTint());
  }

  private killEnemy(enemy: EnemyUnit) {
    enemy.sprite.destroy();
    this.enemies = this.enemies.filter((e) => e !== enemy);
    this.killCount += 1;
    this.score += 14;

    if (Math.random() < 0.2) {
      const potion = this.add.sprite(enemy.sprite.x, enemy.sprite.y, "potion").setDepth(7);
      this.potions.push(potion);
    }
  }

  private updateGateState() {
    const open = this.isGateOpen();
    this.gate?.setTexture(open ? "gate_open" : "gate_locked");
    this.gateText?.setText(open ? "EXTRACT" : "LOCKED").setColor(open ? "#86efac" : "#94a3b8");
  }

  private isGateOpen() {
    return this.shards >= 4 || this.remainingMs <= 25000;
  }

  private clearDynamicObjects() {
    for (const enemy of this.enemies) enemy.sprite.destroy();
    for (const relic of this.relics) relic.destroy();
    for (const hazard of this.hazards) hazard.destroy();
    for (const potion of this.potions) potion.destroy();
    for (const p of this.projectiles) p.sprite.destroy();

    this.enemies = [];
    this.relics = [];
    this.hazards = [];
    this.potions = [];
    this.projectiles = [];
  }

  private applyPatchedTiles(tiles: [string, string][]) {
    this.tileHazards = [];

    const patchBlocked: TileRect[] = [];
    for (const [key, value] of tiles) {
      const [xRaw, yRaw] = key.split(":");
      const gx = Number(xRaw);
      const gy = Number(yRaw);
      if (!Number.isFinite(gx) || !Number.isFinite(gy)) continue;
      if (gx < 0 || gy < 0 || gx >= FIELD.cols || gy >= FIELD.rows) continue;

      const state = (value as TileState) || "OPEN";
      const rect = this.rectFromGrid(gx, gy);
      if (state === "BLOCKED") patchBlocked.push(rect);
      if (state === "HAZARD") this.tileHazards.push(rect);
    }

    this.blockedTiles = [...this.baseDungeonBlocked, ...patchBlocked];
    this.redrawPatchLayer();
  }

  private redrawPatchLayer() {
    this.patchLayer?.removeAll(true);

    for (const rect of this.blockedTiles) {
      this.patchLayer?.add(this.add.image(rect.x + rect.w / 2, rect.y + rect.h / 2, "wall").setAlpha(0.88));
    }

    for (const rect of this.tileHazards) {
      const spike = this.add.image(rect.x + rect.w / 2, rect.y + rect.h / 2, "hazard").setScale(1.3).setAlpha(0.85);
      this.patchLayer?.add(spike);
    }
  }

  private rectFromGrid(gx: number, gy: number): TileRect {
    return {
      x: FIELD.left + gx * CELL_W,
      y: FIELD.top + gy * CELL_H,
      w: CELL_W,
      h: CELL_H
    };
  }

  private randomOpenPoint() {
    for (let i = 0; i < 100; i += 1) {
      const x = FIELD.left + Phaser.Math.Between(1, FIELD.cols - 2) * CELL_W + CELL_W / 2;
      const y = FIELD.top + Phaser.Math.Between(1, FIELD.rows - 2) * CELL_H + CELL_H / 2;
      if (!this.isBlocked(x, y)) {
        return new Phaser.Math.Vector2(x, y);
      }
    }

    return new Phaser.Math.Vector2(FIELD.left + CELL_W * 3, FIELD.top + CELL_H * 3);
  }

  private isBlocked(x: number, y: number) {
    return this.blockedTiles.some((rect) => this.pointInRect(x, y, rect));
  }

  private pointInRect(x: number, y: number, rect: TileRect) {
    return x >= rect.x && x <= rect.x + rect.w && y >= rect.y && y <= rect.y + rect.h;
  }

  private endRun(reason: string) {
    this.running = false;
    const finalScore = Math.round(this.score + this.hp * 0.5 + this.killCount * 6);
    this.infoText?.setText(`Run ended: ${reason}. Final score ${finalScore}.`);
    this.metaText?.setText(`On-chain v${this.versionId} influenced hazards, speed, loot, and patched tiles.`);
    this.syncHud();
  }

  private syncHud() {
    const phase = this.remainingMs > 60000 ? "Scout" : this.remainingMs > 30000 ? "Pressure" : "Collapse";
    this.statsText?.setText(
      `v${this.versionId} | hazard ${this.currentHazardRate}% | enemy ${this.currentEnemySpeed.toFixed(2)}x | loot ${this.currentLootMultiplier.toFixed(2)}x`
    );
    this.phaseText?.setText(`Phase ${phase} | shards ${this.shards}/4 | kills ${this.killCount}`);
    this.timerText?.setText(`time ${(this.remainingMs / 1000).toFixed(1)}s | HP ${Math.max(0, Math.round(this.hp))}`);
    this.scoreText?.setText(`score ${Math.round(this.score)} | hazards ${this.hazards.length} | enemies ${this.enemies.length}`);
  }
}
