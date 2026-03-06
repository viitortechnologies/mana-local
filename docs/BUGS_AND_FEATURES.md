# Mana Local – Bugs & Feature Tracker

## Current bugs

- **Avatar upload (fixed)**  
  - **Fix applied**: Migration `012_avatars_storage_policies.sql` adds RLS policies on `storage.objects` for the `avatars` bucket: INSERT/UPDATE/DELETE (restricted to own folder `avatars/<user_id>/...`), SELECT for authenticated and anon. Run `supabase db push` or run the migration SQL, then re-test Edit Profile → Choose picture.

- **DOB calendar on web**
  - **Symptom**: Native `@react-native-community/datetimepicker` does not behave correctly on Expo Web.
  - **Current behavior**: On web, the DOB field falls back to a plain `YYYY-MM-DD` text input; native calendar is used only on iOS/Android.
  - **Open question**: Decide if this is acceptable for v1, or if we should add a web-specific date picker component for a consistent calendar UX.

## Feature ideas / backlog

- **In-app admin moderation UI**
  - Review and approve posts, comments, and reuse items per location from within the app (instead of using Supabase Table Editor).

- **Richer area catalog**
  - Replace hardcoded `AREA_OPTIONS_BY_PIN` with a `areas` table keyed by location/pincode, editable from Supabase.

- **Verified badge everywhere**
  - Show a verified indicator next to author names on posts once `profile_completed_at` is set and mandatory fields are complete.





notifications
OTP setup
terms and conditions
Privacy policy


BID process




Miniutes Delivery - Root/Main Module
  You complete puzzle , we will bring you before you complete the puzzles. 
  Shop by Reels


Put this everyone in future modules also. While uploading if they got memory size validation then show below text in popup, 
  Give a suggession , before uploading first upload video or photos to whatsapp then download to your gallery, then upload to whatsapp. So that memory will reduce. Give an hint where ever upload got failed, then in popup immediate give this suggession.



Cash Back and Wallet system will enable.
When user first time opene, we should pick the user location as screenshot attached(user-location.png) , 
  When user select current location, then device current location we need to collect and store .
  When user select enter manually then will use the google map api's

  Reward points 
  100 points equal to 50/- 

  For every activities user should get some points. 

  They can redeem while purchasing anything. 

  Calculation should happened only profitable amount only can able to redeem not total points. 

  For example if a product we are getting 27% profit we should redeem only 27% of cost points we should be able to deduct, not 100% even though they have the available points.

  This amount should settle by Mana local to vendor.

  How mana local get the amount is, we need sell 200% margin products from there we should give 100% points. 
  Example : if any product if we purchase for 100, we should sell it to 300 or more amount. We should give 100% this should be configurable how much % we should give points or fixed points





Services - ( enable New menu in the footer)
  To-Lets
    anyone can submit this details. Admin / Reviewer will approve.
    Who's submitting , they get cashback , this cashback amount will config by admin.
    Allow max 5 photos and 50MB 1 video 
    Owner contact details are mandatory.
    Commercial/Residental
    capture exact location from the device, get the lattitude and langitude and store it into the application.
    Near by locations
    exact address details
    Land mark of the place
    Area, pincode, 
    Admin should approve. ( we should inform the usring please check before uploading) Based on langitude and lattide we should display all the nearby 1KM available to-lets units.
    User can able to search based on his location, user can pickup from the app, or he can pickup the location from google map, or he can search by city name we should display.
    Contact details 
    







  Plumbing/carpenter
    Anyone can request this, This required proofs, 10 photos will allow requester to send photos. Will assign Label as - Service , Carpenter/Plumber.

  Electric


  Car Rental
  Functions
  Photo Shoot
  Food Order

Communications
  Email
  mobile
  whatsapp
  Push Notifications : need to check firebase integration instead of expo
     WARN  expo-notifications: Android Push notifications (remote notifications) functionality provided by expo-notifications was removed from Expo Go with the release of SDK 53. Use a development build instead of Expo Go. Read more at https://docs.expo.dev/develop/development-builds/introduction/.
      WARN  `expo-notifications` functionality is not fully supported in Expo Go:
      We recommend you instead use a development build to avoid limitations. Learn more: https://expo.fyi/dev-client.




