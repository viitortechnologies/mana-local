/**
 * News dashboard APIs: Weather (Open-Meteo), Cricket, Fuel, Gold, plus DB for Events & Emergency.
 * Uses caching per requirements. Free tiers / mock data; recommend paid APIs for production.
 */

import { getCoordsForLocation } from '@/src/lib/envApi';
import { getCache, setCache, CACHE_TTL } from '@/src/lib/cache';

const REQUEST_TIMEOUT_MS = 15000;

async function fetchWithTimeout(url: string): Promise<Response> {
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const res = await fetch(url, { signal: controller.signal });
    clearTimeout(t);
    return res;
  } catch (e) {
    clearTimeout(t);
    throw e;
  }
}

// ---------- Weather (Open-Meteo, cache 30 min) ----------
export interface WeatherDay {
  date: string;
  tempMax: number;
  tempMin: number;
  weatherCode: number;
  precipitationSum: number;
  precipitationProbabilityMax: number;
}

export interface WeatherFull {
  temp: number;
  humidity: number;
  weatherCode: number;
  rainChanceToday: number;
  heatAlert: boolean;
  summary: string;
  daily: WeatherDay[];
  label: string;
}

export async function fetchWeatherFull(locationName: string): Promise<WeatherFull | null> {
  const cacheKey = `weather_full_${locationName}`;
  const cached = getCache<WeatherFull>(cacheKey);
  if (cached) return cached;

  const { lat, lon } = getCoordsForLocation(locationName);
  const url = [
    'https://api.open-meteo.com/v1/forecast',
    `?latitude=${lat}&longitude=${lon}`,
    '&current=temperature_2m,relative_humidity_2m,weather_code',
    '&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_sum,precipitation_probability_max',
    '&forecast_days=7',
    '&timezone=auto',
  ].join('');
  try {
    const res = await fetchWithTimeout(url);
    if (!res.ok) return null;
    const json = await res.json();
    const cur = json?.current;
    const daily = json?.daily;
    if (!cur || !daily?.time?.length) return null;

    const rainChanceToday = Number(daily.precipitation_probability_max?.[0]) ?? 0;
    const temp = Number(cur.temperature_2m) ?? 0;
    const heatAlert = temp >= 40;

    const result: WeatherFull = {
      temp,
      humidity: Number(cur.relative_humidity_2m) ?? 0,
      weatherCode: Number(cur.weather_code) ?? 0,
      rainChanceToday,
      heatAlert,
      summary: heatAlert
        ? 'Heat alert. Stay hydrated and avoid prolonged exposure.'
        : rainChanceToday > 60
          ? 'High chance of rain today. Carry an umbrella.'
          : 'No major alerts.',
      daily: (daily.time as string[]).slice(0, 7).map((date: string, i: number) => ({
        date,
        tempMax: Number(daily.temperature_2m_max?.[i]) ?? 0,
        tempMin: Number(daily.temperature_2m_min?.[i]) ?? 0,
        weatherCode: Number(daily.weather_code?.[i]) ?? 0,
        precipitationSum: Number(daily.precipitation_sum?.[i]) ?? 0,
        precipitationProbabilityMax: Number(daily.precipitation_probability_max?.[i]) ?? 0,
      })),
      label: locationName?.trim() || 'Your location',
    };
    setCache(cacheKey, result, CACHE_TTL.WEATHER_MS);
    return result;
  } catch {
    return null;
  }
}

// ---------- Cricket (mock + structure for CricAPI / RapidAPI) ----------
export interface CricketMatch {
  id: string;
  team1: string;
  team2: string;
  matchType: string;
  status: 'live' | 'upcoming' | 'result';
  score?: string;
  result?: string;
  date: string;
  venue?: string;
  isIndia: boolean;
}

export async function fetchCricketData(): Promise<{
  live: CricketMatch[];
  upcoming: CricketMatch[];
  results: CricketMatch[];
}> {
  // Free tier: CricAPI (cricapi.com) 100 req/day; or RapidAPI "Cricket Live Scores"
  // For now return mock data. Replace with: GET https://api.cricapi.com/v1/currentMatches?apikey=KEY
  const mockLive: CricketMatch[] = [];
  const mockUpcoming: CricketMatch[] = [
    { id: '1', team1: 'India', team2: 'Australia', matchType: 'T20', status: 'upcoming', date: new Date(Date.now() + 86400000 * 2).toISOString().slice(0, 10), isIndia: true },
    { id: '2', team1: 'India', team2: 'England', matchType: 'ODI', status: 'upcoming', date: new Date(Date.now() + 86400000 * 5).toISOString().slice(0, 10), isIndia: true },
  ];
  const mockResults: CricketMatch[] = [
    { id: '3', team1: 'India', team2: 'South Africa', matchType: 'Test', status: 'result', result: 'India won by 7 wickets', date: new Date(Date.now() - 86400000 * 3).toISOString().slice(0, 10), isIndia: true },
  ];
  return { live: mockLive, upcoming: mockUpcoming, results: mockResults };
}

// ---------- Fuel (mock; use RapidAPI "Fuel Price India" or similar for real data) ----------
export interface FuelPrices {
  city: string;
  petrol: number;
  diesel: number;
  petrolChange: number;
  dieselChange: number;
  updatedAt: string;
}

export async function fetchFuelPrices(cityName: string): Promise<FuelPrices | null> {
  const cacheKey = `fuel_${cityName}`;
  const cached = getCache<FuelPrices>(cacheKey);
  if (cached) return cached;

  // Mock. Production: RapidAPI "fuel-price-api-india" or dailyfuelprice.com API
  const mock: FuelPrices = {
    city: cityName || 'Your city',
    petrol: 106.31,
    diesel: 94.27,
    petrolChange: 0.15,
    dieselChange: -0.08,
    updatedAt: new Date().toISOString(),
  };
  setCache(cacheKey, mock, CACHE_TTL.FUEL_MS);
  return mock;
}

// ---------- Gold & Silver (mock; use goldpricez.com or metals-api.com for real) ----------
export interface GoldSilverRates {
  gold22K: number;
  gold24K: number;
  silver: number;
  unit: string;
  updatedAt: string;
}

export async function fetchGoldSilverRates(): Promise<GoldSilverRates | null> {
  const cacheKey = 'gold_silver_rates';
  const cached = getCache<GoldSilverRates>(cacheKey);
  if (cached) return cached;

  // Mock per-gram rates. Production: GoldPricez / Metals-API / IBJA
  const mock: GoldSilverRates = {
    gold22K: 6150,
    gold24K: 6700,
    silver: 82,
    unit: 'per gram',
    updatedAt: new Date().toISOString(),
  };
  setCache(cacheKey, mock, CACHE_TTL.GOLD_MS);
  return mock;
}
