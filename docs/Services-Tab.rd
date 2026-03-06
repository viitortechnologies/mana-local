Enhance the Mana Local Expo app with the following global and Services module features.

========================================
GLOBAL MEDIA UPLOAD VALIDATION (ALL MODULES)
========================================

For every module that supports media upload (Posts, ReUse, To-Lets, Future Services):

1. Validate:
   - Max 5 images
   - 1 video (Max 50MB)
2. If upload fails due to size limit:
   Immediately show popup:

   Title:
   "Upload Failed – File Size Too Large"

   Message:
   "Tip: To reduce file size, first send your photos or video to WhatsApp, then download it back to your gallery and upload again. This helps compress the file."

3. This suggestion must appear:
   - On validation failure
   - On upload API failure due to file size
   - As hint text below upload component

Make this reusable across all modules.

========================================
CASHBACK + WALLET SYSTEM (GLOBAL)
========================================

Enable Wallet system in the app.

Create tables:

wallets:
- id
- user_id
- balance
- created_at

wallet_transactions:
- id
- user_id
- reference_id
- module_type (to_let / future_service)
- amount
- type (credit/debit)
- status
- created_at

Cashback Logic:
- Admin can configure cashback amount per module.
- When Admin approves listing:
   - Credit cashback to user's wallet.
   - Create wallet transaction entry.

Wallet Screen:
- Show current balance
- Show transaction history
- Future ready for withdrawal feature

========================================
FIRST TIME USER LOCATION SELECTION
========================================

When user opens app for first time:

Show screen:
"Choose Your Location"

Options:
1. Use Current Location
2. Enter Location Manually

----------------------------------------
If user selects "Use Current Location":
----------------------------------------

- Request device location permission (Expo Location API)
- Capture:
   latitude
   longitude
- Reverse geocode to get:
   area
   city
   pincode
- Store in user profile:
   latitude
   longitude
   selected_city
   selected_area

----------------------------------------
If user selects "Enter Manually":
----------------------------------------

- Use Google Maps Places API
- Allow:
   search by city
   select location on map
- Capture:
   latitude
   longitude
   address components
- Store in user profile

Save location in session and database.

User can change location later from profile.

========================================
SERVICES ROOT MODULE
========================================

Add new footer menu:
"Services"

Root Services screen layout:
(Header and Footer same as existing app)

Body:
- Vertical list/grid style as per Services-List.png
- Each service shown as card
- Icon + Title + Short description
- Clean modern design
- Rounded cards
- Proper spacing

Services List:
- To-Lets
- Future modules (extensible design)

========================================
TO-LETS MODULE (UNDER SERVICES)
========================================

Anyone can submit listing.

Required fields:
- Title
- Description
- Property Type (Residential/Commercial)
- Owner Name
- Owner Contact (Mandatory)
- Exact Address
- Landmark
- Area
- City
- Pincode
- Nearby Locations
- Latitude (from device or map)
- Longitude
- Max 5 photos
- 1 video (Max 50MB)

Before submission show:
"Please verify all details carefully. Listing will be reviewed before publishing."

All listings:
status = pending
Admin must approve.

========================================
NEARBY 1KM SEARCH FEATURE
========================================

When user views To-Lets:

If user location available:
- Show listings within 1KM radius.
- Use Haversine formula OR Supabase PostGIS.
- Display distance on listing card.

Search Options:
1. Use current location
2. Select location from Google Map
3. Search by city name

Filters:
- Residential
- Commercial

========================================
LISTING DETAIL SCREEN
========================================

Show:
- Image carousel
- Video player
- Full address
- Landmark
- Nearby places
- Map preview with marker
- Distance from user
- Call Owner button
- WhatsApp button
- Cashback badge (if active)

========================================
RLS & ACCESS CONTROL
========================================

- Users can insert own listing
- Users can view approved listings
- Users can view their own listings
- Admin can approve/reject
- Admin can configure cashback amount

========================================
ARCHITECTURE REQUIREMENTS
========================================

- Modular folder structure:
   /modules/services
   /modules/wallet
   /modules/location
- Reusable media upload component
- Reusable popup component
- Clean TypeScript usage
- Proper error handling
- Optimized queries
- Scalable for future service modules