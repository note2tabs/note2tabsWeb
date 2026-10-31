// Temporary restriction shared by the UI and the authenticated submission API.
export const canDownloadYouTube = (plan: unknown) => plan === "PREMIUM" || plan === "PRO";
export const YOUTUBE_UNAVAILABLE_MESSAGE = "YouTube downloads are currently only available for premius/pro users, we are working on restoring functionality for all users.";
