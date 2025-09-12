// src/tests/authService.test.ts
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { mockDeep, mockReset } from 'vitest-mock-extended';
import { PrismaClient } from '@prisma/client';
import axios from 'axios';

const prismaMock = mockDeep<PrismaClient>();

vi.mock('axios');
vi.mock('../db', () => ({
  default: prismaMock,
}));
vi.mock('../config', () => ({
  default: {
    WX_APP_ID: 'test_appid',
    WX_APP_SECRET: 'test_secret',
    JWT_SECRET: 'test_jwt_secret',
    JWT_EXPIRES_IN: '7d',
  }
}));

// Import AFTER mocking
const { wxLogin } = await import('../services/authService');

describe('Auth Service - wxLogin', () => {
  beforeEach(() => {
    mockReset(prismaMock);
    vi.mocked(axios.get).mockClear();
  });

  describe('Simple flow - no unionid', () => {
    it('creates new user when openid does not exist', async () => {
      const code = 'new_user_code';
      const wxSession = { openid: 'new_openid' };
      
      vi.mocked(axios.get).mockResolvedValue({ data: wxSession });
      
      const newUser = { id: 1, openid: 'new_openid', unionid: null };
      prismaMock.$transaction.mockResolvedValue(newUser);
      prismaMock.user.findUnique.mockResolvedValue(null);
      prismaMock.user.create.mockResolvedValue(newUser as any);

      const result = await wxLogin(code);

      expect(result.user).toEqual(newUser);
      expect(result.token).toBeDefined();
      expect(typeof result.token).toBe('string');
    });

    it('returns existing user when openid exists', async () => {
      const code = 'existing_user_code';
      const wxSession = { openid: 'existing_openid' };
      
      vi.mocked(axios.get).mockResolvedValue({ data: wxSession });
      
      const existingUser = { id: 2, openid: 'existing_openid', unionid: null };
      prismaMock.$transaction.mockResolvedValue(existingUser);
      prismaMock.user.findUnique.mockResolvedValue(existingUser as any);

      const result = await wxLogin(code);

      expect(result.user).toEqual(existingUser);
      expect(prismaMock.user.create).not.toHaveBeenCalled();
    });
  });

  describe('Complex flow - with unionid', () => {
    it('finds user by unionid and updates openid if different', async () => {
      const code = 'unionid_update_code';
      const wxSession = { openid: 'new_openid', unionid: 'existing_unionid' };
      
      vi.mocked(axios.get).mockResolvedValue({ data: wxSession });
      
      const userWithOldOpenid = { id: 3, openid: 'old_openid', unionid: 'existing_unionid' };
      const userWithNewOpenid = { id: 3, openid: 'new_openid', unionid: 'existing_unionid' };
      
      prismaMock.$transaction.mockResolvedValue(userWithNewOpenid);
      prismaMock.user.findUnique.mockResolvedValueOnce(userWithOldOpenid as any);
      prismaMock.user.update.mockResolvedValue(userWithNewOpenid as any);

      const result = await wxLogin(code);

      expect(result.user).toEqual(userWithNewOpenid);
    });

    it('finds user by unionid and returns as-is if openid matches', async () => {
      const code = 'unionid_same_openid_code';
      const wxSession = { openid: 'same_openid', unionid: 'existing_unionid' };
      
      vi.mocked(axios.get).mockResolvedValue({ data: wxSession });
      
      const existingUser = { id: 4, openid: 'same_openid', unionid: 'existing_unionid' };
      
      prismaMock.$transaction.mockResolvedValue(existingUser);
      prismaMock.user.findUnique.mockResolvedValueOnce(existingUser as any);

      const result = await wxLogin(code);

      expect(result.user).toEqual(existingUser);
      expect(prismaMock.user.update).not.toHaveBeenCalled();
    });

    it('finds user by openid and adds unionid if missing', async () => {
      const code = 'add_unionid_code';
      const wxSession = { openid: 'existing_openid', unionid: 'new_unionid' };
      
      vi.mocked(axios.get).mockResolvedValue({ data: wxSession });
      
      const userWithoutUnionid = { id: 5, openid: 'existing_openid', unionid: null };
      const userWithUnionid = { id: 5, openid: 'existing_openid', unionid: 'new_unionid' };
      
      prismaMock.$transaction.mockResolvedValue(userWithUnionid);
      // First findUnique by unionid returns null
      prismaMock.user.findUnique.mockResolvedValueOnce(null);
      // Second findUnique by openid returns user
      prismaMock.user.findUnique.mockResolvedValueOnce(userWithoutUnionid as any);
      prismaMock.user.update.mockResolvedValue(userWithUnionid as any);

      const result = await wxLogin(code);

      expect(result.user).toEqual(userWithUnionid);
    });

    it('creates new user with both openid and unionid', async () => {
      const code = 'new_user_with_unionid_code';
      const wxSession = { openid: 'brand_new_openid', unionid: 'brand_new_unionid' };
      
      vi.mocked(axios.get).mockResolvedValue({ data: wxSession });
      
      const newUser = { id: 6, openid: 'brand_new_openid', unionid: 'brand_new_unionid' };
      
      prismaMock.$transaction.mockResolvedValue(newUser);

      const result = await wxLogin(code);

      expect(result.user).toEqual(newUser);
      expect(result.token).toBeDefined();
      expect(prismaMock.$transaction).toHaveBeenCalled();
    });
  });

  describe('Error handling', () => {
    it('throws error when WeChat API returns error code', async () => {
      const code = 'invalid_code';
      const wxError = { errcode: 40029, errmsg: 'invalid code' };
      
      vi.mocked(axios.get).mockResolvedValue({ data: wxError });

      await expect(wxLogin(code)).rejects.toThrow('WeChat API Error: invalid code');
    });

    it('throws error when WeChat API request fails', async () => {
      const code = 'network_error_code';
      
      vi.mocked(axios.get).mockRejectedValue(new Error('Network error'));

      await expect(wxLogin(code)).rejects.toThrow('Network error');
    });

    it('throws error when database transaction fails', async () => {
      const code = 'db_error_code';
      const wxSession = { openid: 'test_openid' };
      
      vi.mocked(axios.get).mockResolvedValue({ data: wxSession });
      prismaMock.$transaction.mockRejectedValue(new Error('Database connection failed'));

      await expect(wxLogin(code)).rejects.toThrow('Database connection failed');
    });
  });

  describe('JWT token generation', () => {
    it('generates valid JWT with user payload', async () => {
      const code = 'token_test_code';
      const wxSession = { openid: 'token_test_openid' };
      
      vi.mocked(axios.get).mockResolvedValue({ data: wxSession });
      
      const user = { id: 99, openid: 'token_test_openid' };
      prismaMock.$transaction.mockResolvedValue(user);

      const result = await wxLogin(code);

      expect(result.token).toBeDefined();
      expect(typeof result.token).toBe('string');
      expect(result.token.split('.')).toHaveLength(3); // JWT has 3 parts
    });
  });
});