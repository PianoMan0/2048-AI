# Piano

An 88-key piano that learns from the notes and chords people play and can continue a melody. Visit the About page for a live shared-model example count and a short explanation of how it works.

Play a key or use `A W S E D F T G Y H U J K` around middle C. Use the octave arrows to move across the full A0–C8 range without horizontal scrolling. Press **Play** to hear a continuation. The model only plays notes you have played locally, and learns notes struck together as chords.

The browser learns a private model and sends anonymous note transitions (the last four notes and the next note or chord) to train a shared model. It does not submit accounts, names, or raw play sessions. Shared model updates are stored in SQLite and are available to all visitors.

## Requirements

- PHP 8.1 or newer
- PDO SQLite enabled
- A persistent, writable directory for the SQLite database

## Run locally

From the project directory, start PHP's built-in web server:

```sh
php -S 127.0.0.1:8000
```

Open <http://127.0.0.1:8000>. The SQLite database is created outside the project directory by default. To choose another persistent location, set `PIANO_DB_PATH` to an absolute file path before starting PHP. The database directory must be writable by the PHP process.

## Deploy

Deploy the project to a PHP 8.1+ host with PDO SQLite enabled. Configure the web server's document root to this project directory and ensure the PHP process can write to the directory containing the SQLite database. Set `PIANO_DB_PATH` to a persistent path outside the public document root for production deployments. Back up this database to preserve shared learning.

## How it works

The PHP API stores the shared multi-label classifier in SQLite and updates it within a write transaction, so simultaneous visitors don't overwrite each other's contributions. Contributions are limited to 50,000 examples per UTC day. Playback blends the shared model with the model learned locally in your browser, while restricting generated notes to the notes played locally. Piano tones and interactive key handling run in browser JavaScript, and are synthesized and cached locally. No audio samples or external audio service are used.
