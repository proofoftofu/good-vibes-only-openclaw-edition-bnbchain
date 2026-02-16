import { WebSocket, WebSocketServer } from "ws";
import type { Server } from "http";

export class WsHub {
  private readonly wss: WebSocketServer;

  constructor(server: Server) {
    this.wss = new WebSocketServer({ server, path: "/ws" });
  }

  broadcast(payload: unknown) {
    const data = JSON.stringify(payload);
    for (const client of this.wss.clients) {
      if (client.readyState === WebSocket.OPEN) {
        client.send(data);
      }
    }
  }
}
