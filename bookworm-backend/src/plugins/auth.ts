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
        role: payload.role,
      };
    } catch (err: unknown) {
      fastify.log.warn({ err }, 'Authentication failed');
      return reply.code(401).send({ code: 'UNAUTHORIZED', message: 'Invalid token' });
    }
  });

  fastify.decorate('requireRole', (role: 'USER' | 'STAFF') => {
    return async (req: FastifyRequest, reply: FastifyReply) => {
      // 未认证 → 401 (req.user 不存在意味着 authenticate 未执行或失败)
      if (!req.user) {
        return reply.code(401).send({ code: 'UNAUTHORIZED', message: 'Unauthorized' });
      }

      // Role is now encoded in JWT - no database lookup needed
      // NOTE: If role changes require immediate effect, consider implementing:
      // - JWT blacklist (Redis) or short TTL (1h) + refresh token

      // 已认证但无权限（无 role 或 role 不匹配）→ 403
      // 修复：缺少 role 字段是权限问题，不是认证问题
      if (!req.user.role) {
        return reply.code(403).send({ code: 'FORBIDDEN', message: 'Role required' });
      }

      if (req.user.role !== role) {
        return reply.code(403).send({ code: 'FORBIDDEN', message: 'Forbidden' });
      }

      if (process.env.NODE_ENV === 'test') {
        fastify.log.info({
          userId: req.user.userId,
          userRole: req.user.role,
          requiredRole: role,
          source: 'jwt_payload',
        }, 'Role check debug');
      }
    };
  });
}, {
  name: 'auth-plugin',
  fastify: '4.x',
});