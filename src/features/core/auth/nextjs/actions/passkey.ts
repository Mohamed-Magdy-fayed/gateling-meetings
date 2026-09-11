"use server";

import type {
  AuthenticationResponseJSON,
  AuthenticatorTransportFuture,
  RegistrationResponseJSON,
  Uint8Array_,
  WebAuthnCredential,
} from "@simplewebauthn/server";
import {
  generateAuthenticationOptions,
  generateRegistrationOptions,
  verifyAuthenticationResponse,
  verifyRegistrationResponse,
} from "@simplewebauthn/server";
import { and, desc, eq, sql } from "drizzle-orm";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";

import { baseUrl } from "@/data/env/server";
import { db } from "@/drizzle";
import {
  BiometricCredentialsTable,
  UsersTable,
  UserTokensTable,
} from "@/drizzle/schema";
import { createUserSession } from "@/features/core/auth/core";
import { authError } from "@/features/core/auth/core/helpers";
import { hashTokenValue } from "@/features/core/auth/core/token";
import { validateInput } from "@/features/core/auth/nextjs/actions/helpers";
import { getCurrentUser } from "@/features/core/auth/nextjs/currentUser";
import { getPostAuthRedirect } from "@/features/core/auth/nextjs/lib/post-auth-redirect";
import type {
  AuthenticationOptionsResult,
  PartialUser,
  PasskeyListItem,
  RegistrationOptionsResult,
  TypedResponse,
} from "@/features/core/auth/types";
import { getT } from "@/features/core/i18n/server";
import {
  buildRatelimitKey,
  getRequestIp,
  isRateLimited,
  passkeyAuthRatelimit,
} from "@/integrations/ratelimit";

const PASSKEY_CHALLENGE_TTL_MS = 1000 * 60 * 10;

const deletePasskeySchema = z.object({ passkeyId: z.uuid() });

// `z.custom()` alone accepts any value at runtime — these predicates check
// the top-level shape the WebAuthn spec guarantees before the response ever
// reaches `.id`/`verify*Response()`, without hand-rolling the full spec.
function isWebAuthnResponseShape(
  value: unknown,
): value is { id: string; rawId: string; type: string; response: object } {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as Record<string, unknown>).id === "string" &&
    typeof (value as Record<string, unknown>).rawId === "string" &&
    typeof (value as Record<string, unknown>).type === "string" &&
    typeof (value as Record<string, unknown>).response === "object" &&
    (value as Record<string, unknown>).response !== null
  );
}
const authResponseSchema = z.custom<AuthenticationResponseJSON>(
  isWebAuthnResponseShape,
);
const registrationResponseSchema = z.custom<RegistrationResponseJSON>(
  isWebAuthnResponseShape,
);

const textEncoder = new TextEncoder();

function normalizeBase64(base64Url: string) {
  const padding = "=".repeat((4 - (base64Url.length % 4)) % 4);
  return (base64Url + padding).replace(/-/g, "+").replace(/_/g, "/");
}

function base64UrlToBuffer(value: string): Uint8Array {
  const cleaned = normalizeBase64(value);
  const buffer = Buffer.from(cleaned, "base64");
  return new Uint8Array(buffer.buffer, buffer.byteOffset, buffer.byteLength);
}

function bufferToBase64Url(value: Uint8Array): string {
  const base64 = Buffer.from(value).toString("base64");
  return base64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/u, "");
}

function getRpId() {
  try {
    return new URL(baseUrl).hostname;
  } catch (error) {
    console.error("Unable to derive RP ID", error);
    return null;
  }
}

async function upsertChallengeToken(options: {
  userId: string;
  challenge: string;
  operation: "passkey-registration" | "passkey-authentication";
}) {
  const challengeHash = hashTokenValue(options.challenge);
  const expiresAt = new Date(Date.now() + PASSKEY_CHALLENGE_TTL_MS);

  // Scoped to the same operation only — a user with a registration
  // challenge open in one tab and an authentication challenge open in
  // another (or vice versa) shouldn't have one invalidate the other.
  await db
    .delete(UserTokensTable)
    .where(
      and(
        eq(UserTokensTable.userId, options.userId),
        eq(UserTokensTable.type, "device_trust"),
        sql`${UserTokensTable.metadata}->>'operation' = ${options.operation}`,
      ),
    );

  await db.insert(UserTokensTable).values({
    userId: options.userId,
    tokenHash: challengeHash,
    type: "device_trust",
    expiresAt,
    metadata: { operation: options.operation, challenge: options.challenge },
  });
}

async function consumeChallengeToken(options: {
  userId: string;
  operation: "passkey-registration" | "passkey-authentication";
}) {
  const record = await db.query.UserTokensTable.findFirst({
    columns: {
      id: true,
      metadata: true,
      expiresAt: true,
      consumedAt: true,
      tokenHash: true,
    },
    where: and(
      eq(UserTokensTable.userId, options.userId),
      eq(UserTokensTable.type, "device_trust"),
    ),
    orderBy: [desc(UserTokensTable.createdAt)],
  });

  if (!record) return null;

  const metadata = (record.metadata ?? {}) as Record<string, unknown>;
  if (metadata.operation !== options.operation) return null;

  const challenge =
    typeof metadata.challenge === "string" ? metadata.challenge : null;
  if (!challenge) {
    await db.delete(UserTokensTable).where(eq(UserTokensTable.id, record.id));
    return null;
  }

  if (record.consumedAt != null || record.expiresAt.getTime() <= Date.now()) {
    await db.delete(UserTokensTable).where(eq(UserTokensTable.id, record.id));
    return null;
  }

  if (hashTokenValue(challenge) !== record.tokenHash) {
    await db.delete(UserTokensTable).where(eq(UserTokensTable.id, record.id));
    return null;
  }

  return { id: record.id, challenge };
}

async function revokeChallengeToken(tokenId: string) {
  await db.delete(UserTokensTable).where(eq(UserTokensTable.id, tokenId));
}

export async function beginPasskeyAuthenticationAction(
  rawEmail: string,
): Promise<AuthenticationOptionsResult> {
  const { t } = await getT();

  let email: string;
  try {
    email = await validateInput(z.email(), rawEmail);
  } catch (error) {
    return authError(error);
  }

  const ip = await getRequestIp();
  if (await isRateLimited(passkeyAuthRatelimit, buildRatelimitKey(ip, email))) {
    return { isError: true, message: t("auth.error.rateLimited") };
  }

  const user = await db.query.UsersTable.findFirst({
    columns: { id: true, email: true },
    where: eq(UsersTable.email, email),
    with: {
      biometricCredentials: {
        columns: { credentialId: true, transports: true },
      },
    },
  });

  // Same generic message for "no account" and "no passkeys on this
  // account" — distinguishing them lets an attacker enumerate registered
  // emails by probing this action.
  if (!user || user.biometricCredentials.length === 0) {
    return {
      isError: true,
      message: t("auth.passkeys.auth.error.userNotFound"),
    };
  }

  const rpId = getRpId();
  if (!rpId) {
    return { isError: true, message: t("auth.passkeys.error.missingRpId") };
  }

  const options = await generateAuthenticationOptions({
    rpID: rpId,
    allowCredentials: user.biometricCredentials.map((credential) => ({
      id: credential.credentialId,
      type: "public-key",
      transports: Array.isArray(credential.transports)
        ? (credential.transports as AuthenticatorTransportFuture[])
        : undefined,
    })),
    // "required" here matches `requireUserVerification: true` at the
    // verify step below — generating with "preferred" would let a
    // ceremony complete without UV and then fail verification anyway.
    userVerification: "required",
  });

  await upsertChallengeToken({
    userId: user.id,
    challenge: options.challenge,
    operation: "passkey-authentication",
  });

  return { isError: false, options, email: user.email };
}

export async function beginPasskeyRegistrationAction(): Promise<RegistrationOptionsResult> {
  const { t } = await getT();
  const { id: userId } = await getCurrentUser({ redirectIfNotFound: true });

  const user = await db.query.UsersTable.findFirst({
    columns: { id: true, email: true, name: true },
    where: eq(UsersTable.id, userId),
  });
  if (!user) {
    return {
      isError: true,
      message: t("auth.passkeys.auth.error.userNotFound"),
    };
  }

  const rpId = getRpId();
  if (!rpId) {
    return { isError: true, message: t("auth.passkeys.error.missingRpId") };
  }

  const existing = await db.query.BiometricCredentialsTable.findMany({
    columns: { credentialId: true, transports: true },
    where: eq(BiometricCredentialsTable.userId, user.id),
  });

  const encodedUserId = textEncoder.encode(user.id);
  const userIdBytes = new Uint8Array(
    encodedUserId.buffer,
    encodedUserId.byteOffset,
    encodedUserId.byteLength,
  ) as Uint8Array<ArrayBuffer>;

  const options = await generateRegistrationOptions({
    rpName: t("appName"),
    rpID: rpId,
    userID: userIdBytes,
    userName: user.email ?? user.name ?? user.id,
    userDisplayName: user.name ?? user.email ?? user.id,
    attestationType: "none",
    authenticatorSelection: {
      residentKey: "preferred",
      userVerification: "required",
    },
    excludeCredentials: existing.map((credential) => ({
      id: credential.credentialId,
      type: "public-key",
      transports: Array.isArray(credential.transports)
        ? (credential.transports as AuthenticatorTransportFuture[])
        : undefined,
    })),
  });

  await upsertChallengeToken({
    userId: user.id,
    challenge: options.challenge,
    operation: "passkey-registration",
  });

  return { isError: false, options };
}

export async function completePasskeyAuthenticationAction(
  rawEmail: string,
  rawAssertion: z.infer<typeof authResponseSchema>,
  returnTo?: string,
): Promise<TypedResponse<PartialUser>> {
  const { t } = await getT();

  let email: string;
  let assertion: z.infer<typeof authResponseSchema>;
  try {
    email = await validateInput(z.email(), rawEmail);
    assertion = await validateInput(authResponseSchema, rawAssertion);
  } catch (error) {
    return authError(error);
  }

  const ip = await getRequestIp();
  if (await isRateLimited(passkeyAuthRatelimit, buildRatelimitKey(ip, email))) {
    return { isError: true, message: t("auth.error.rateLimited") };
  }

  const user = await db.query.UsersTable.findFirst({
    columns: { id: true, email: true, name: true, emailVerifiedAt: true },
    where: eq(UsersTable.email, email),
    with: {
      biometricCredentials: {
        columns: {
          id: true,
          credentialId: true,
          publicKey: true,
          signCount: true,
          transports: true,
          isBackupEligible: true,
          isBackupState: true,
        },
      },
    },
  });

  if (!user) {
    return {
      isError: true,
      message: t("auth.passkeys.auth.error.userNotFound"),
    };
  }

  const challenge = await consumeChallengeToken({
    userId: user.id,
    operation: "passkey-authentication",
  });
  if (!challenge) {
    return {
      isError: true,
      message: t("auth.passkeys.auth.error.invalidChallenge"),
    };
  }

  const rpId = getRpId();
  if (!rpId) {
    await revokeChallengeToken(challenge.id);
    return { isError: true, message: t("auth.passkeys.error.missingRpId") };
  }

  const credential = user.biometricCredentials.find(
    (item) => item.credentialId === assertion.id,
  );
  if (!credential) {
    await revokeChallengeToken(challenge.id);
    return {
      isError: true,
      message: t("auth.passkeys.auth.error.credentialMismatch"),
    };
  }

  const storedCredential: WebAuthnCredential = {
    id: credential.credentialId,
    publicKey: base64UrlToBuffer(credential.publicKey) as Uint8Array_,
    counter: credential.signCount ?? 0,
    transports: Array.isArray(credential.transports)
      ? (credential.transports as AuthenticatorTransportFuture[])
      : undefined,
  };

  const verification = await verifyAuthenticationResponse({
    response: assertion,
    expectedChallenge: challenge.challenge,
    expectedOrigin: new URL(baseUrl).origin,
    expectedRPID: rpId,
    credential: storedCredential,
    requireUserVerification: true,
  });

  if (!verification.verified || !verification.authenticationInfo) {
    await revokeChallengeToken(challenge.id);
    return { isError: true, message: t("auth.passkeys.auth.error.generic") };
  }

  const { newCounter, credentialDeviceType, credentialBackedUp, userVerified } =
    verification.authenticationInfo;

  await db
    .update(BiometricCredentialsTable)
    .set({
      signCount: newCounter,
      lastUsedAt: new Date(),
      isBackupEligible: credentialDeviceType === "multiDevice",
      isBackupState: credentialBackedUp,
      isUserVerified: userVerified ?? true,
    })
    .where(eq(BiometricCredentialsTable.id, credential.id));

  await revokeChallengeToken(challenge.id);

  await db
    .update(UsersTable)
    .set({ lastSignInAt: new Date() })
    .where(eq(UsersTable.id, user.id));

  await createUserSession({ user }, await cookies());
  redirect(getPostAuthRedirect(user, returnTo));
}

export async function completePasskeyRegistrationAction(
  rawAttestation: z.infer<typeof registrationResponseSchema>,
): Promise<TypedResponse<{ userId: string }>> {
  const { t } = await getT();
  const { id: userId } = await getCurrentUser({ redirectIfNotFound: true });

  let attestation: z.infer<typeof registrationResponseSchema>;
  try {
    attestation = await validateInput(
      registrationResponseSchema,
      rawAttestation,
    );
  } catch (error) {
    return authError(error);
  }

  const challenge = await consumeChallengeToken({
    userId,
    operation: "passkey-registration",
  });
  if (!challenge) {
    return {
      isError: true,
      message: t("auth.passkeys.register.invalidChallenge"),
    };
  }

  const rpId = getRpId();
  if (!rpId) {
    await revokeChallengeToken(challenge.id);
    return { isError: true, message: t("auth.passkeys.error.missingRpId") };
  }

  const verification = await verifyRegistrationResponse({
    response: attestation,
    expectedChallenge: challenge.challenge,
    expectedOrigin: new URL(baseUrl).origin,
    expectedRPID: rpId,
    requireUserVerification: true,
  });

  if (!verification.verified || !verification.registrationInfo) {
    await revokeChallengeToken(challenge.id);
    return { isError: true, message: t("auth.passkeys.register.error") };
  }

  const { credential, credentialDeviceType, credentialBackedUp, userVerified } =
    verification.registrationInfo;

  const transports = Array.isArray(credential.transports)
    ? credential.transports
    : Array.isArray(attestation.response.transports)
      ? attestation.response.transports
      : null;

  // The same physical authenticator can only ever belong to one account —
  // if `credential.id` already belongs to someone else, reject instead of
  // silently unlinking their passkey and handing it to this session.
  const conflicting = await db.query.BiometricCredentialsTable.findFirst({
    columns: { id: true, userId: true },
    where: eq(BiometricCredentialsTable.credentialId, credential.id),
  });
  if (conflicting && conflicting.userId !== userId) {
    await revokeChallengeToken(challenge.id);
    return { isError: true, message: t("auth.passkeys.register.error") };
  }
  if (conflicting) {
    await db
      .delete(BiometricCredentialsTable)
      .where(eq(BiometricCredentialsTable.id, conflicting.id));
  }

  await db.insert(BiometricCredentialsTable).values({
    userId,
    credentialId: credential.id,
    publicKey: bufferToBase64Url(credential.publicKey),
    signCount: credential.counter,
    label: null,
    transports,
    isBackupEligible: credentialDeviceType === "multiDevice",
    isBackupState: credentialBackedUp,
    isUserVerified: userVerified,
  });

  await revokeChallengeToken(challenge.id);

  return { isError: false, userId };
}

export async function listPasskeysAction(): Promise<
  TypedResponse<{ data: PasskeyListItem[] }>
> {
  const { id: userId } = await getCurrentUser({ redirectIfNotFound: true });

  const credentials = await db.query.BiometricCredentialsTable.findMany({
    columns: {
      id: true,
      label: true,
      createdAt: true,
      lastUsedAt: true,
      isBackupEligible: true,
      isBackupState: true,
      transports: true,
    },
    where: eq(BiometricCredentialsTable.userId, userId),
    orderBy: (table, { desc: descOrder }) => descOrder(table.createdAt),
  });

  return {
    isError: false,
    data: credentials.map((cred) => ({
      id: cred.id,
      label: cred.label,
      createdAt: cred.createdAt.toISOString(),
      lastUsedAt: cred.lastUsedAt?.toISOString() ?? null,
      isBackupEligible: cred.isBackupEligible,
      isBackupState: cred.isBackupState,
      transports: Array.isArray(cred.transports)
        ? (cred.transports as string[])
        : [],
    })),
  };
}

export async function deletePasskeyAction(
  rawInput: z.infer<typeof deletePasskeySchema>,
): Promise<TypedResponse<{ message: string }>> {
  const { t } = await getT();
  const { id: userId } = await getCurrentUser({ redirectIfNotFound: true });

  const parsed = deletePasskeySchema.safeParse(rawInput);
  if (!parsed.success) {
    return { isError: true, message: t("auth.error.badRequest") };
  }

  const { passkeyId } = parsed.data;

  const credential = await db.query.BiometricCredentialsTable.findFirst({
    columns: { id: true, userId: true },
    where: eq(BiometricCredentialsTable.id, passkeyId),
  });

  if (!credential || credential.userId !== userId) {
    return { isError: true, message: t("auth.passkeys.delete.notFound") };
  }

  await db
    .delete(BiometricCredentialsTable)
    .where(eq(BiometricCredentialsTable.id, credential.id));

  return { isError: false, message: t("auth.passkeys.delete.success") };
}
