import {
  createAudioAnalyser,
  type LocalAudioTrack,
  TrackEvent,
} from "livekit-client";

import {
  createExternalStore,
  type ExternalStore,
  shallowEqual,
} from "./external-store";

export type TrackHealthStatus =
  | "unknown"
  /** Sound is coming through. */
  | "live"
  /** The track is open and unmuted but has produced only digital silence. */
  | "silent"
  /** Muted below the browser: OS privacy setting, headset button, unplugged. */
  | "hardwareMuted"
  /** The browser or OS took the device away. */
  | "ended";

export type TrackHealth = {
  status: TrackHealthStatus;
  /** Muted in the app (the mic button) — distinct from `hardwareMuted`. */
  isAppMuted: boolean;
  /**
   * 0..1 for the meter, on a square-root curve (speech averaged over the
   * whole spectrum reads low; the ear doesn't), quantised so the snapshot
   * only changes when the bars would.
   */
  level: number;
  /** App-muted, yet the device is clearly picking up speech. */
  isSpeakingWhileMuted: boolean;
};

export const UNKNOWN_TRACK_HEALTH: TrackHealth = {
  status: "unknown",
  isAppMuted: false,
  level: 0,
  isSpeakingWhileMuted: false,
};

/** Digital silence is exactly 0; a live mic in a quiet room sits well above. */
const SILENCE_LEVEL = 0.005;
/** Sustained talking, as opposed to a keyboard tap or a chair creak. */
const SPEECH_LEVEL = 0.15;
/** How long a fresh track may stay flat before we call it silent. */
const SILENCE_AFTER_MS = 4000;
const SPEAKING_WHILE_MUTED_AFTER_MS = 1500;
const POLL_MS = 100;
const LEVEL_STEPS = 20;

type Clock = () => number;

/**
 * Pure state machine behind the store: fed a volume sample (or a track
 * event) and the time, returns the next snapshot. Separated from the
 * browser wiring so it can be unit-tested with a fake clock.
 */
export type HealthInput = {
  volume: number;
  isHardwareMuted: boolean;
  isAppMuted: boolean;
  isEnded: boolean;
};

export type HealthMemory = {
  quietSince: number | null;
  loudSince: number | null;
};

export const INITIAL_MEMORY: HealthMemory = {
  quietSince: null,
  loudSince: null,
};

export function nextHealth(
  input: HealthInput,
  memory: HealthMemory,
  now: number,
): { health: TrackHealth; memory: HealthMemory } {
  const level =
    Math.round(Math.sqrt(Math.min(1, input.volume)) * LEVEL_STEPS) /
    LEVEL_STEPS;

  if (input.isEnded) {
    return {
      health: {
        status: "ended",
        isAppMuted: input.isAppMuted,
        level: 0,
        isSpeakingWhileMuted: false,
      },
      memory: INITIAL_MEMORY,
    };
  }
  if (input.isHardwareMuted) {
    return {
      health: {
        status: "hardwareMuted",
        isAppMuted: input.isAppMuted,
        level: 0,
        isSpeakingWhileMuted: false,
      },
      memory: INITIAL_MEMORY,
    };
  }

  const isQuiet = input.volume < SILENCE_LEVEL;
  const quietSince = isQuiet ? (memory.quietSince ?? now) : null;
  const isLoud = input.volume >= SPEECH_LEVEL;
  const loudSince = isLoud ? (memory.loudSince ?? now) : null;

  const status: TrackHealthStatus =
    quietSince != null
      ? now - quietSince >= SILENCE_AFTER_MS
        ? "silent"
        : "unknown"
      : "live";

  return {
    health: {
      status,
      isAppMuted: input.isAppMuted,
      level,
      isSpeakingWhileMuted:
        input.isAppMuted &&
        loudSince != null &&
        now - loudSince >= SPEAKING_WHILE_MUTED_AFTER_MS,
    },
    memory: { quietSince, loudSince },
  };
}

function start(track: LocalAudioTrack, clock: Clock) {
  return (set: ExternalStore<TrackHealth>["set"]) => {
    let memory = INITIAL_MEMORY;
    let analyser: ReturnType<typeof createAudioAnalyser> | undefined;
    let isEnded = false;

    // The analyser reads a *clone* of the capture so an app-mute (which
    // disables the original) doesn't blind it — that is what lets us say
    // "you're muted but talking". A device switch swaps the underlying
    // MediaStreamTrack, so the clone is rebuilt on `Restarted`.
    const attach = () => {
      void analyser?.cleanup();
      analyser = undefined;
      try {
        analyser = createAudioAnalyser(track, {
          cloneTrack: true,
          minDecibels: -90,
          maxDecibels: -10,
          smoothingTimeConstant: 0.6,
        });
      } catch {
        // No AudioContext (very old browser): mute/ended still work, no meter.
      }
    };

    const sample = () => {
      const streamTrack = track.mediaStreamTrack;
      const next = nextHealth(
        {
          volume: analyser?.calculateVolume() ?? 0,
          isHardwareMuted: streamTrack?.muted ?? false,
          isAppMuted: track.isMuted,
          isEnded: isEnded || streamTrack?.readyState === "ended",
        },
        memory,
        clock(),
      );
      memory = next.memory;
      set(next.health);
    };

    const onRestarted = () => {
      isEnded = false;
      memory = INITIAL_MEMORY;
      attach();
      sample();
    };
    const onEnded = () => {
      isEnded = true;
      sample();
    };

    attach();
    sample();
    const timer = setInterval(sample, POLL_MS);
    track.on(TrackEvent.Restarted, onRestarted);
    track.on(TrackEvent.Ended, onEnded);
    track.on(TrackEvent.Muted, sample);
    track.on(TrackEvent.Unmuted, sample);

    return () => {
      clearInterval(timer);
      track.off(TrackEvent.Restarted, onRestarted);
      track.off(TrackEvent.Ended, onEnded);
      track.off(TrackEvent.Muted, sample);
      track.off(TrackEvent.Unmuted, sample);
      void analyser?.cleanup();
    };
  };
}

const stores = new WeakMap<LocalAudioTrack, ExternalStore<TrackHealth>>();

/**
 * Is this microphone track actually carrying sound? One store per track:
 * the lobby meter, the status line and the "can't hear you" banner all read
 * the same snapshot from the same analyser.
 */
export function trackHealthStore(
  track: LocalAudioTrack,
  clock: Clock = Date.now,
): ExternalStore<TrackHealth> {
  let store = stores.get(track);
  if (!store) {
    store = createExternalStore<TrackHealth>({
      initial: UNKNOWN_TRACK_HEALTH,
      start: start(track, clock),
      isEqual: shallowEqual,
    });
    stores.set(track, store);
  }
  return store;
}
