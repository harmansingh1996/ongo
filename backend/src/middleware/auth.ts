import { Request, Response, NextFunction } from 'express';
import { verifyUserAuth } from '../utils/supabase';

// Extend Express Request to include userId
declare global {
  namespace Express {
    interface Request {
      userId?: string;
    }
  }
}

/**
 * Middleware to verify user authentication
 * Extracts JWT token from Authorization header and verifies with Supabase
 */
export async function authMiddleware(req: Request, res: Response, next: NextFunction) {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        success: false,
        error: 'Missing or invalid authorization header',
      });
    }

    const token = authHeader;
    const userId = await verifyUserAuth(token);

    // Attach userId to request for use in route handlers
    req.userId = userId;
    next();
  } catch (error: any) {
    return res.status(401).json({
      success: false,
      error: error.message || 'Unauthorized',
    });
  }
}

/**
 * Optional auth middleware - allows requests to proceed even without auth
 * Useful for endpoints that can work with or without authentication
 */
export async function optionalAuthMiddleware(req: Request, res: Response, next: NextFunction) {
  try {
    const authHeader = req.headers.authorization;

    if (authHeader && authHeader.startsWith('Bearer ')) {
      const token = authHeader;
      const userId = await verifyUserAuth(token);
      req.userId = userId;
    }

    next();
  } catch (error) {
    // Silently fail - request proceeds without userId
    next();
  }
}
