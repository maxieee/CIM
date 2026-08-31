import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import { env } from '../config/env.js';
import { SignOptions } from 'jsonwebtoken';

export interface TokenPayload {
  adminId: string;
  username: string;
  role: string;
}

const signOptions: SignOptions = {
  algorithm: 'HS256',
};

export function generateAccessToken(payload: TokenPayload): string {
  return jwt.sign(payload, env.JWT_SECRET, {
    ...signOptions,
    expiresIn: env.JWT_EXPIRES_IN as SignOptions['expiresIn'],
  });
}

export function generateRefreshToken(adminId: string): string {
  return jwt.sign({ adminId, type: 'refresh' }, env.JWT_SECRET, {
    ...signOptions,
    expiresIn: env.REFRESH_TOKEN_EXPIRES_IN as SignOptions['expiresIn'],
  });
}

export function verifyAccessToken(token: string): TokenPayload {
  return jwt.verify(token, env.JWT_SECRET) as TokenPayload;
}

export function verifyRefreshToken(token: string): { adminId: string } {
  const decoded = jwt.verify(token, env.JWT_SECRET) as { adminId: string; type: string };
  if (decoded.type !== 'refresh') {
    throw new Error('Invalid token type');
  }
  return { adminId: decoded.adminId };
}

export function hashToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

export function parseDurationToMs(duration: string): number {
  const match = duration.match(/^(\d+)(m|h|d|s)$/);
  if (!match) throw new Error(`Invalid duration: ${duration}`);
  const value = parseInt(match[1], 10);
  const unit = match[2];
  switch (unit) {
    case 's': return value * 1000;
    case 'm': return value * 60 * 1000;
    case 'h': return value * 60 * 60 * 1000;
    case 'd': return value * 24 * 60 * 60 * 1000;
    default: throw new Error(`Unknown unit: ${unit}`);
  }
}

export function parseDurationToSeconds(duration: string): number {
  return Math.floor(parseDurationToMs(duration) / 1000);
}