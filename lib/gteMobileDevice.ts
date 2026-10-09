export type MobileDeviceNavigator = {
  userAgent?: string;
  maxTouchPoints?: number;
  userAgentData?: {
    mobile?: boolean;
  };
};

const MOBILE_DEVICE_USER_AGENT =
  /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini|Windows Phone/i;

/**
 * Selects the mobile editor from device identity, never viewport dimensions.
 * The Macintosh + multi-touch fallback covers iPads that request desktop sites.
 */
export function isMobileGteDevice(device: MobileDeviceNavigator): boolean {
  if (typeof device.userAgentData?.mobile === "boolean") {
    return device.userAgentData.mobile;
  }

  const userAgent = device.userAgent || "";
  if (MOBILE_DEVICE_USER_AGENT.test(userAgent)) return true;

  return /Macintosh/i.test(userAgent) && (device.maxTouchPoints || 0) > 1;
}
