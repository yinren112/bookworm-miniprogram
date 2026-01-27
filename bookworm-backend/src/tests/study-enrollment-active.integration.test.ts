import { beforeAll, afterAll, describe, expect, it } from "vitest";
import { FastifyInstance } from "fastify";
import { createTestApp } from "../app-factory";
import { createTestUser, getPrismaClientForWorker } from "./globalSetup";

describe("Study Enrollment Active", () => {
  let app: FastifyInstance;
  const prisma = getPrismaClientForWorker();

  beforeAll(async () => {
    app = await createTestApp();
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  it("should keep only one active enrollment per courseKey after enroll", async () => {
    const { token, userId } = await createTestUser("USER");
    const courseKey = `COURSE_ACTIVE_${Date.now()}`;

    const courseV1 = await prisma.studyCourse.create({
      data: {
        courseKey,
        title: "Course V1",
        contentVersion: 1,
        status: "PUBLISHED",
      },
    });

    const courseV2 = await prisma.studyCourse.create({
      data: {
        courseKey,
        title: "Course V2",
        contentVersion: 2,
        status: "DRAFT",
      },
    });

    await prisma.userCourseEnrollment.create({
      data: {
        userId,
        courseId: courseV1.id,
        isActive: true,
      },
    });

    await prisma.userCourseEnrollment.create({
      data: {
        userId,
        courseId: courseV2.id,
        isActive: true,
      },
    });

    const enrollRes = await app.inject({
      method: "POST",
      url: `/api/study/courses/${courseKey}/enroll`,
      headers: { authorization: `Bearer ${token}` },
      payload: {},
    });
    expect(enrollRes.statusCode).toBe(200);

    const enrollments = await prisma.userCourseEnrollment.findMany({
      where: {
        userId,
        courseId: { in: [courseV1.id, courseV2.id] },
      },
    });
    const activeEnrollments = enrollments.filter((item) => item.isActive);
    expect(activeEnrollments).toHaveLength(1);
    expect(activeEnrollments[0].courseId).toBe(courseV1.id);
  });
});
