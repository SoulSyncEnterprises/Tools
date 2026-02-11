/**
 * WebSocket Real-Time Server (Standalone)
 *
 * ABOUT:
 *   WebSockets provide a persistent, two-way connection between your server and
 *   clients — unlike normal HTTP where the client has to keep asking "anything new?"
 *   With WebSockets, the server can instantly push updates the moment something
 *   happens. This tool creates a broadcast server that sends real-time events to
 *   all connected clients (great for live dashboards, notifications, status updates).
 *   It also includes a multi-path router for running different WebSocket services
 *   on the same server (e.g., one path for dashboard updates, another for audio streams).
 *
 * USE CASES:
 *   - Push live updates to a dashboard (call status, new uploads, metrics)
 *   - Real-time notifications without polling
 *   - Stream audio or data between server and client
 *   - Build collaborative or live-updating features
 *   - Handle multiple WebSocket endpoints on one server
 *
 * DEPENDENCIES:
 *   npm install ws
 *   npm install -D @types/ws
 *
 * NO ENVIRONMENT VARIABLES REQUIRED
 */

import { WebSocketServer, WebSocket } from 'ws';
import type { Server as HttpServer, IncomingMessage } from 'http';
import type { Duplex } from 'stream';

// ─── Types ───────────────────────────────────────────────────────────────────

export interface BroadcastMessage {
  type: string;
  data: any;
}

export type ConnectionHandler = (ws: WebSocket, request: IncomingMessage) => void;

// ─── Core: Simple Broadcast Server ──────────────────────────────────────────

/**
 * Create a WebSocket broadcast server
 * All connected clients receive broadcast messages
 */
export function createBroadcastServer(httpServer: HttpServer, path: string = '/ws') {
  const wss = new WebSocketServer({ noServer: true });
  const clients = new Set<WebSocket>();

  wss.on('connection', (ws) => {
    clients.add(ws);

    ws.on('close', () => {
      clients.delete(ws);
    });

    ws.on('error', (error) => {
      console.error('WebSocket error:', error.message);
      clients.delete(ws);
    });
  });

  // Handle HTTP upgrade requests for this path
  httpServer.on('upgrade', (request: IncomingMessage, socket: Duplex, head: Buffer) => {
    if (request.url === path) {
      wss.handleUpgrade(request, socket, head, (ws) => {
        wss.emit('connection', ws, request);
      });
    }
    // Don't destroy socket for other paths - they may be handled elsewhere
  });

  return {
    /** Broadcast a message to all connected clients */
    broadcast(message: BroadcastMessage) {
      const data = JSON.stringify(message);
      clients.forEach(client => {
        if (client.readyState === WebSocket.OPEN) {
          client.send(data);
        }
      });
    },

    /** Send a message to a specific client */
    send(client: WebSocket, message: BroadcastMessage) {
      if (client.readyState === WebSocket.OPEN) {
        client.send(JSON.stringify(message));
      }
    },

    /** Number of connected clients */
    get clientCount() {
      return clients.size;
    },

    /** Access the underlying WebSocketServer */
    wss,

    /** Access the set of connected clients */
    clients,

    /** Register a handler for new connections */
    onConnection(handler: (ws: WebSocket) => void) {
      wss.on('connection', handler);
    },
  };
}

// ─── Advanced: Multi-Path WebSocket Router ───────────────────────────────────

/**
 * Create a WebSocket router that handles multiple paths on the same HTTP server
 * Useful when you need different WebSocket endpoints (e.g., dashboard + media streams)
 */
export function createWebSocketRouter(httpServer: HttpServer) {
  const routes = new Map<string, { wss: WebSocketServer; handler: ConnectionHandler }>();

  httpServer.on('upgrade', (request: IncomingMessage, socket: Duplex, head: Buffer) => {
    const url = request.url || '/';
    const route = routes.get(url);

    if (route) {
      socket.on('error', (error) => {
        console.error('Socket error during upgrade:', error.message);
      });

      route.wss.handleUpgrade(request, socket, head, (ws) => {
        route.wss.emit('connection', ws, request);
      });
    } else {
      socket.destroy();
    }
  });

  return {
    /**
     * Register a WebSocket endpoint at a specific path
     */
    route(path: string, handler: ConnectionHandler) {
      const wss = new WebSocketServer({ noServer: true });

      wss.on('connection', (ws, request) => {
        handler(ws, request);
      });

      routes.set(path, { wss, handler });

      return wss;
    },

    /** Remove a route */
    removeRoute(path: string) {
      const route = routes.get(path);
      if (route) {
        route.wss.close();
        routes.delete(path);
      }
    },

    /** Get all registered paths */
    get paths() {
      return Array.from(routes.keys());
    },
  };
}

// ─── Usage Example ───────────────────────────────────────────────────────────
/*
import { createServer } from 'http';
import express from 'express';

const app = express();
const httpServer = createServer(app);

// --- Option 1: Simple broadcast server ---
const broadcaster = createBroadcastServer(httpServer, '/ws');

// Broadcast events from anywhere in your app
broadcaster.broadcast({ type: 'user_joined', data: { name: 'Phoenix' } });
broadcaster.broadcast({ type: 'file_uploaded', data: { fileName: 'song.wav' } });

console.log(`${broadcaster.clientCount} clients connected`);

// --- Option 2: Multi-path router ---
const router = createWebSocketRouter(httpServer);

// Dashboard updates on /ws
router.route('/ws', (ws) => {
  console.log('Dashboard client connected');
  ws.send(JSON.stringify({ type: 'welcome', data: {} }));

  ws.on('message', (msg) => {
    console.log('Received:', msg.toString());
  });
});

// Media stream on /media-stream
router.route('/media-stream', (ws, request) => {
  console.log('Media stream connected');

  ws.on('message', (msg) => {
    const data = JSON.parse(msg.toString());
    // Handle Twilio media stream events
    if (data.event === 'start') {
      console.log('Stream started:', data.start.callSid);
    }
  });
});

httpServer.listen(3000);
*/
