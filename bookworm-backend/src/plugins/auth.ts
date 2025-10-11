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
        return reply.code(401).send({ code: 'UNAUTHORIZED', message: 'Missing authorization header' });
      }

      const token = req.headers.authorization.replace('Bearer ', '');
      const payload = await verifier(token);
      req.user = {
        userId: payload.userId,
        openid: payload.openid,
      };
    } catch (err: unknown) {
      fastify.log.warn({ err }, 'Authentication failed');
      return reply.code(401).send({ code: 'UNAUTHORIZED', message: 'Invalid token' });
    }
  });

  fastify.decorate('requireRole', (role: 'USER' | 'STAFF') => {
    return async (req: FastifyRequest, reply: FastifyReply) => {
      if (!req.user) {
        return reply.code(401).send({ code: 'UNAUTHORIZED', message: 'Unauthorized' });
      }

      try {
        const dbUser = await prisma.user.findUnique({
          where: { id: req.user.userId },
          select: { role: true },
        });

        if (!dbUser) {
          return reply.code(401).send({ code: 'UNAUTHORIZED', message: 'User not found' });
        }

        req.user.role = dbUser.role;

        if (dbUser.role !== role) {
          return reply.code(403).send({ code: 'FORBIDDEN', message: 'Forbidden' });
        }

        if (process.env.NODE_ENV === 'test') {
          fastify.log.info({
            userId: req.user.userId,
            userRole: dbUser.role,
            requiredRole: role,
            source: 'db_lookup',
          }, 'Role check debug');
        }
      } catch (err) {
        fastify.log.error({ err, userId: req.user.userId }, 'Role verification failed');
        return reply.code(500).send({ code: 'INTERNAL_ERROR', message: 'Failed to verify role' });
      }
    };
  });
}, {
  name: 'auth-plugin',
  fastify: '4.x',
});