import awsLogo from "../assets/providers/aws.png";

/**
 * Bundled provider logo assets, keyed by the exact `provider.name` returned by the
 * catalog API (e.g. `"AWS"`). This is intentionally a flat, hand-maintained map: to add a
 * new provider logo, drop the image into `src/assets/providers/`, import it above, and add
 * one entry below. `provider.logoUrl` (a DTO field, currently always `null`) is a separate,
 * unrelated concern reserved for a future remote-URL-driven logo.
 */
const PROVIDER_LOGOS: Record<string, string> = {
  AWS: awsLogo,
};

export function providerLogoSrc(providerName: string): string | undefined {
  return PROVIDER_LOGOS[providerName];
}
