import { FastifyPluginAsync } from "fastify";
import prisma from "../../db";
import config from "../../config";
import {
  assertIncludeUnpublishedAllowed,
  shouldIncludeUnpublishedFallback,
} from "../../utils/studyCourseVisibility";
import {
  getCourseList,
  getCourseByKey,
  enrollCourse,
  updateEnrollmentExamDate,
  getUserEnrolledCourses,
} from "../../services/study";
import { StudyServiceError, StudyErrorCodes } from "../../errors";
import {
  GetCoursesQuerySchema,
  GetCoursesQuery,
  CourseKeyParamsSchema,
  CourseKeyParams,
  EnrollCourseParamsSchema,
  EnrollCourseParams,
  EnrollCourseBodySchema,
  EnrollCourseBody,
  UpdateExamDateBodySchema,
  UpdateExamDateBody,
} from "../studySchemas";

const studyCoursesRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.get<{ Querystring: GetCoursesQuery }>(
    "/api/study/courses",
    {
      preHandler: [fastify.authenticate],
      schema: {
        querystring: GetCoursesQuerySchema,
      },
    },
    async (request, reply) => {
      const userId = request.user!.userId;
      const { enrolled, includeUnpublished } = request.query;
      const includeUnpublishedFlag = includeUnpublished === true;
      assertIncludeUnpublishedAllowed(includeUnpublishedFlag, config.NODE_ENV);

      const courses = enrolled
        ? await getUserEnrolledCourses(prisma, userId)
        : await getCourseList(prisma, {
            publishedOnly: true,
            userId,
            includeUnpublishedFallback: shouldIncludeUnpublishedFallback(
              includeUnpublishedFlag,
              config.NODE_ENV,
            ),
          });

      reply.send({ courses });
    },
  );

  fastify.get<{ Params: CourseKeyParams }>(
    "/api/study/courses/:courseKey",
    {
      preHandler: [fastify.authenticate],
      schema: {
        params: CourseKeyParamsSchema,
      },
    },
    async (request, reply) => {
      const userId = request.user!.userId;
      const { courseKey } = request.params;

      const course = await getCourseByKey(prisma, courseKey, { userId });
      if (!course) {
        throw new StudyServiceError(StudyErrorCodes.COURSE_NOT_FOUND, "Course not found");
      }

      reply.send({ course });
    },
  );

  fastify.post<{ Params: EnrollCourseParams; Body: EnrollCourseBody }>(
    "/api/study/courses/:courseKey/enroll",
    {
      preHandler: [fastify.authenticate],
      schema: {
        params: EnrollCourseParamsSchema,
        body: EnrollCourseBodySchema,
      },
    },
    async (request, reply) => {
      const userId = request.user!.userId;
      const { courseKey } = request.params;
      const { sourceScene } = request.body;

      const course = await getCourseByKey(prisma, courseKey);
      if (!course) {
        throw new StudyServiceError(StudyErrorCodes.COURSE_NOT_FOUND, "Course not found");
      }

      const result = await enrollCourse(prisma, userId, course.id, sourceScene);
      reply.send(result);
    },
  );

  fastify.patch<{ Params: EnrollCourseParams; Body: UpdateExamDateBody }>(
    "/api/study/courses/:courseKey/exam-date",
    {
      preHandler: [fastify.authenticate],
      schema: {
        params: EnrollCourseParamsSchema,
        body: UpdateExamDateBodySchema,
      },
    },
    async (request, reply) => {
      const userId = request.user!.userId;
      const { courseKey } = request.params;
      const { examDate } = request.body;

      const course = await getCourseByKey(prisma, courseKey, { userId });
      if (!course) {
        throw new StudyServiceError(StudyErrorCodes.COURSE_NOT_FOUND, "Course not found");
      }

      if (!course.enrollment) {
        await enrollCourse(prisma, userId, course.id);
      }

      let parsedExamDate: Date | null = null;
      if (examDate !== null) {
        const date = new Date(`${examDate}T00:00:00+08:00`);
        if (Number.isNaN(date.getTime())) {
          throw new StudyServiceError(StudyErrorCodes.INVALID_EXAM_DATE, "Invalid exam date");
        }
        parsedExamDate = date;
      }

      const updated = await updateEnrollmentExamDate(
        prisma,
        userId,
        course.id,
        parsedExamDate,
      );

      reply.send({
        examDate: updated ? updated.toISOString() : null,
      });
    },
  );
};

export default studyCoursesRoutes;

