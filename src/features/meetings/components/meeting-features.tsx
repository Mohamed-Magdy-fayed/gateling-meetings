"use client";

import { createContext, type ReactNode, useContext } from "react";

import {
  defaultMeetingFeatures,
  isPipAnnotateAvailable,
  type MeetingFeatures,
} from "@/features/meetings/lib/meeting-flags";

const MeetingFeaturesContext = createContext<MeetingFeatures>(
  defaultMeetingFeatures,
);

/**
 * The platform's meeting switches for this page load (read on the server,
 * see `getMeetingFeatures`). React context crosses portals, so the floating
 * window reads the same values.
 */
export function MeetingFeaturesProvider({
  features,
  children,
}: {
  features: MeetingFeatures;
  children: ReactNode;
}) {
  return (
    <MeetingFeaturesContext.Provider value={features}>
      {children}
    </MeetingFeaturesContext.Provider>
  );
}

export function useMeetingFeatures() {
  const features = useContext(MeetingFeaturesContext);
  return {
    ...features,
    pipAnnotateAvailable: isPipAnnotateAvailable(features),
  };
}
