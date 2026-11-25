# Rent a House

Full-stack rental property marketplace built with React, Tailwind CSS, Express, SQLite (`node:sqlite`), Google Maps Platform, and Google Sign-In.

## Requirements

- Node.js `22+` (uses built-in `node:sqlite` and `zlib.crc32`)
- npm

## Setup & Run Locally

1. Install dependencies:
   ```bash
   npm install
   ```

2. Create a `.env` file from `.env.example` and fill in your environment variables:
   - `VITE_GOOGLE_MAPS_API_KEY` (optional, for interactive Google Maps)
   - `ADMIN_PASSCODE` (optional, protects initial Admin registration)

3. Start the development server (runs both Express API + Vite frontend on port `3000`):
   ```bash
   npm run dev
   ```

4. For production build & start:
   ```bash
   npm run build
   npm start
   ```

The SQLite database is automatically created at `.data/rent_a_house.db` on first start.
