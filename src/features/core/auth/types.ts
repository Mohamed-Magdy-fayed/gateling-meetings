import type z from "zod";

import type { OAuthProvider, User } from "@/drizzle/schema";
import type { sessionSchema } from "./schemas";

export type SessionPayload = z.infer<typeof sessionSchema>;
type SessionUser = SessionPayload["user"];
// Callers build this before `sessionSchema.parse()` runs (e.g. from a Drizzle
// row where `emailVerifiedAt` is a real `Date`) — the schema's preprocess
// step normalizes it to a string, so the pre-parse shape allows both.
export type PartialUser = Omit<SessionUser, "emailVerifiedAt"> & {
  emailVerifiedAt?: Date | string | null;
};

export type AuthState =
  | { isAuthenticated: false; session: null }
  | { isAuthenticated: true; session: { user: User; hasPassword: boolean } };

export type OAuthConnection = {
  provider: OAuthProvider;
  displayName: string;
  connected: boolean;
  connectedAt: Date | null;
};

export type PasskeyListItem = {
  id: string;
  label: string | null;
  createdAt: string;
  lastUsedAt: string | null;
  isBackupEligible: boolean;
  isBackupState: boolean;
  transports: string[];
};

export type RegistrationOptionsResult =
  | { isError: false; options: PublicKeyCredentialCreationOptionsJSON }
  | { isError: true; message: string };

export type AuthenticationOptionsResult =
  | {
      isError: false;
      options: PublicKeyCredentialRequestOptionsJSON;
      email: string | null;
    }
  | { isError: true; message: string };

export type Cookies = {
  set: (
    key: string,
    value: string,
    options: {
      secure?: boolean;
      httpOnly?: boolean;
      sameSite?: "strict" | "lax";
      expires?: Date;
      path?: string;
    },
  ) => void;
  get: (key: string) => { name: string; value: string } | undefined;
  delete: (key: string) => void;
};

type ErrorResponse = {
  isError: true;
  message: string;
};
type SuccessResponse<T> = {
  isError: false;
} & T;
export type TypedResponse<T> = ErrorResponse | SuccessResponse<T>;

export type SendEmailVerificationEmail = (options: {
  to: string;
  name?: string | null;
  verificationUrl: string;
}) => Promise<void>;

export type SendPasswordResetCodeEmail = (options: {
  to: string;
  name?: string | null;
  code: string;
  expiresInMinutes: number;
}) => Promise<void>;
