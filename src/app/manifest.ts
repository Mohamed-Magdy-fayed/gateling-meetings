import type { MetadataRoute } from "next";

/** Installable on a phone home screen; the room is used from phones as often as not. */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Gateling Meetings",
    short_name: "Meetings",
    description: "Video meetings you host yourself.",
    start_url: "/",
    display: "standalone",
    background_color: "#fffaf6",
    theme_color: "#fd5f02",
    icons: [{ src: "/favicon.ico", sizes: "any", type: "image/x-icon" }],
  };
}
