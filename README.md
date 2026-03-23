# Transit-Live Melbourne 🚆

Real-time Melbourne train, tram and bus tracker.

## Quick Deploy to Railway (free, works on mobile)

1. **Push to GitHub**
   - Go to github.com → New Repository → call it `transit-live`
   - Upload all files in this folder

2. **Deploy on Railway**
   - Go to railway.app → New Project → Deploy from GitHub
   - Select your `transit-live` repo
   - Railway auto-detects Node.js and deploys

3. **Add your API key**
   - In Railway dashboard → your project → Variables tab
   - Add: `TRANSIT_API_KEY` = your key from opendata.transport.vic.gov.au
   - Railway restarts automatically

4. **Open on your phone**
   - Railway gives you a URL like `https://transit-live-production.up.railway.app`
   - Open it on any device, anywhere — full live map

## Getting an API Key

1. Go to: https://opendata.transport.vic.gov.au
2. Sign up for a free account
3. Go to your profile → API Keys
4. Copy the key and add it to Railway as TRANSIT_API_KEY

## Running Locally

```bash
npm install
TRANSIT_API_KEY=your_key node server.js
```
Then open http://localhost:3000

## What you get
- Real GPS positions for every Metro Train, Yarra Tram, Metro Bus
- Delay in minutes vs schedule
- Refreshes every 15 seconds
- Works on mobile browser (no app install needed)
- Falls back to demo mode if API is unavailable
