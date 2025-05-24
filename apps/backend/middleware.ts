import type { NextFunction, Request, Response } from "express";
import jwt from "jsonwebtoken";

// Extend Express Request interface to include userId
declare global {
  namespace Express {
    interface Request {
      userId?: string;
    }
  }
}

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
  
  try {
    // For development testing: Parse token without verification
    const decodedToken = jwt.decode(token, { complete: true });
    if (!decodedToken) {
      throw new Error("Invalid token format"); ̰
    }
    
    console.log("Token algorithm:", decodedToken.header?.alg);
    console.log("Token payload:", decodedToken.payload);
    
    // Extract userId from payload directly for testing
    const userId = (decodedToken.payload as any).sub;
    if (!userId) {
      res.status(401).json({ message: "Unauthorized - No user ID in token" });
      return;
    }
    
    // For production, uncomment this:
    // const jwtSecret = process.env.JWT_PUBLIC_KEY;
    // if (!jwtSecret) {
    //   throw new Error("JWT_PUBLIC_KEY not configured");
    // }
    // const verified = jwt.verify(token, jwtSecret, { algorithms: ['RS256'] });
    // const userId = (verified as any).sub;
    
    // Set userId in request for use in routes
    req.userId = userId;
    next();
  } catch (error) {
    console.error("JWT verification error:", error);
    res.status(401).json({ message: "Unauthorized" });
  }
}
