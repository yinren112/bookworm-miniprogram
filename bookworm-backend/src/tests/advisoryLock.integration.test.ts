// src/tests/advisoryLock.integration.test.ts
import { describe, it, expect, beforeAll, vi } from "vitest";
import { getPrismaClientForWorker } from "./globalSetup";
import { withAdvisoryLock } from "../utils/dbLock";

describe("Advisory Lock Concurrent Execution Tests", () => {
  let prisma: any;

  beforeAll(async () => {
    prisma = getPrismaClientForWorker();
  });

  it("应该确保在并发场景下只有一个任务实例能获取到同一个咨询锁", async () => {
    const LOCK_NAME = "test:concurrent-lock-verification";

    // 创建一个 mock 回调函数，记录其被调用的次数
    const mockCallback = vi.fn().mockImplementation(async () => {
      // 模拟一些异步工作
      await new Promise(resolve => setTimeout(resolve, 50));
      return "task-completed";
    });

    // 并发启动10个任务，都尝试获取同一个锁
    const concurrentPromises = Array(10)
      .fill(null)
      .map(() => withAdvisoryLock(prisma, LOCK_NAME, mockCallback));

    const results = await Promise.all(concurrentPromises);

    // 断言：回调函数只被执行了一次
    expect(mockCallback).toHaveBeenCalledTimes(1);

    // 断言：返回值中只有一个是成功执行的结果，其余都是null（跳过执行）
    const successfulResults = results.filter((r) => r === "task-completed");
    const skippedResults = results.filter((r) => r === null);

    expect(successfulResults).toHaveLength(1);
    expect(skippedResults).toHaveLength(9);
  });

  it("应该允许不同锁名的任务并发执行", async () => {
    const LOCK_NAME_A = "test:lock-a";
    const LOCK_NAME_B = "test:lock-b";

    const mockCallbackA = vi.fn().mockResolvedValue("task-a-completed");
    const mockCallbackB = vi.fn().mockResolvedValue("task-b-completed");

    // 并发执行两个不同锁名的任务
    const [resultA, resultB] = await Promise.all([
      withAdvisoryLock(prisma, LOCK_NAME_A, mockCallbackA),
      withAdvisoryLock(prisma, LOCK_NAME_B, mockCallbackB),
    ]);

    // 断言：两个任务都应该成功执行
    expect(mockCallbackA).toHaveBeenCalledTimes(1);
    expect(mockCallbackB).toHaveBeenCalledTimes(1);
    expect(resultA).toBe("task-a-completed");
    expect(resultB).toBe("task-b-completed");
  });

  it("应该在任务抛出异常时仍然释放锁", async () => {
    const LOCK_NAME = "test:error-handling-lock";

    // 第一个任务会抛出错误
    const errorCallback = vi.fn().mockRejectedValue(new Error("Task failed"));

    // 第一次调用应该抛出错误
    await expect(
      withAdvisoryLock(prisma, LOCK_NAME, errorCallback)
    ).rejects.toThrow("Task failed");

    // 验证锁已被释放：第二个任务应该能成功获取锁
    const successCallback = vi.fn().mockResolvedValue("recovered");
    const result = await withAdvisoryLock(prisma, LOCK_NAME, successCallback);

    expect(successCallback).toHaveBeenCalledTimes(1);
    expect(result).toBe("recovered");
  });
});
