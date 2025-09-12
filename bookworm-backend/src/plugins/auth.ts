import fp from 'fastify-plugin';
import { createVerifier } from 'fast-jwt';
import config from '../config';
import prisma from '../db';
import { FastifyRequest, FastifyReply } from 'fastify';

export default fp(async (fastify) => {
  const verifier = createVerifier({ key: config.JWT_SECRET });

  fastify.decorate('authenticate', async (req: FastifyRequest, reply: FastifyReply) => {
    try {
      if (!req.headers.authorization) {
        throw new Error('Missing authorization header');
      }

      const token = req.headers.authorization.replace('Bearer ', '');
      const payload = await verifier(token);
      req.user = { userId: payload.userId, openid: payload.openid };
    } catch (err: any) {
      fastify.log.warn({ err }, 'Authentication failed');
      return reply.code(401).send({ error: 'Invalid token', errorCode: 'INVALID_TOKEN' });
    }
  });

  fastify.decorate('requireRole', (role: 'USER' | 'STAFF') => {
    return async (req: FastifyRequest, reply: FastifyReply) => {
      if (!req.user) return reply.code(401).send({ error: 'Unauthorized', errorCode: 'UNAUTHORIZED' });
      
      try {
        const u = await prisma.user.findUnique({
          where: { id: req.user.userId }, select: { role: true }
        });
        if (!u || u.role !== role) {
          return reply.code(403).send({ error: 'Forbidden', errorCode: 'FORBIDDEN' });
        }
      } catch (err) {
        fastify.log.warn({ err }, 'Database error in requireRole');
        return reply.code(403).send({ error: 'Forbidden', errorCode: 'FORBIDDEN' });
      }
    };
  });
}, { 
  name: 'auth-plugin', 
  fastify: '4.x' 
});