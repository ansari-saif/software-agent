import type { NextFunction, Request, Response } from "express";
import jwt from "jsonwebtoken";
import dotenv from 'dotenv';

// Load environment variables from .env file
dotenv.config();

export function authMiddleware(
  req: Request,
  res: Response,
  next: NextFunction
) {
  const authHeader = req.headers.authorization; // Bearer <token>
  const token = authHeader?.split(" ")[1];
  
  if (!token) {
    res.status(401).json({ message: "Unauthorized" });
    return;
  }

  // Add check for JWT_PUBLIC_KEY
  if (!process.env.JWT_PUBLIC_KEY) {
    console.error('JWT_PUBLIC_KEY is not set in environment variables');
    res.status(500).json({ message: "Server configuration error" });
    return;
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_PUBLIC_KEY);
    if (!decoded) {
      res.status(401).json({ message: "Unauthorized" });
      return;
    }
    const userId = (decoded as any).sub;
    if (!userId) {
      res.status(401).json({ message: "Unauthorized" });
      return;
    }
    req.userId = userId;
    next();
  } catch (error) {
    console.error('JWT verification error:', error);
    res.status(401).json({ message: "Unauthorized" });
    return;
  }
}
