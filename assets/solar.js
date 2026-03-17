// ============================================================
// solar.js — Sunrise & sunset calculator
// Based on the NOAA solar calculation algorithm
// All times are returned in minutes from midnight (UTC)
// ============================================================


// ------------------------------------------------------------
// toJulian(date)
// Converts a JavaScript Date object to a Julian Date number.
// Julian Dates count days continuously from 1 Jan 4713 BC.
// JavaScript dates count milliseconds from 1 Jan 1970 (Unix epoch).
// 2440587.5 is the Julian Date of the Unix epoch.
// ------------------------------------------------------------
function toJulian(date) {
    const millisecondsPerDay = 86400000;
    const unixEpochJulianDate = 2440587.5;
    return date.getTime() / millisecondsPerDay + unixEpochJulianDate;
}


// ------------------------------------------------------------
// daysSinceJ2000(julianDate)
// Returns the number of days since 1 January 2000 noon (J2000).
// J2000 is the standard astronomical reference point used by
// the NOAA algorithm. Negative values = before year 2000.
// ------------------------------------------------------------
function daysSinceJ2000(julianDate) {
    const j2000JulianDate = 2451545.0;
    return julianDate - j2000JulianDate;
}


// ------------------------------------------------------------
// getSunPosition(n)
// Calculates the sun's approximate position in its orbit.
// n = days since J2000
//
// Mean Longitude (L) — where the sun would be if Earth's orbit
// were a perfect circle. Advances ~0.9856° per day.
//
// Mean Anomaly (g) — measures how far Earth is from the point
// in its elliptical orbit closest to the sun (perihelion).
//
// Both are normalised to 0–360° using the double modulo trick
// ((x % 360) + 360) % 360 which handles negative values correctly.
// ------------------------------------------------------------
function getSunPosition(n) {
    const meanLongitude = 280.46 + 0.9856474 * n;
    const meanAnomaly = 357.528 + 0.9856003 * n;

    // Normalise to 0–360° (handles negative n correctly)
    const L = ((meanLongitude % 360) + 360) % 360;
    const g = ((meanAnomaly % 360) + 360) % 360;

    return { L, g };
}


// ------------------------------------------------------------
// getEclipticLongitude(L, g)
// Corrects the mean longitude for Earth's elliptical orbit
// to get the true position of the sun — the ecliptic longitude.
//
// The correction terms (1.915 and 0.02) are the equation of centre,
// which accounts for the sun appearing to move faster near perihelion.
//
// L and g come in as degrees. Lambda is returned in radians
// because subsequent trig functions expect radians.
// ------------------------------------------------------------
function getEclipticLongitude(L, g) {
    const degreesToRadians = Math.PI / 180;
    const gInRadians = g * degreesToRadians;

    // Apply equation of centre correction
    const lambdaInDegrees = L + 1.915 * Math.sin(gInRadians) + 0.02 * Math.sin(2 * gInRadians);

    return lambdaInDegrees * degreesToRadians;
}


// ------------------------------------------------------------
// getDeclination(lambda)
// Calculates the solar declination — the angle between the sun
// and Earth's equatorial plane. This is what causes seasons.
//
// Ranges from +23.439° (summer solstice, northern hemisphere)
// to -23.439° (winter solstice, northern hemisphere).
//
// 23.439° is Earth's axial tilt.
// Lambda (ecliptic longitude) comes in as radians.
// Returns declination in radians.
// ------------------------------------------------------------
function getDeclination(lambda) {
    const degreesToRadians = Math.PI / 180;
    const axialTiltInRadians = 23.439 * degreesToRadians;
    return Math.asin(Math.sin(axialTiltInRadians) * Math.sin(lambda));
}


// ------------------------------------------------------------
// getHourAngle(lat, dec)
// Calculates the hour angle — the angle the sun needs to travel
// from solar noon to reach the horizon at sunrise or sunset.
//
// 90.833° is the zenith angle at sunrise/sunset. It's slightly
// more than 90° to account for the sun's physical radius (0.267°)
// and atmospheric refraction bending light (~0.566°).
//
// Edge cases:
//   cosHA > 1  → polar night (sun never rises) → return null
//   cosHA < -1 → midnight sun (sun never sets) → return null
//
// lat comes in as degrees, dec as radians.
// Returns hour angle in degrees.
// ------------------------------------------------------------
function getHourAngle(lat, dec) {
    const degreesToRadians = Math.PI / 180;
    const radiansToDegrees = 180 / Math.PI;
    const zenithInRadians = 90.833 * degreesToRadians;
    const latitudeInRadians = lat * degreesToRadians;

    const cosHA =
        (Math.cos(zenithInRadians) - Math.sin(latitudeInRadians) * Math.sin(dec)) /
        (Math.cos(latitudeInRadians) * Math.cos(dec));

    // Polar night or midnight sun — sun doesn't cross the horizon
    if (cosHA > 1 || cosHA < -1) {
        return null;
    }

    const hourAngleInRadians = Math.acos(cosHA);
    return hourAngleInRadians * radiansToDegrees;
}


// ------------------------------------------------------------
// getSolarNoon(lon, L, lambda)
// Calculates solar noon — the moment the sun is at its highest
// point, expressed as minutes from midnight UTC.
//
// The Equation of Time (EqT) corrects for two effects that cause
// the sun to run slightly ahead or behind clock time:
//   1. Earth's elliptical orbit (speed varies through the year)
//   2. Earth's axial tilt
//
// 720 = midday in minutes (12 × 60)
// 4 × lon adjusts for the observer's longitude
// (each degree of longitude = 4 minutes of time)
//
// lon in degrees, L in degrees, lambda in radians.
// Returns solar noon in minutes from midnight UTC.
// ------------------------------------------------------------
function getSolarNoon(lon, L, lambda) {
    const radiansToDegrees = 180 / Math.PI;
    const degreesToRadians = Math.PI / 180;
    const axialTiltInRadians = 23.439 * degreesToRadians;

    // Right ascension — the sun's position projected onto the equatorial plane
    const rightAscension =
        Math.atan2(
            Math.cos(axialTiltInRadians) * Math.sin(lambda),
            Math.cos(lambda)
        ) * radiansToDegrees;

    // Normalise to 0–360°
    const normalizedRightAscension = ((rightAscension % 360) + 360) % 360;

    // Equation of time in minutes
    const equationOfTime = 4 * (L - normalizedRightAscension);

    // Solar noon in minutes from midnight UTC
    return 720 - 4 * lon - equationOfTime;
}


// ------------------------------------------------------------
// getSunTimes(lat, lon, date)
// Main function — chains all calculations together.
// Takes a latitude, longitude, and JavaScript Date.
// Returns sunrise, sunset, and daylight duration in minutes,
// or null if the location has polar night / midnight sun.
//
// Sunrise = solar noon minus the hour angle (× 4 to convert degrees → minutes)
// Sunset  = solar noon plus the hour angle
// ------------------------------------------------------------
function getSunTimes(lat, lon, date) {
    const julian = toJulian(date);
    const n = daysSinceJ2000(julian);
    const { L, g } = getSunPosition(n);
    const lambda = getEclipticLongitude(L, g);
    const declination = getDeclination(lambda);
    const hourAngle = getHourAngle(lat, declination);

    // Polar night or midnight sun — can't calculate rise/set times
    if (hourAngle === null) {
        return null;
    }

    const transit = getSolarNoon(lon, L, lambda);
    const sunrise = transit - hourAngle * 4;
    const sunset = transit + hourAngle * 4;
    const daylight = sunset - sunrise;

    return { sunrise, sunset, daylight };
}

async function getCoordinates(city) {
    const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(city)}&format=json&limit=1`;
    const response = await fetch(url);
    const data = await response.json();
    const result = data[0];

    return {
        lat: parseFloat(result.lat),
        lon: parseFloat(result.lon),
        name: result.display_name
    };
}



document.getElementById('searchbtn').addEventListener('click', async function() {
    const city = document.getElementById('input').value.trim();
    const coords = await getCoordinates(city);

    const today = new Date();
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);

    const lastWeek = new Date();
    lastWeek.setDate(lastWeek.getDate() - 7);

    const todayTimes = getSunTimes(coords.lat, coords.lon, today);
    const yesterdayTimes = getSunTimes(coords.lat, coords.lon, yesterday);
    const lastWeekTimes = getSunTimes(coords.lat, coords.lon, lastWeek);

    if (todayTimes === null || yesterdayTimes === null || lastWeekTimes === null) {
        console.log('Sun times unavailable for one or more dates at this location.');
        return;
    }

    const deltaDay = todayTimes.daylight - yesterdayTimes.daylight;
    const deltaWeek = todayTimes.daylight - lastWeekTimes.daylight;

   displayResults(coords, todayTimes, deltaDay, deltaWeek);
});

function displayResults(coords, todayTimes, deltaDay, deltaWeek) {
    const resultDiv = document.getElementById('result');
    resultDiv.innerHTML = `
        <h2>${coords.name.split(',')[0]}</h2>
        <p>Daylight today: ${minsToHours(todayTimes.daylight)}</p>
        <p>vs yesterday: ${formatDelta(deltaDay)}</p>
        <p>vs last week: ${formatDelta(deltaWeek)}</p>
    `;
}

function formatDelta(minutes) {
    const rounded = Math.round(minutes);

    if (rounded > 0) {
        return `+${rounded} mins more`;
    }

    if (rounded < 0) {
        return `${Math.abs(rounded)} mins less`;
    }

    return '0 mins more';
}


function minsToHours(mins) {
    const hours = Math.floor(mins / 60);
    const minutes = Math.floor(mins % 60);

    return `${hours}h ${minutes}m`;
}