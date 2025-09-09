// src/services/authService.ts
import axios from 'axios';
import jwt from 'jsonwebtoken';
import config from '../config'; // <-- Import config
import prisma from '../db';

export async function wxLogin(code: string) {
  const url = `https://api.weixin.qq.com/sns/jscode2session?appid=${config.wxAppId}&secret=${config.wxAppSecret}&js_code=${code}&grant_type=authorization_code`;
  const { data: wxSession } = await axios.get(url);
  
  if (wxSession.errcode) { throw new Error(`WeChat API Error: ${wxSession.errmsg}`); }

  const { openid } = wxSession;
  const user = await prisma.user.upsert({ where: { openid }, update: {}, create: { openid } });
  
  const token = jwt.sign({ userId: user.id, openid: user.openid }, config.jwtSecret, { expiresIn: '7d' });

  return { token, user };
}