import { Server as HttpServer } from 'http';
import { Server as SocketServer, Socket } from 'socket.io';
import jwt from 'jsonwebtoken';
import { config } from './index';
import { logger } from '../utils/logger';
import { JwtPayload } from '../models/types';

//Singleton 

let io: SocketServer;

export function initSocketServer(httpServer: HttpServer): SocketServer {
  io = new SocketServer(httpServer, {
    cors: {
      origin:  config.isDev ? '*' : (process.env.ALLOWED_ORIGINS?.split(',') ?? []),
      methods: ['GET', 'POST'],
    },
    transports: ['websocket', 'polling'],
    pingTimeout:  120_000,
    pingInterval:  25_000,
  });

  //JWT auth on every connection 
  io.use((socket: Socket, next) => {
    const token =
      socket.handshake.auth?.token ??
      socket.handshake.headers?.authorization?.split(' ')[1];

    if (!token) {
      logger.warn({ socketId: socket.id }, 'WS rejected — no token');
      return next(new Error('UNAUTHORIZED'));
    }

    try {
      const payload        = jwt.verify(token, config.jwt.secret) as JwtPayload;
      (socket as AuthSocket).user = payload;
      next();
    } catch {
      logger.warn({ socketId: socket.id }, 'WS rejected — invalid token');
      next(new Error('INVALID_TOKEN'));
    }
  });

  // Connection handler 
  io.on('connection', (socket: Socket) => {
    const user = (socket as AuthSocket).user;
    logger.info({ socketId: socket.id, userId: user.userId }, 'WS client connected');

    // Client subscribes to a file's progress room
    socket.on('subscribe:file', async ({ fileId }: { fileId: string }) => {
      if (!fileId || typeof fileId !== 'string') return;
      const room = buildRoom(user.userId, fileId);
      await socket.join(room);
      socket.emit('subscribed', { fileId, room });
      logger.debug({ socketId: socket.id, room }, 'Client subscribed');
    });

    socket.on('unsubscribe:file', async ({ fileId }: { fileId: string }) => {
      await socket.leave(buildRoom(user.userId, fileId));
    });

    socket.on('disconnect', (reason) => {
      logger.debug({ socketId: socket.id, reason }, 'WS disconnected');
    });

    socket.on('error', (err) => {
      logger.warn({ socketId: socket.id, err }, 'WS socket error');
    });
  });

  logger.info('Socket.IO server initialised');
  return io;
}

export function getIO(): SocketServer {
  if (!io) throw new Error('Socket.IO not initialised — call initSocketServer first');
  return io;
}

// Room helpers 

export function buildRoom(userId: string, fileId: string): string {
  return `file:${userId}:${fileId}`;
}

// Types 

export interface AuthSocket extends Socket {
  user: JwtPayload;
}

export interface ProgressEvent {
  fileId:   string;
  stage:    UploadStage;
  percent:  number;
  message:  string;
  status?:  string;
  error?:   string;
}

export type UploadStage =
  | 'queued'
  | 'scanning'
  | 'thumbnail'
  | 'finalising'
  | 'complete'
  | 'failed';