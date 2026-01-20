import fp from 'fastify-plugin';
import { createVerifier } from 'fast-jwt';
import config from '../config';
import { FastifyRequest, FastifyReply } from 'fastify';

export interface StaffUser {
  type: 'staff';
  staffId: number;
  username: string;
  displayName: string;
  role: 'STAFF' | 'ADMIN';
}

declare module 'fastify' {
  interface FastifyRequest {
    staffUser?: StaffUser;
  }
  interface FastifyInstance {
    authenticateStaff: (req: FastifyRequest, reply: FastifyReply) => Promise<void>;
    requireStaffAdmin: (req: FastifyRequest, reply: FastifyReply) => Promise<void>;
  }
}

export default fp(async (fastify) => {
  const verifier = createVerifier({ key: config.JWT_SECRET });

  fastify.decorate('authenticateStaff', async (req: FastifyRequest, reply: FastifyReply) => {
    try {
      if (!req.headers.authorization) {
        return reply.code(401).send({ code: 'UNAUTHORIZED', message: 'Missing authorization header' });
      }

      const token = req.headers.authorization.replace('Bearer ', '');
      const payload = await verifier(token);

      // 验证是Staff token而非User token
      if (payload.type !== 'staff') {
        return reply.code(401).send({ code: 'UNAUTHORIZED', message: 'Invalid token type' });
      }

      req.staffUser = {
        type: 'staff',
        staffId: payload.staffId,
        username: payload.username,
        displayName: payload.displayName,
        role: payload.role,
      };
    } catch (err: unknown) {
      fastify.log.warn({ err }, 'Staff authentication failed');
      return reply.code(401).send({ code: 'UNAUTHORIZED', message: 'Invalid token' });
    }
  });

  fastify.decorate('requireStaffAdmin', async (req: FastifyRequest, reply: FastifyReply) => {
    if (!req.staffUser) {
      return reply.code(401).send({ code: 'UNAUTHORIZED', message: 'Unauthorized' });
    }

    if (req.staffUser.role !== 'ADMIN') {
      return reply.code(403).send({ code: 'FORBIDDEN', message: 'Admin access required' });
    }
  });
}, {
  name: 'staff-auth-plugin',
  fastify: '4.x',
});
