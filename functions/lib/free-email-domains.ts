/**
 * Free/disposable email domain blocklist.
 * Source: https://github.com/kikobeats/free-email-domains (MIT) — domains.json @ v1.0.36
 */
import domains from "./data/free-email-domains.json";

const FREE_DOMAIN_SET = new Set((domains as string[]).map((d) => d.toLowerCase()));

export function emailDomain(email: string): string | null {
  const at = email.lastIndexOf("@");
  if (at < 1 || at === email.length - 1) return null;
  return email.slice(at + 1).toLowerCase().trim();
}

export function isBlockedEmailDomain(domain: string): boolean {
  return FREE_DOMAIN_SET.has(domain.toLowerCase().trim());
}
