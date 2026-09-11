"use client";

import { createContext, type ReactNode, useContext } from "react";

const HostIdentityContext = createContext<string | null>(null);

/**
 * The host's LiveKit identity as the *server* reported it (`getByCode`).
 * UI decisions like the "Host" badge key off this, never off participant
 * attributes — attributes are writable by the participant who owns them.
 */
export function HostIdentityProvider({
  value,
  children,
}: {
  value: string;
  children: ReactNode;
}) {
  return (
    <HostIdentityContext.Provider value={value}>
      {children}
    </HostIdentityContext.Provider>
  );
}

export function useHostIdentity(): string | null {
  return useContext(HostIdentityContext);
}
