/** Notfall-Finder: nächste geöffnete Klinik im Umkreis. */
export interface Location { readonly lat: number; readonly lng: number }
export interface Clinic { readonly id: string; readonly name: string; readonly location: Location; readonly open24h: boolean; readonly opensAt?: number; readonly closesAt?: number }

export function distanceKm(a: Location, b: Location): number {
  const R = 6371;
  const rad = (x: number): number => (x * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

function isValid(l: Location | null | undefined): l is Location {
  return !!l && Number.isFinite(l.lat) && Number.isFinite(l.lng) && Math.abs(l.lat) <= 90 && Math.abs(l.lng) <= 180;
}

export function isOpen(c: Clinic, hour: number): boolean {
  if (c.open24h) return true;
  if (c.opensAt === undefined || c.closesAt === undefined) return false;
  return c.opensAt <= c.closesAt ? hour >= c.opensAt && hour < c.closesAt : hour >= c.opensAt || hour < c.closesAt;
}

export type FinderResult =
  | { readonly kind: 'ok'; readonly clinics: readonly Clinic[] }
  | { readonly kind: 'no-location' }
  | { readonly kind: 'none-open' };

export function findOpenClinics(pos: Location | null | undefined, clinics: readonly Clinic[], hour: number, radiusKm: number): FinderResult {
  if (!isValid(pos)) return { kind: 'no-location' };
  const open = clinics
    .filter((c) => isValid(c.location) && isOpen(c, hour) && distanceKm(pos, c.location) <= radiusKm)
    .sort((a, b) => distanceKm(pos, a.location) - distanceKm(pos, b.location));
  return open.length ? { kind: 'ok', clinics: open } : { kind: 'none-open' };
}
