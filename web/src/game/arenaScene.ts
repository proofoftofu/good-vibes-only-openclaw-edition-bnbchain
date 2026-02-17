import Phaser from "phaser";

const FIELD = {
  left: 40,
  right: 600,
  top: 40,
  bottom: 400,
  width: 560,
  height: 360,
  cols: 20,
  rows: 20
};

const CELL = {
  width: FIELD.width / FIELD.cols,
  height: FIELD.height / FIELD.rows
};

type TileState = "OPEN" | "BLOCKED" | "HAZARD";

export interface SceneInput {
  versionId: number;
  hazardRate: number;
  enemySpeed: number;
  lootMultiplier: number;
  tiles: [string, string][];
}

interface TileRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export class ArenaScene extends Phaser.Scene {
  private titleText?: Phaser.GameObjects.Text;
  private statsText?: Phaser.GameObjects.Text;
  private scoreText?: Phaser.GameObjects.Text;
  private timerText?: Phaser.GameObjects.Text;
  private phaseText?: Phaser.GameObjects.Text;
  private infoText?: Phaser.GameObjects.Text;
  private metaText?: Phaser.GameObjects.Text;

  private player?: Phaser.GameObjects.Rectangle;
  private gate?: Phaser.GameObjects.Rectangle;
  private gateText?: Phaser.GameObjects.Text;

  private cursors?: Phaser.Types.Input.Keyboard.CursorKeys;
  private shiftKey?: Phaser.Input.Keyboard.Key;

  private enemies: Phaser.GameObjects.Arc[] = [];
  private hazards: Phaser.GameObjects.Arc[] = [];
  private relics: Phaser.GameObjects.Arc[] = [];

  private tileLayer?: Phaser.GameObjects.Container;
  private blockedTiles: TileRect[] = [];
  private tileHazards: TileRect[] = [];

  private running = false;
  private remainingMs = 0;
  private hp = 100;
  private score = 0;
  private shards = 0;
  private deathCause = "";

  private versionId = 0;
  private currentHazardRate = 30;
  private currentEnemySpeed = 1;
  private currentLootMultiplier = 1;

  private dashCooldownMs = 0;
  private dashBoostMs = 0;
  private dashDir = new Phaser.Math.Vector2(0, 0);
  private invulnMs = 0;
  private hazardSpawnMs = 0;

  constructor() {
    super("ArenaScene");
  }

  create() {
    this.add.rectangle(320, 240, 640, 480, 0x0b1320);
    this.add.rectangle(320, 240, 600, 440, 0x111b2e).setStrokeStyle(2, 0x2dd4bf);
    this.add.rectangle(320, 220, 560, 360, 0x172137).setStrokeStyle(1, 0x3a4f6d);

    this.tileLayer = this.add.container(0, 0);

    this.titleText = this.add.text(20, 10, "Relic Run: Dungeon Sprint", {
      color: "#fef3c7",
      fontSize: "18px"
    });
    this.statsText = this.add.text(20, 32, "", { color: "#bae6fd", fontSize: "14px" });
    this.phaseText = this.add.text(20, 52, "", { color: "#d8b4fe", fontSize: "14px" });
    this.timerText = this.add.text(20, 72, "", { color: "#e2e8f0", fontSize: "14px" });
    this.scoreText = this.add.text(20, 92, "", { color: "#bbf7d0", fontSize: "14px" });
    this.infoText = this.add.text(20, 418, "Start run. Move: arrows. Dash: shift.", {
      color: "#e2e8f0",
      fontSize: "13px"
    });
    this.metaText = this.add.text(20, 438, "On-chain dungeon state will mutate this run.", {
      color: "#94a3b8",
      fontSize: "12px"
    });

    this.player = this.add.rectangle(120, 120, 16, 16, 0x22d3ee);
    this.gate = this.add.rectangle(560, 360, 24, 24, 0x334155).setStrokeStyle(1, 0x94a3b8);
    this.gateText = this.add.text(530, 376, "LOCKED", { color: "#94a3b8", fontSize: "11px" });

    this.cursors = this.input.keyboard?.createCursorKeys();
    this.shiftKey = this.input.keyboard?.addKey(Phaser.Input.Keyboard.KeyCodes.SHIFT);

    this.syncHud();
  }

  update(_time: number, delta: number) {
    if (!this.running || !this.player || !this.cursors) {
      return;
    }

    this.remainingMs = Math.max(0, this.remainingMs - delta);
    this.dashCooldownMs = Math.max(0, this.dashCooldownMs - delta);
    this.dashBoostMs = Math.max(0, this.dashBoostMs - delta);
    this.invulnMs = Math.max(0, this.invulnMs - delta);
    this.hazardSpawnMs = Math.max(0, this.hazardSpawnMs - delta);

    this.updateGateState();
    this.trySpawnHazards();
    this.movePlayer(delta);
    this.updateEnemies(delta);
    this.checkPickups();
    this.checkDamage(delta);

    if (this.hp <= 0) {
      this.endRun(`Downed by ${this.deathCause || "dungeon pressure"}`);
      return;
    }

    if (this.remainingMs <= 0) {
      this.endRun("Collapse timer reached zero");
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
    this.deathCause = "";
    this.dashCooldownMs = 0;
    this.dashBoostMs = 0;
    this.invulnMs = 0;
    this.hazardSpawnMs = 1000;

    this.player.setPosition(100, 100).setFillStyle(0x22d3ee);

    this.clearObjects();
    this.spawnEnemies();
    this.spawnRelics(4);

    this.infoText?.setText("Run live: collect shards and extract before collapse.");
    this.syncHud();
  }

  applyInput(input: SceneInput) {
    this.versionId = input.versionId;
    this.currentHazardRate = input.hazardRate;
    this.currentEnemySpeed = input.enemySpeed;
    this.currentLootMultiplier = input.lootMultiplier;
    this.applyTiles(input.tiles);
    this.syncHud();
  }

  private syncHud() {
    const phase = this.remainingMs > 60000 ? "Scout" : this.remainingMs > 30000 ? "Pressure" : "Collapse";
    this.statsText?.setText(
      `v${this.versionId} | Hazard ${this.currentHazardRate}% | Enemy ${this.currentEnemySpeed.toFixed(2)}x | Loot ${this.currentLootMultiplier.toFixed(2)}x`
    );
    this.phaseText?.setText(`Phase: ${phase}`);
    this.timerText?.setText(`Time ${(this.remainingMs / 1000).toFixed(1)}s | HP ${Math.max(0, Math.round(this.hp))}`);
    this.scoreText?.setText(`Score ${Math.round(this.score)} | Shards ${this.shards}`);
  }

  private movePlayer(delta: number) {
    if (!this.player || !this.cursors) return;

    const input = new Phaser.Math.Vector2(0, 0);
    if (this.cursors.left.isDown) input.x -= 1;
    if (this.cursors.right.isDown) input.x += 1;
    if (this.cursors.up.isDown) input.y -= 1;
    if (this.cursors.down.isDown) input.y += 1;

    if (input.lengthSq() > 0) input.normalize();

    if (this.shiftKey && Phaser.Input.Keyboard.JustDown(this.shiftKey) && this.dashCooldownMs <= 0 && input.lengthSq() > 0) {
      this.dashDir = input.clone();
      this.dashBoostMs = 160;
      this.dashCooldownMs = 1500;
      this.infoText?.setText("Dash used. Cooldown started.");
    }

    const speed = 0.18 * delta;
    let dx = input.x * speed;
    let dy = input.y * speed;

    if (this.dashBoostMs > 0) {
      dx += this.dashDir.x * 0.35 * delta;
      dy += this.dashDir.y * 0.35 * delta;
    }

    const nextX = Phaser.Math.Clamp(this.player.x + dx, FIELD.left, FIELD.right);
    const nextY = Phaser.Math.Clamp(this.player.y + dy, FIELD.top, FIELD.bottom);

    if (!this.isBlocked(nextX, this.player.y)) {
      this.player.x = nextX;
    }
    if (!this.isBlocked(this.player.x, nextY)) {
      this.player.y = nextY;
    }
  }

  private spawnEnemies() {
    const target = Phaser.Math.Clamp(Math.round(2 + this.currentEnemySpeed), 2, 5);
    for (let i = 0; i < target; i += 1) {
      const enemy = this.add.circle(Phaser.Math.Between(240, 580), Phaser.Math.Between(80, 380), 9, 0xfb7185);
      this.enemies.push(enemy);
    }
  }

  private updateEnemies(delta: number) {
    if (!this.player) return;

    const step = (0.035 + this.currentEnemySpeed * 0.03) * delta;
    for (const enemy of this.enemies) {
      const dx = this.player.x - enemy.x;
      const dy = this.player.y - enemy.y;
      const dist = Math.max(1, Math.hypot(dx, dy));
      const nx = enemy.x + (dx / dist) * step;
      const ny = enemy.y + (dy / dist) * step;
      enemy.x = Phaser.Math.Clamp(nx, FIELD.left, FIELD.right);
      enemy.y = Phaser.Math.Clamp(ny, FIELD.top, FIELD.bottom);
    }
  }

  private spawnRelics(count: number) {
    for (let i = 0; i < count; i += 1) {
      const relic = this.add.circle(Phaser.Math.Between(80, 560), Phaser.Math.Between(80, 360), 7, 0xfacc15);
      this.relics.push(relic);
    }
  }

  private checkPickups() {
    if (!this.player) return;

    const gateOpen = this.isGateOpen();
    for (const relic of this.relics) {
      if (Phaser.Math.Distance.Between(this.player.x, this.player.y, relic.x, relic.y) < 18) {
        this.shards += 1;
        this.score += 25 * this.currentLootMultiplier;
        relic.setPosition(Phaser.Math.Between(80, 560), Phaser.Math.Between(80, 360));
      }
    }

    if (gateOpen && this.gate && Phaser.Math.Distance.Between(this.player.x, this.player.y, this.gate.x, this.gate.y) < 20) {
      this.score += Math.max(0, (this.remainingMs / 1000) * 3);
      this.endRun("Extraction successful");
    }
  }

  private checkDamage(delta: number) {
    if (!this.player || this.invulnMs > 0) return;

    for (const enemy of this.enemies) {
      if (Phaser.Math.Distance.Between(this.player.x, this.player.y, enemy.x, enemy.y) < 16) {
        this.applyDamage((16 * delta) / 1000, "hunters");
      }
    }

    for (const hazard of this.hazards) {
      if (Phaser.Math.Distance.Between(this.player.x, this.player.y, hazard.x, hazard.y) < 14) {
        this.applyDamage((20 * delta) / 1000, "hazards");
      }
    }

    for (const tile of this.tileHazards) {
      if (this.pointInRect(this.player.x, this.player.y, tile)) {
        this.applyDamage((24 * delta) / 1000, "mutated tile hazards");
      }
    }
  }

  private applyDamage(amount: number, cause: string) {
    this.hp -= amount;
    this.deathCause = cause;
    this.invulnMs = 120;
    this.player?.setFillStyle(0x60a5fa);
    this.time.delayedCall(120, () => this.player?.setFillStyle(0x22d3ee));
  }

  private trySpawnHazards() {
    const target = Phaser.Math.Clamp(Math.round(this.currentHazardRate / 15), 1, 9);
    if (this.hazards.length > target) {
      const removeCount = this.hazards.length - target;
      for (let i = 0; i < removeCount; i += 1) {
        this.hazards.shift()?.destroy();
      }
    }

    if (this.hazardSpawnMs > 0 || this.hazards.length >= target) {
      return;
    }

    const spawnEvery = Phaser.Math.Clamp(2600 - this.currentHazardRate * 18, 600, 2600);
    this.hazardSpawnMs = spawnEvery;
    const hazard = this.add.circle(Phaser.Math.Between(70, 570), Phaser.Math.Between(70, 370), 8, 0xf97316);
    this.hazards.push(hazard);
  }

  private updateGateState() {
    const open = this.isGateOpen();
    this.gate?.setFillStyle(open ? 0x22c55e : 0x334155);
    this.gateText?.setText(open ? "EXTRACT" : "LOCKED").setColor(open ? "#bbf7d0" : "#94a3b8");
  }

  private isGateOpen() {
    return this.shards >= 4 || this.remainingMs <= 30000;
  }

  private clearObjects() {
    for (const enemy of this.enemies) enemy.destroy();
    for (const hazard of this.hazards) hazard.destroy();
    for (const relic of this.relics) relic.destroy();
    this.enemies = [];
    this.hazards = [];
    this.relics = [];
  }

  private endRun(reason: string) {
    this.running = false;
    const finalScore = Math.round(this.score + this.hp * 0.6);
    this.infoText?.setText(`Run ended: ${reason}. Final score ${finalScore}`);
    this.metaText?.setText(`On-chain version ${this.versionId} influenced this run.`);
    this.syncHud();
  }

  private applyTiles(tiles: [string, string][]) {
    this.tileLayer?.removeAll(true);
    this.blockedTiles = [];
    this.tileHazards = [];

    for (const [key, value] of tiles) {
      const [xRaw, yRaw] = key.split(":");
      const gx = Number(xRaw);
      const gy = Number(yRaw);
      if (!Number.isFinite(gx) || !Number.isFinite(gy)) continue;

      const state = (value as TileState) || "OPEN";
      if (state === "OPEN") continue;

      const rect: TileRect = {
        x: FIELD.left + gx * CELL.width,
        y: FIELD.top + gy * CELL.height,
        w: CELL.width,
        h: CELL.height
      };

      const color = state === "BLOCKED" ? 0x475569 : 0xf97316;
      const alpha = state === "BLOCKED" ? 0.65 : 0.5;
      const patch = this.add.rectangle(rect.x + rect.w / 2, rect.y + rect.h / 2, rect.w - 1, rect.h - 1, color, alpha);
      this.tileLayer?.add(patch);

      if (state === "BLOCKED") {
        this.blockedTiles.push(rect);
      }
      if (state === "HAZARD") {
        this.tileHazards.push(rect);
      }
    }
  }

  private isBlocked(x: number, y: number) {
    return this.blockedTiles.some((rect) => this.pointInRect(x, y, rect));
  }

  private pointInRect(x: number, y: number, rect: TileRect) {
    return x >= rect.x && x <= rect.x + rect.w && y >= rect.y && y <= rect.y + rect.h;
  }
}
