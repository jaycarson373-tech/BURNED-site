export function validatePublicSupabaseKey(key) {
  if (/^sb_publishable_[A-Za-z0-9_-]{18,}$/.test(key)) return;
  try {
    const parts = key.split('.');
    if (parts.length !== 3 || !/^[A-Za-z0-9_.-]+$/.test(key)) throw new Error();
    const header = JSON.parse(Buffer.from(parts[0], 'base64url').toString('utf8'));
    const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'));
    if (header.alg !== 'HS256' || payload.role !== 'anon') throw new Error();
  } catch {
    throw new Error('Only a Supabase publishable or anon key may be included in the public site');
  }
}
