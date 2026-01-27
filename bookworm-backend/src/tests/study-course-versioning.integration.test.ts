import { beforeAll, afterAll, describe, expect, it } from "vitest";
import { FastifyInstance } from "fastify";
import { createTestApp } from "../app-factory";
import { createTestUser, getPrismaClientForWorker } from "./globalSetup";

describe("Study Course Versioning", () => {
  let app: FastifyInstance;
  const prisma = getPrismaClientForWorker();

  beforeAll(async () => {
    app = await createTestApp();
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  it("should return enrolled version after publishing a new version", async () => {
    const { token, userId } = await createTestUser("USER");
    const { token: staffToken } = await createTestUser("STAFF");
    const courseKey = `COURSE_VERSION_${Date.now()}`;

    const courseV1 = await prisma.studyCourse.create({
      data: {
        courseKey,
        title: "Version 1",
        contentVersion: 1,
        status: "PUBLISHED",
      },
    });

    await prisma.studyUnit.create({
      data: {
        courseId: courseV1.id,
        unitKey: "UNIT_V1",
        title: "Unit V1",
        orderIndex: 1,
      },
    });

    await prisma.userCourseEnrollment.create({
      data: {
        userId,
        courseId: courseV1.id,
      },
    });

    const courseV2 = await prisma.studyCourse.create({
      data: {
        courseKey,
        title: "Version 2",
        contentVersion: 2,
        status: "DRAFT",
      },
    });

    const publishRes = await app.inject({
      method: "PATCH",
      url: `/api/study/admin/courses/${courseV2.id}/status`,
      headers: { authorization: `Bearer ${staffToken}` },
      payload: { status: "PUBLISHED" },
    });
    expect(publishRes.statusCode).toBe(200);

    const v1After = await prisma.studyCourse.findUnique({
      where: { id: courseV1.id },
    });
    expect(v1After?.status).toBe("ARCHIVED");

    const detailRes = await app.inject({
      method: "GET",
      url: `/api/study/courses/${courseKey}`,
      headers: { authorization: `Bearer ${token}` },
    });
    expect(detailRes.statusCode).toBe(200);
    const detailPayload = JSON.parse(detailRes.payload);
    expect(detailPayload.course.id).toBe(courseV1.id);
    expect(detailPayload.course.contentVersion).toBe(1);
    expect(detailPayload.course.latestContentVersion).toBe(2);
    expect(detailPayload.course.upgradeAvailable).toBe(true);

    const { token: otherToken } = await createTestUser("USER");
    const latestRes = await app.inject({
      method: "GET",
      url: `/api/study/courses/${courseKey}`,
      headers: { authorization: `Bearer ${otherToken}` },
    });
    expect(latestRes.statusCode).toBe(200);
    const latestPayload = JSON.parse(latestRes.payload);
    expect(latestPayload.course.id).toBe(courseV2.id);
    expect(latestPayload.course.contentVersion).toBe(2);
    expect(latestPayload.course.upgradeAvailable).toBe(false);
  });

  it("should keep only one published version per courseKey", async () => {
    const { token: staffToken } = await createTestUser("STAFF");
    const courseKey = `COURSE_PUBLISHED_UNIQUE_${Date.now()}`;

    const courseV1 = await prisma.studyCourse.create({
      data: {
        courseKey,
        title: "Published V1",
        contentVersion: 1,
        status: "PUBLISHED",
      },
    });

    const courseV2 = await prisma.studyCourse.create({
      data: {
        courseKey,
        title: "Published V2",
        contentVersion: 2,
        status: "DRAFT",
      },
    });

    const publishRes = await app.inject({
      method: "PATCH",
      url: `/api/study/admin/courses/${courseV2.id}/status`,
      headers: { authorization: `Bearer ${staffToken}` },
      payload: { status: "PUBLISHED" },
    });
    expect(publishRes.statusCode).toBe(200);

    const published = await prisma.studyCourse.findMany({
      where: { courseKey, status: "PUBLISHED" },
    });
    expect(published).toHaveLength(1);
    expect(published[0].id).toBe(courseV2.id);

    const v1After = await prisma.studyCourse.findUnique({
      where: { id: courseV1.id },
    });
    expect(v1After?.status).toBe("ARCHIVED");
  });
});
