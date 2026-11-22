# Piano

An 88-key piano that learns from the notes people play and can continue a melody.

Play a key or use `A W S E D F T G Y H U J K` around middle C. Drag the keyboard horizontally to reach the full A0–C8 range. Press **Play** to hear a continuation; **Clear** resets your local notes and model.

The browser learns a private model and sends anonymous note transitions (the last four notes and the next note) to train a shared model. It does not submit accounts, names, or raw play sessions. Shared model updates are stored in Vercel Blob and are available to all visitors.

## Deploy to Vercel

1. Import this repository into Vercel.
2. In the project's **Storage** tab, create a **private Vercel Blob** store and connect it to the project. Vercel provides the function credentials automatically; no Upstash account or separate storage provider is needed.
3. Deploy to Production. The shared model updates as new note batches arrive; no cron job is required.

Vercel Blob is available on Hobby plans. Storage and transfer usage are subject to Vercel's current limits and pricing. The project uses Vercel's **Other** framework preset because the root `requirements.txt` is for the model notebooks, not a Flask web app.

For local development, connect the Blob store to the Development environment, pull the Vercel environment variables, and run `npx vercel dev`. Opening `index.html` directly still works as a local piano, but shared learning requires the Vercel API and Blob store.

## How it works

The shared online softmax classifier is updated from note transitions using conditional writes, so simultaneous visitors don't overwrite each other's contributions. Contributions are limited to 50,000 examples per UTC day. Playback blends the shared model with the model learned locally in your browser. Piano tones are synthesized and cached in the browser; no audio samples or external audio service are used.
