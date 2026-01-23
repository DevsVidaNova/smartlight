import type { SessionOptions } from "iron-session";

export interface SessionData {
  authed?: boolean;
}

export const sessionOptions: SessionOptions = {
  password:
    process.env.SESSION_SECRET ||
    "troque-esta-senha-com-32-caracteres-minimo-por-env",
  cookieName: "lighton_session",
  cookieOptions: {
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    httpOnly: true,
    path: "/",
  },
};

