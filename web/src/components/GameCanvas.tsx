import { useEffect, useRef } from "react";
import Phaser from "phaser";
import { ArenaScene } from "../game/arenaScene";

interface Props {
  versionId: number;
  hazardRate: number;
  enemySpeed: number;
  lootMultiplier: number;
  tiles: [string, string][];
  runNonce: number;
}

export function GameCanvas({ versionId, hazardRate, enemySpeed, lootMultiplier, tiles, runNonce }: Props) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const sceneRef = useRef<ArenaScene | null>(null);

  useEffect(() => {
    if (!hostRef.current) {
      return;
    }

    const scene = new ArenaScene();
    sceneRef.current = scene;

    const game = new Phaser.Game({
      type: Phaser.AUTO,
      parent: hostRef.current,
      width: 640,
      height: 480,
      backgroundColor: "#0f1720",
      scene: [scene]
    });

    return () => {
      game.destroy(true);
      sceneRef.current = null;
    };
  }, []);

  useEffect(() => {
    sceneRef.current?.applyInput({ versionId, hazardRate, enemySpeed, lootMultiplier, tiles });
  }, [versionId, hazardRate, enemySpeed, lootMultiplier, tiles]);

  useEffect(() => {
    if (runNonce > 0) {
      sceneRef.current?.startRun();
    }
  }, [runNonce]);

  return <div className="game-canvas" ref={hostRef} />;
}
