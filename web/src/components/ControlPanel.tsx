interface Props {
  arenaId: number;
  versionId: number;
  hazardRate: number;
  enemySpeed: number;
  lootMultiplier: number;
  patchTiles: number;
  status: string;
  latestTxHash?: string;
  onCommit: () => Promise<void>;
  agentModeEnabled?: boolean;
  agentRepoUrl: string;
}

export function ControlPanel(props: Props) {
  return (
    <section className="panel">
      <h2>Dungeon Master Control</h2>
      <p className="subtle">Arena #{props.arenaId}</p>
      <ul>
        <li>Version: {props.versionId}</li>
        <li>Hazard Rate: {props.hazardRate}%</li>
        <li>Enemy Speed: {props.enemySpeed.toFixed(2)}x</li>
        <li>Loot Multiplier: {props.lootMultiplier.toFixed(2)}x</li>
        <li>Patched Tiles: {props.patchTiles}</li>
      </ul>
      {props.agentModeEnabled ? (
        <p className="subtle">Agent mode enabled: chaos commits are automated.</p>
      ) : (
        <button onClick={() => void props.onCommit()}>Commit Chaos Update</button>
      )}
      <p className="status">{props.status}</p>
      <p className="subtle">
        Run your own agent:{" "}
        <a href={props.agentRepoUrl} target="_blank" rel="noreferrer">
          see GitHub repo details
        </a>
      </p>
      {props.latestTxHash ? (
        <p className="tx-hash">
          Latest tx: <code>{props.latestTxHash}</code>
        </p>
      ) : null}
    </section>
  );
}
