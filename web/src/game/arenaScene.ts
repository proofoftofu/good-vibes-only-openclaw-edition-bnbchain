import Phaser from "phaser";

export interface SceneInput {
  hazardRate: number;
  enemySpeed: number;
}

export class ArenaScene extends Phaser.Scene {
  private dangerText?: Phaser.GameObjects.Text;
  private speedText?: Phaser.GameObjects.Text;
  private scoreText?: Phaser.GameObjects.Text;
  private timerText?: Phaser.GameObjects.Text;
  private infoText?: Phaser.GameObjects.Text;
  private player?: Phaser.GameObjects.Rectangle;
  private shard?: Phaser.GameObjects.Arc;
  private cursors?: Phaser.Types.Input.Keyboard.CursorKeys;
  private running = false;
  private remainingMs = 0;
  private score = 0;
  private currentEnemySpeed = 1;

  constructor() {
    super("ArenaScene");
  }

  create() {
    this.add.rectangle(320, 240, 640, 480, 0x101820);
    this.add.rectangle(320, 240, 560, 400, 0x1f2a36).setStrokeStyle(2, 0xa9d6e5);
    this.add.text(20, 20, "Relic Run Arena", { color: "#f4f1de", fontSize: "20px" });

    this.dangerText = this.add.text(20, 60, "Hazard Rate: -", { color: "#ffd166", fontSize: "16px" });
    this.speedText = this.add.text(20, 84, "Enemy Speed: -", { color: "#90e0ef", fontSize: "16px" });
    this.timerText = this.add.text(20, 108, "Time: 0", { color: "#f1faee", fontSize: "16px" });
    this.scoreText = this.add.text(20, 132, "Score: 0", { color: "#caffbf", fontSize: "16px" });
    this.infoText = this.add.text(20, 156, "Click Start Run, then move with arrow keys", {
      color: "#f8f9fa",
      fontSize: "14px"
    });

    this.player = this.add.rectangle(320, 240, 16, 16, 0x00d9ff);
    this.shard = this.add.circle(460, 300, 8, 0xffd166);
    this.cursors = this.input.keyboard?.createCursorKeys();

    this.add.text(20, 430, "Watch mutations apply after onchain commits", {
      color: "#f8f9fa",
      fontSize: "14px"
    });
  }

  update(_time: number, delta: number) {
    if (!this.running || !this.player || !this.cursors) {
      return;
    }

    const baseSpeed = 0.18 * this.currentEnemySpeed;
    let dx = 0;
    let dy = 0;
    if (this.cursors.left.isDown) dx -= baseSpeed * delta;
    if (this.cursors.right.isDown) dx += baseSpeed * delta;
    if (this.cursors.up.isDown) dy -= baseSpeed * delta;
    if (this.cursors.down.isDown) dy += baseSpeed * delta;

    this.player.x = Phaser.Math.Clamp(this.player.x + dx, 40, 600);
    this.player.y = Phaser.Math.Clamp(this.player.y + dy, 40, 400);

    this.remainingMs = Math.max(0, this.remainingMs - delta);
    this.timerText?.setText(`Time: ${(this.remainingMs / 1000).toFixed(1)}s`);

    if (this.shard && Phaser.Math.Distance.Between(this.player.x, this.player.y, this.shard.x, this.shard.y) < 20) {
      this.score += 10;
      this.scoreText?.setText(`Score: ${this.score}`);
      this.shard.setPosition(Phaser.Math.Between(60, 580), Phaser.Math.Between(80, 380));
    }

    if (this.remainingMs <= 0) {
      this.running = false;
      this.infoText?.setText(`Run finished. Final score: ${this.score}`);
    }
  }

  startRun() {
    this.running = true;
    this.remainingMs = 60000;
    this.score = 0;
    this.scoreText?.setText("Score: 0");
    this.timerText?.setText("Time: 60.0s");
    this.player?.setPosition(320, 240);
    this.shard?.setPosition(460, 300);
    this.infoText?.setText("Run live. Collect shards before collapse.");
  }

  applyInput(input: SceneInput) {
    this.currentEnemySpeed = input.enemySpeed;
    this.dangerText?.setText(`Hazard Rate: ${input.hazardRate}%`);
    this.speedText?.setText(`Enemy Speed: ${input.enemySpeed.toFixed(2)}x`);
  }
}
