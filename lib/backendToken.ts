import jwt from "jsonwebtoken";

type BackendTokenPayload = {
  sub: string;
  email?: string | null;
  role?: string | null;
};

export function createBackendToken(payload: BackendTokenPayload) {
  const secret = process.env.BACKEND_JWT_SECRET;
  if (!secret) {
    throw new Error("BACKEND_JWT_SECRET is not configured");
  }
  const issuer = process.env.BACKEND_JWT_ISSUER || "note2tabs-frontend";
  const audience = process.env.BACKEND_JWT_AUDIENCE || "note2tabs-backend";
  return jwt.sign(payload, secret, {
    issuer,
    audience,
    expiresIn: "15m",
  });
}
