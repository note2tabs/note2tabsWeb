import versions from "./gteSampleVersions.json";

/** Stable across deployments; changes only when that sample's bytes change. */
export function versionedSampleUrl(path: string) {
  const file = decodeURIComponent(path.replace(/^\/sound_samples\//,""));
  const version = (versions as Record<string,string>)[file];
  return version ? `${path}?v=${version}` : path;
}
