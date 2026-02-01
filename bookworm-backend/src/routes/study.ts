import { FastifyPluginAsync } from "fastify";
import studyCoursesRoutes from "./study/courses";
import studySessionsRoutes from "./study/sessions";
import studyExtrasRoutes from "./study/extras";

const studyRoutes: FastifyPluginAsync = async (fastify) => {
  await fastify.register(studyCoursesRoutes);
  await fastify.register(studySessionsRoutes);
  await fastify.register(studyExtrasRoutes);
};

export default studyRoutes;

