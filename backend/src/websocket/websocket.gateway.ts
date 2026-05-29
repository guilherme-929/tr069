import {
  WebSocketGateway as WSGateway,
  WebSocketServer,
  OnGatewayConnection,
  OnGatewayDisconnect,
} from '@nestjs/websockets';
import { Server, WebSocket } from 'ws';

@WSGateway({
  namespace: '/ws',
  transports: ['websocket'],
})
export class WebsocketGateway
  implements OnGatewayConnection, OnGatewayDisconnect
{
  @WebSocketServer()
  server: Server;

  private clients: Map<string, WebSocket> = new Map();

  handleConnection(client: WebSocket, req: any) {
    const id = `${req.socket.remoteAddress}:${Date.now()}`;
    this.clients.set(id, client);

    client.send(
      JSON.stringify({
        type: 'connection',
        message: 'Connected to TR-069 ACS',
        clientId: id,
      }),
    );

    client.on('close', () => {
      this.clients.delete(id);
    });
  }

  handleDisconnect(client: WebSocket) {
    for (const [id, ws] of this.clients) {
      if (ws === client) {
        this.clients.delete(id);
        break;
      }
    }
  }

  broadcast(event: string, data: any) {
    const message = JSON.stringify({ event, data, timestamp: new Date() });
    for (const [, client] of this.clients) {
      if (client.readyState === WebSocket.OPEN) {
        client.send(message);
      }
    }
  }

  sendTo(clientId: string, event: string, data: any) {
    const client = this.clients.get(clientId);
    if (client && client.readyState === WebSocket.OPEN) {
      client.send(JSON.stringify({ event, data }));
    }
  }
}
