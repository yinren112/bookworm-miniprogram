import fp from 'fastify-plugin';
import * as jwt from 'jsonwebtoken';
import config from '../config';
import prisma from '../db';
import { FastifyRequest, FastifyReply } from 'fastify';

export default fp(async (fastify) => {
  fastify.decorate('authenticate', async (req: FastifyRequest, reply: FastifyReply) => {
    const auth = req.headers.authorization;
    if (!auth?.startsWith('Bearer ')) {
      return reply.code(401).send({ error: 'Unauthorized', errorCode: 'MISSING_TOKEN' });
    }
    const token = auth.slice(7);
    try {
      const payload = jwt.verify(token, config.jwtSecret!) as any;
      req.user = { userId: payload.userId, openid: payload.openid };
    } catch {
      return reply.code(401).send({ error: 'Invalid token', errorCode: 'INVALID_TOKEN' });
    }
  });

  fastify.decorate('requireRole', (role: 'USER' | 'STAFF') => {
    return async (req: FastifyRequest, reply: FastifyReply) => {
      if (!req.user) return reply.code(401).send({ error: 'Unauthorized', errorCode: 'UNAUTHORIZED' });
      const u = await prisma.user.findUnique({
        where: { id: req.user.userId }, select: { role: true }
      });
      if (!u || u.role !== role) {
        return reply.code(403).send({ error: 'Forbidden', errorCode: 'FORBIDDEN' });
      }
    };
  });
}, { 
  name: 'auth-plugin', 
  fastify: '4.x' 
});