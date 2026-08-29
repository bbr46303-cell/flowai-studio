# FlowAI Studio 2.0

Fixed/added:
- Firebase email/password + Google login
- Server-side Firebase ID-token verification
- Firestore credits and generation history
- 5/10/15 second credit enforcement
- 16:9 and 9:16
- FAL Wan 2.2 video generation
- Razorpay order + signature + captured-payment verification
- Basic ₹99, Pro ₹299, Premium ₹599, Ultra ₹899/12 months
- No secret API keys in frontend

Render Environment Variables:
FAL_KEY
FIREBASE_SERVICE_ACCOUNT
RAZORPAY_KEY_ID
RAZORPAY_KEY_SECRET

Firebase:
Enable Email/Password and Google providers, create Firestore, create a service account and put its JSON in FIREBASE_SERVICE_ACCOUNT.

Render:
Build: npm install
Start: npm start

Important: use Razorpay test keys first, then switch to live keys after testing.
