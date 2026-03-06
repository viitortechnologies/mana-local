# News Module – APIs & Subscriptions

The News dashboard uses **free tiers or mock data** by default. For production, consider these paid/low-cost options.

## 1. Weather (✅ Free – in use)
- **Open-Meteo** – No API key, 30-min cache.
- Already integrated: current temp, rain chance, heat alert, 7-day forecast by user location.

## 2. Cricket
- **Current:** Mock data (upcoming India matches, recent results).
- **Recommendation:**
  - **CricAPI** (cricapi.com) – Free tier ~100 requests/day.
  - **RapidAPI – Cricket Live Scores** – Free tier available.
- Integrate in `src/lib/newsApis.ts` → `fetchCricketData()`: call API, map response to `CricketMatch[]`, keep Live / Upcoming / Results sections. Auto-refresh every 60s when a match is live (e.g. in the Cricket screen with a timer).

## 3. Local Events (✅ In-app)
- Stored in Supabase `local_events` table.
- Users submit; status: pending → approved / rejected. Only approved events are shown.
- Add a “Submit event” flow (form: title, description, date, location, organizer, contact, optional image) and an admin/reviewer screen to approve/reject.

## 4. Fuel Prices
- **Current:** Mock petrol/diesel and change vs yesterday; 6-hour cache.
- **Recommendation:**
  - **RapidAPI – Fuel Price API India** (e.g. “fuel-price-api-india-diesel-petrol-price-api-free”).
  - **PurePriceIO** – 200 free credits on signup.
  - **Daily Fuel Price** (dailyfuelprice.com) – API option.
- Replace mock in `fetchFuelPrices(cityName)` with API call; keep 6-hour cache.

## 5. Gold & Silver Rates
- **Current:** Mock 22K/24K gold and silver per gram; daily cache.
- **Recommendation:**
  - **GoldPricez** – Free tier ~30–60 requests/hour.
  - **Metals-API** – Free tier for precious metals.
  - **IBJA** (India) – Official benchmark; subscription via IBJA.
- Replace mock in `fetchGoldSilverRates()` with API; keep 24-hour cache.

## 6. Emergency Contacts (✅ In-app)
- Stored in Supabase `emergency_contacts` (categories: ambulance, police, fire, hospital, blood_bank).
- Migration seeds 102, 108, 100, 101, 1075. Add/update rows via Supabase or admin UI.

## Caching (already in place)
- Weather: 30 minutes (`CACHE_TTL.WEATHER_MS`).
- Fuel: 6 hours (`CACHE_TTL.FUEL_MS`).
- Gold/Silver: 24 hours (`CACHE_TTL.GOLD_MS`).
- Cricket: 1 minute when live (use in UI refresh; API layer can use same TTL).

## Dashboard order
1. Weather  
2. Cricket  
3. Local Events  
4. Fuel Prices  
5. Gold & Silver  
6. Emergency Contacts  

Each section: title, icon, horizontal card list; tap opens detail screen with full data.
