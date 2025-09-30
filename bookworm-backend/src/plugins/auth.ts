import fp from 'fastify-plugin';
import { createVerifier } from 'fast-jwt';
import config from '../config';
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
        role: payload.role // 从JWT payload直接获取role
      };
    } catch (err: unknown) {
      fastify.log.warn({ err }, 'Authentication failed');
      return reply.code(401).send({ code: 'UNAUTHORIZED', message: 'Invalid token' });
    }
  });

  fastify.decorate('requireRole', (role: 'USER' | 'STAFF') => {
    return async (req: FastifyRequest, reply: FastifyReply) => {
      if (!req.user) return reply.code(401).send({ code: 'UNAUTHORIZED', message: 'Unauthorized' });

      // 从JWT payload中直接验证角色，无需查询数据库
      if (!req.user.role || req.user.role !== role) {
        return reply.code(403).send({ code: 'FORBIDDEN', message: 'Forbidden' });
      }

      // Debug logging for tests
      if (process.env.NODE_ENV === 'test') {
        fastify.log.info({
          userId: req.user.userId,
          userRole: req.user.role,
          requiredRole: role,
          source: 'jwt_payload'
        }, 'Role check debug');
      }
    };
  });
}, {
  name: 'auth-plugin',
  fastify: '4.x'
});