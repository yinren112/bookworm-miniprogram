import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import axios from "axios";
import config from "../config";
import { requestWxPhoneNumber } from "../services/authService";

vi.mock("axios", () => ({
  default: {
    get: vi.fn(),
    post: vi.fn(),
    isAxiosError: (value: unknown) =>
      Boolean(value && typeof value === "object" && (value as { isAxiosError?: boolean }).isAxiosError),
  },
}));

const mockedAxios = axios as unknown as {
  get: ReturnType<typeof vi.fn>;
  post: ReturnType<typeof vi.fn>;
};

describe("requestWxPhoneNumber", () => {
  const originalEnv = {
    NODE_ENV: config.NODE_ENV,
    WX_APP_ID: config.WX_APP_ID,
    WX_APP_SECRET: config.WX_APP_SECRET,
  };

  beforeEach(() => {
    config.NODE_ENV = "production";
    config.WX_APP_ID = "wx-real";
    config.WX_APP_SECRET = "secret-real";
  });

  afterEach(() => {
    config.NODE_ENV = originalEnv.NODE_ENV;
    config.WX_APP_ID = originalEnv.WX_APP_ID;
    config.WX_APP_SECRET = originalEnv.WX_APP_SECRET;
    vi.clearAllMocks();
    vi.useRealTimers();
  });

  it("returns phone number on success", async () => {
    mockedAxios.get.mockResolvedValue({
      data: { access_token: "token", expires_in: 7200 },
    });
    mockedAxios.post.mockResolvedValue({
      data: {
        errcode: 0,
        errmsg: "ok",
        phone_info: {
          phoneNumber: "13800138000",
          purePhoneNumber: "13800138000",
          countryCode: "86",
        },
      },
    });

    const result = await requestWxPhoneNumber("code");

    expect(result.status).toBe("ok");
    if (result.status === "ok") {
      expect(result.phoneNumber).toBe("13800138000");
    }
  });

  it("returns non-retryable failure for invalid code", async () => {
    mockedAxios.get.mockResolvedValue({
      data: { access_token: "token", expires_in: 7200 },
    });
    mockedAxios.post.mockResolvedValue({
      data: { errcode: 40029, errmsg: "invalid code" },
    });

    const result = await requestWxPhoneNumber("code");

    expect(result.status).toBe("failed");
    if (result.status === "failed") {
      expect(result.retryable).toBe(false);
      expect(result.errcode).toBe(40029);
    }
  });

  it("returns retryable failure after retries exhausted", async () => {
    vi.useFakeTimers();

    mockedAxios.get.mockResolvedValue({
      data: { access_token: "token", expires_in: 7200 },
    });
    mockedAxios.post.mockResolvedValue({
      data: { errcode: -1, errmsg: "system busy" },
    });

    const promise = requestWxPhoneNumber("code");
    await vi.runAllTimersAsync();
    const result = await promise;

    expect(result.status).toBe("failed");
    if (result.status === "failed") {
      expect(result.retryable).toBe(true);
      expect(result.errcode).toBe(-1);
    }
  });
});
