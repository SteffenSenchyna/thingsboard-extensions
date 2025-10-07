import { Injectable } from "@angular/core";

@Injectable({ providedIn: "root" })
export class GeocodingService {
  async geocodeAddress(address: string): Promise<{ lat: number; lon: number } | null> {
    const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(address)}&limit=1&addressdetails=0`;
    const res = await fetch(url, { headers: { "Accept-Language": "en" } });
    if (!res.ok) return null;
    const data = await res.json();
    if (!Array.isArray(data) || !data.length) return null;
    const { lat, lon } = data[0];
    return { lat: Number(lat), lon: Number(lon) };
  }
}
