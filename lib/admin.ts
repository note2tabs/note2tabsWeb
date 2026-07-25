import type { Session } from "next-auth";
import { hasFreshUserRole } from "./serverAuth";

const ADMIN_ROLES = new Set(["ADMIN"]);

export const isFreshAdminSession = (session?: Session | null) =>
  hasFreshUserRole(session, ADMIN_ROLES);
