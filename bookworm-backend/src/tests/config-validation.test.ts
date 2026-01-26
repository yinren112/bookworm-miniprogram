import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const baseEnv = {
  NODE_ENV: "production",
  PORT: "8080",
  HOST: "0.0.0.0",
  DATABASE_URL: "postgresql://user:pass@localhost:5432/bookworm",
  JWT_SECRET: "StrongSecret!1234567890StrongSecret!1234567890",
  WX_APP_ID: "wx-test",
  WX_APP_SECRET: "wx-secret",
  WXPAY_MCHID: "mchid",
  WXPAY_PRIVATE_KEY_PATH: "/tmp/mock.pem",
  WXPAY_CERT_SERIAL_NO: "serial",
  WXPAY_API_V3_KEY: "12345678901234567890123456789012",
  WXPAY_NOTIFY_URL: "https://example.com/notify",
  CORS_ORIGIN: "https://admin.example.com",
  METRICS_AUTH_TOKEN: "test-metrics-token",
};

describe("config production validation", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    vi.resetModules();
    process.env = { ...originalEnv, ...baseEnv };
  });

  afterEach(() => {
    process.env = { ...originalEnv };
    vi.restoreAllMocks();
  });

  it("should fail when CORS_ORIGIN is missing in production", async () => {
    process.env.CORS_ORIGIN = "";

    vi.doMock("fs", () => ({
      existsSync: vi.fn().mockReturnValue(true),
    }));

    const exitSpy = vi
      .spyOn(process, "exit")
      .mockImplementation(((code?: number) => {
        throw new Error(`process.exit:${code}`);
      }) as never);

    await expect(async () => {
      await import("../config");
    }).rejects.toThrow("process.exit:1");

    expect(exitSpy).toHaveBeenCalledWith(1);
  });

  it("should fail when HOST is not routable in production", async () => {
    process.env.HOST = "127.0.0.1";

    vi.doMock("fs", () => ({
      existsSync: vi.fn().mockReturnValue(true),
    }));

    const exitSpy = vi
      .spyOn(process, "exit")
      .mockImplementation(((code?: number) => {
        throw new Error(`process.exit:${code}`);
      }) as never);

    await expect(async () => {
      await import("../config");
    }).rejects.toThrow("process.exit:1");

    expect(exitSpy).toHaveBeenCalledWith(1);
  });

  it("should fail when WX_APP_ID is dummy in production", async () => {
    process.env.WX_APP_ID = "dummy-app-id";

    vi.doMock("fs", () => ({
      existsSync: vi.fn().mockReturnValue(true),
    }));

    const exitSpy = vi
      .spyOn(process, "exit")
      .mockImplementation(((code?: number) => {
        throw new Error(`process.exit:${code}`);
      }) as never);

    await expect(async () => {
      await import("../config");
    }).rejects.toThrow("process.exit:1");

    expect(exitSpy).toHaveBeenCalledWith(1);
  });

  it("should fail when WX_APP_SECRET is dummy in production", async () => {
    process.env.WX_APP_SECRET = "dummy-app-secret";

    vi.doMock("fs", () => ({
      existsSync: vi.fn().mockReturnValue(true),
    }));

    const exitSpy = vi
      .spyOn(process, "exit")
      .mockImplementation(((code?: number) => {
        throw new Error(`process.exit:${code}`);
      }) as never);

    await expect(async () => {
      await import("../config");
    }).rejects.toThrow("process.exit:1");

    expect(exitSpy).toHaveBeenCalledWith(1);
  });
});

describe("config test runtime", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    vi.resetModules();
    process.env = { ...originalEnv, NODE_ENV: "test" };
  });

  afterEach(() => {
    process.env = { ...originalEnv };
    vi.restoreAllMocks();
  });

  it("should import without required env in test", async () => {
    delete process.env.DATABASE_URL;
    delete process.env.JWT_SECRET;
    delete process.env.WX_APP_ID;
    delete process.env.WX_APP_SECRET;

    await expect(import("../config")).resolves.toBeDefined();
  });
});
