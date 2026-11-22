# Piano

An 88-key piano that learns from the notes people play and can continue a melody.

Play a key or use `A W S E D F T G Y H U J K` around middle C. Drag the keyboard horizontally to reach the full A0–C8 range. Press **Play** to hear a continuation; **Clear** resets only your local notes and model.

The piano keeps a private model in the browser and submits anonymous note transitions (the last four notes and the next note) to the shared model. It does not submit accounts, names, or raw play sessions. A scheduled job trains the shared model hourly, and open pages refresh it hourly.

The public learning endpoint accepts up to 50,000 note examples per hour to limit abuse. If that limit is reached, the browser queues a limited number of notes locally and retries after the hour changes.

## Deploy to Vercel

1. Import this repository into Vercel and connect an Upstash Redis database through the Vercel Marketplace.
2. Add these Production environment variables in Vercel:
   - `UPSTASH_REDIS_REST_URL`
   - `UPSTASH_REDIS_REST_TOKEN`
   - `CRON_SECRET` — a long random secret used to protect model training.
3. Deploy to Production. `vercel.json` schedules `/api/cron/train` at the start of every hour.

Hourly Vercel Cron Jobs require the Pro plan; Hobby projects allow daily schedules only. Cron Jobs run against the Production deployment. The shared model is trained from anonymous aggregated note transitions in Redis; Upstash is the only persistence service required.

For local development, set the same variables in `.env.local` and run `npx vercel dev`. Opening `index.html` directly still works as a local piano, but shared learning requires the Vercel API and Redis. No application packages need to be installed.

## How it works

The model is an online softmax classifier trained on note transitions. Each hourly run folds the newly collected examples into the shared model. Playback blends that model with your locally learned one. Piano tones are synthesized and cached in the browser; no audio samples or external audio service are used.