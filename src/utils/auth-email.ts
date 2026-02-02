/**
 * Build the synthetic Auth email for a username.
 * Supabase rejects non-ASCII in email, so we transliterate (e.g. ståle -> stale).
 * Use this everywhere we build the Auth email so login and migrate match.
 */

const EMAIL_DOMAIN = 'prosjektstyring.example.com';

const TRANSLIT: Record<string, string> = {
  å: 'a',
  æ: 'ae',
  ø: 'o',
  ä: 'a',
  ö: 'o',
  ü: 'u',
  é: 'e',
  è: 'e',
  ê: 'e',
  ë: 'e',
  ñ: 'n',
  ß: 'ss',
};

export function usernameToAuthEmail(username: string): string {
  const normalized = username.toLowerCase().trim();
  let local = '';
  for (const char of normalized) {
    local += TRANSLIT[char] ?? char;
  }
  local = local.replace(/[^a-z0-9._-]/g, '');
  return local ? `${local}@${EMAIL_DOMAIN}` : `user@${EMAIL_DOMAIN}`;
}
