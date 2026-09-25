import { Request, Response, NextFunction } from "express";

/**
 * Express middleware to validate server-to-server worker authentication secret.
 * Rejects unauthorized calls with 401 Unauthorized status.
 */
export function validateWorkerSecret(req: Request, res: Response, next: NextFunction) {
  const secretHeader = req.headers["x-mediaflow-secret"];
  const expectedSecret = process.env.MEDIA_WORKER_SECRET;

  if (!expectedSecret || !expectedSecret.trim()) {
    return res.status(401).json({
      error: "Media worker authentication is unconfigured.",
      code: "UNAUTHORIZED_WORKER",
    });
  }

  if (!secretHeader || typeof secretHeader !== "string" || secretHeader.trim() !== expectedSecret.trim()) {
    return res.status(401).json({
      error: "Invalid or missing worker secret authorization header.",
      code: "UNAUTHORIZED_WORKER",
    });
  }

  next();
}
