/**
 * Weather and Air Quality via Open-Meteo (no API key required).
 * Attribution: https://open-meteo.com/
 */

export const HYDERABAD_COORDS = { lat: 17.385, lon: 78.4867, name: 'Hyderabad' };

/** Coordinates by location name (Telangana). Fallback to Armoor if unknown. */
export const LOCATION_COORDS: Record<string, { lat: number; lon: number }> = {
  Hyderabad: { lat: 17.385, lon: 78.4867 },
  Armoor: { lat: 18.7833, lon: 78.2833 },
  Nirmal: { lat: 19.1, lon: 78.35 },
  Jagtial: { lat: 18.8, lon: 78.9 },
};

/** Cities available for "compare with" (default: Hyderabad). */
export const COMPARE_CITY_OPTIONS = ['Hyderabad', 'Armoor', 'Nirmal', 'Jagtial'] as const;

export function getCoordsForLocation(locationName: string): { lat: number; lon: number } {
  const key = locationName?.trim() || 'Armoor';
  return LOCATION_COORDS[key] ?? LOCATION_COORDS.Armoor;
}

export interface WeatherCurrent {
  temp: number;
  humidity: number;
  weatherCode: number;
}

export interface AirQualityCurrent {
  usAqi: number | null;
  pm10: number | null;
  pm25: number | null;
}

export interface EnvData {
  weather: WeatherCurrent | null;
  airQuality: AirQualityCurrent | null;
  label: string;
}

const REQUEST_TIMEOUT_MS = 12000;

async function fetchWithTimeout(url: string): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const res = await fetch(url, { signal: controller.signal });
    clearTimeout(timeout);
    return res;
  } catch (e) {
    clearTimeout(timeout);
    throw e;
  }
}

export async function fetchWeather(lat: number, lon: number): Promise<WeatherCurrent | null> {
  const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,relative_humidity_2m,weather_code`;
  const res = await fetchWithTimeout(url);
  if (!res.ok) return null;
  const json = await res.json();
  const c = json?.current;
  if (!c) return null;
  return {
    temp: Number(c.temperature_2m) ?? 0,
    humidity: Number(c.relative_humidity_2m) ?? 0,
    weatherCode: Number(c.weather_code) ?? 0,
  };
}

const AIR_QUALITY_BASE = 'https://air-quality-api.open-meteo.com/v1/air-quality';

export async function fetchAirQuality(lat: number, lon: number): Promise<AirQualityCurrent | null> {
  const url = `${AIR_QUALITY_BASE}?latitude=${lat}&longitude=${lon}&hourly=us_aqi,pm10,pm2_5`;
  const res = await fetchWithTimeout(url);
  if (!res.ok) return null;
  const json = await res.json();
  const h = json?.hourly;
  if (!h || !Array.isArray(h.time) || h.time.length === 0) return null;
  const usAqiArr = h.us_aqi;
  const pm10Arr = h.pm10;
  const pm25Arr = h.pm2_5;
  return {
    usAqi: Array.isArray(usAqiArr) && usAqiArr[0] != null ? Number(usAqiArr[0]) : null,
    pm10: Array.isArray(pm10Arr) && pm10Arr[0] != null ? Number(pm10Arr[0]) : null,
    pm25: Array.isArray(pm25Arr) && pm25Arr[0] != null ? Number(pm25Arr[0]) : null,
  };
}

export async function fetchEnvForCity(locationName: string): Promise<EnvData> {
  const { lat, lon } = getCoordsForLocation(locationName);
  const [weather, airQuality] = await Promise.all([
    fetchWeather(lat, lon),
    fetchAirQuality(lat, lon),
  ]);
  return {
    weather,
    airQuality,
    label: locationName?.trim() || 'Your city',
  };
}

export async function fetchEnvHyderabad(): Promise<EnvData> {
  const { lat, lon, name } = HYDERABAD_COORDS;
  const [weather, airQuality] = await Promise.all([
    fetchWeather(lat, lon),
    fetchAirQuality(lat, lon),
  ]);
  return { weather, airQuality, label: name };
}

/** WMO weather code to short description */
export function weatherCodeToLabel(code: number): string {
  const map: Record<number, string> = {
    0: 'Clear',
    1: 'Mainly clear',
    2: 'Partly cloudy',
    3: 'Overcast',
    45: 'Foggy',
    48: 'Foggy',
    51: 'Drizzle',
    53: 'Drizzle',
    55: 'Drizzle',
    61: 'Rain',
    63: 'Rain',
    65: 'Heavy rain',
    80: 'Showers',
    81: 'Showers',
    82: 'Showers',
    95: 'Thunderstorm',
    96: 'Thunderstorm',
    99: 'Thunderstorm',
  };
  return map[code] ?? 'Unknown';
}

/** US AQI category and color */
export function aqiCategory(aqi: number | null): { label: string; color: string } {
  if (aqi == null || aqi <= 0) return { label: '—', color: '#9ca3af' };
  if (aqi <= 50) return { label: 'Good', color: '#22c55e' };
  if (aqi <= 100) return { label: 'Moderate', color: '#eab308' };
  if (aqi <= 150) return { label: 'Unhealthy (sensitive)', color: '#f97316' };
  if (aqi <= 200) return { label: 'Unhealthy', color: '#ef4444' };
  if (aqi <= 300) return { label: 'Very unhealthy', color: '#a855f7' };
  return { label: 'Hazardous', color: '#7f1d1d' };
}
