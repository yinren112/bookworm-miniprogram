import { FastifyRequest, FastifyReply } from 'fastify';

declare module 'fastify' {
  interface FastifyRequest {
    user?: { userId: number; openid: string };
  }
  interface FastifyInstance {
    authenticate: (req: FastifyRequest, reply: FastifyReply) => Promise<void>;
    requireRole: (role: 'USER' | 'STAFF') => (req: FastifyRequest, reply: FastifyReply) => Promise<void>;
  }
}