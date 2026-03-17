# Daylight Tracker

Daylight Tracker is a small browser app that calculates daylight duration for a city using solar position math (NOAA-style equations) and city lookup via OpenStreetMap Nominatim.

## Features

- Search by city name
- Converts city name to latitude/longitude using Nominatim
- Calculates:
	- Sunrise (minutes from midnight UTC)
	- Sunset (minutes from midnight UTC)
	- Total daylight duration
- Compares today’s daylight with:
	- Yesterday
	- 7 days ago
- Displays readable output in the page

## Project Structure

- `index.html` — page markup
- `assets/styles.css` — app styling
- `assets/solar.js` — solar math, geocoding fetch, and UI update logic

## How It Works

`assets/solar.js` builds the final result through these steps:

1. Convert `Date` to Julian Date
2. Compute days since J2000
3. Compute mean longitude and anomaly
4. Correct to ecliptic longitude
5. Compute solar declination
6. Compute hour angle
7. Compute solar noon
8. Derive sunrise/sunset/daylight

The app then calculates daylight deltas:

- `deltaDay = today - yesterday`
- `deltaWeek = today - lastWeek`

## Running Locally

Because this app uses `fetch()`, run it from a local server (not `file://`).

### Option 1: VS Code Live Server

1. Install the Live Server extension
2. Right-click `index.html`
3. Choose **Open with Live Server**

### Option 2: Python HTTP server

From the project root:

```bash
python3 -m http.server 8000
```

Then open:

`http://localhost:8000`

## Notes

- Times are currently calculated in **UTC minutes from midnight**.
- Nominatim responses can vary by query quality (e.g. `Paris` vs `Paris, France`).
- At extreme latitudes, sunrise/sunset can be unavailable (polar night / midnight sun).

## Future Improvements

- Convert UTC minutes to local clock time
- Show sunrise/sunset clock strings directly
- Add input validation and user-friendly API error states
