// solar.js
// Sunrise and sunset calculator built on the NOAA solar algorithm.
// Times come back as minutes from midnight UTC — easier to do maths on
// than clock strings. Convert to readable times in the display layer.


// --- toJulian -------------------------------------------------------
// The NOAA algorithm needs dates as a single continuous number rather
// than day/month/year. Julian Dates do that — they count days from
// 1 Jan 4713 BC without any calendar weirdness getting in the way.
//
// JS dates are milliseconds since 1 Jan 1970 (the Unix epoch).
// That epoch lands on Julian Date 2440587.5, so the conversion
// is just: divide by milliseconds-per-day, then add the offset.
// --------------------------------------------------------------------
function toJulian(date) {
    const millisecondsPerDay = 86400000;
    const unixEpochJulianDate = 2440587.5;
    return date.getTime() / millisecondsPerDay + unixEpochJulianDate;
}


// --- daysSinceJ2000 -------------------------------------------------
// The algorithm measures everything relative to 1 Jan 2000 noon,
// known as J2000. It's a standard astronomy reference point — using
// a recent anchor keeps the numbers manageable.
// Negative values just mean the date is before the year 2000.
// --------------------------------------------------------------------
function daysSinceJ2000(julianDate) {
    const j2000JulianDate = 2451545.0;
    return julianDate - j2000JulianDate;
}


// --- getSunPosition -------------------------------------------------
// Two angles that describe where the sun sits in its yearly orbit,
// both in degrees.
//
// Mean Longitude (L) is where the sun would be if Earth's orbit were
// a perfect circle. It advances about 0.9856 degrees per day.
//
// Mean Anomaly (g) tracks how far Earth is from perihelion — the
// closest point in its slightly elliptical orbit around the sun.
//
// Both can drift past 360 degrees over time, so they get normalised
// back into the 0–360 range. The ((x % 360) + 360) % 360 pattern
// handles negative values correctly — plain % 360 doesn't.
// --------------------------------------------------------------------
function getSunPosition(n) {
    const meanLongitude = 280.46 + 0.9856474 * n;
    const meanAnomaly = 357.528 + 0.9856003 * n;

    const L = ((meanLongitude % 360) + 360) % 360;
    const g = ((meanAnomaly % 360) + 360) % 360;

    return { L, g };
}


// --- getEclipticLongitude -------------------------------------------
// The mean longitude assumes a circular orbit, so it's not quite
// accurate. This function corrects for the ellipse using something
// called the equation of centre — the two correction terms
// (1.915 and 0.02) account for the sun appearing to move slightly
// faster when Earth is closer to it around January.
//
// L and g arrive in degrees. Lambda goes back out in radians because
// everything downstream uses trig functions that expect radians.
// --------------------------------------------------------------------
function getEclipticLongitude(L, g) {
    const degreesToRadians = Math.PI / 180;
    const gInRadians = g * degreesToRadians;

    const lambdaInDegrees = L + 1.915 * Math.sin(gInRadians) + 0.02 * Math.sin(2 * gInRadians);

    return lambdaInDegrees * degreesToRadians;
}


// --- getDeclination -------------------------------------------------
// Declination is the angle between the sun and Earth's equator.
// It's what drives the seasons — in June the sun sits above the
// equator (+23.4°), in December below it (-23.4°).
// The 23.439° figure is Earth's axial tilt.
// --------------------------------------------------------------------
function getDeclination(lambda) {
    const degreesToRadians = Math.PI / 180;
    const axialTiltInRadians = 23.439 * degreesToRadians;
    return Math.asin(Math.sin(axialTiltInRadians) * Math.sin(lambda));
}


// --- getHourAngle ---------------------------------------------------
// The hour angle is how far the sun needs to travel from solar noon
// to reach the horizon — it's what lets us pin down the actual
// time of sunrise and sunset.
//
// The zenith angle is 90.833° rather than a clean 90° for two reasons:
// the sun has a physical radius (adds ~0.267°) and the atmosphere
// bends light so we see the sun slightly before it clears the horizon
// (~0.566°). Both effects mean sunrise appears a little earlier and
// sunset a little later than pure geometry would suggest.
//
// cosHA outside the range -1 to 1 means the sun either never rises
// (polar night) or never sets (midnight sun). Return null and let
// the caller handle it.
// --------------------------------------------------------------------
function getHourAngle(lat, dec) {
    const degreesToRadians = Math.PI / 180;
    const radiansToDegrees = 180 / Math.PI;
    const zenithInRadians = 90.833 * degreesToRadians;
    const latitudeInRadians = lat * degreesToRadians;

    const cosHA =
        (Math.cos(zenithInRadians) - Math.sin(latitudeInRadians) * Math.sin(dec)) /
        (Math.cos(latitudeInRadians) * Math.cos(dec));

    if (cosHA > 1 || cosHA < -1) {
        return null;
    }

    const hourAngleInRadians = Math.acos(cosHA);
    return hourAngleInRadians * radiansToDegrees;
}


// --- getSolarNoon ---------------------------------------------------
// Solar noon is the moment the sun peaks — expressed as minutes
// from midnight UTC. Sunrise and sunset are calculated either side
// of this point, so getting it right matters.
//
// The equation of time is a correction for two things that cause
// the sun to run slightly ahead or behind the clock: Earth's
// elliptical orbit (it speeds up near the sun) and the tilt of
// Earth's axis. The effect shifts solar noon by up to 16 minutes
// depending on the time of year.
//
// 720 is midday in minutes. Longitude shifts it by 4 minutes per
// degree — that's where the 4 × lon comes from.
// --------------------------------------------------------------------
function getSolarNoon(lon, L, lambda) {
    const radiansToDegrees = 180 / Math.PI;
    const degreesToRadians = Math.PI / 180;
    const axialTiltInRadians = 23.439 * degreesToRadians;

    // Project the sun's position onto the equatorial plane
    const rightAscension =
        Math.atan2(
            Math.cos(axialTiltInRadians) * Math.sin(lambda),
            Math.cos(lambda)
        ) * radiansToDegrees;

    const normalizedRightAscension = ((rightAscension % 360) + 360) % 360;

    const equationOfTime = 4 * (L - normalizedRightAscension);

    return 720 - 4 * lon - equationOfTime;
}


// --- getSunTimes ----------------------------------------------------
// The main function — runs everything in order and returns sunrise,
// sunset, and total daylight in minutes from midnight UTC.
//
// Returns null if the location has polar night or midnight sun,
// since sunrise and sunset don't exist in those conditions.
// --------------------------------------------------------------------
function getSunTimes(lat, lon, date) {
    const julian = toJulian(date);
    const n = daysSinceJ2000(julian);
    const { L, g } = getSunPosition(n);
    const lambda = getEclipticLongitude(L, g);
    const declination = getDeclination(lambda);
    const hourAngle = getHourAngle(lat, declination);

    if (hourAngle === null) {
        return null;
    }

    const transit = getSolarNoon(lon, L, lambda);
    const sunrise = transit - hourAngle * 4;
    const sunset = transit + hourAngle * 4;
    const daylight = sunset - sunrise;

    return { sunrise, sunset, daylight };
}


// --- getCoordinates -------------------------------------------------
// Turns a city name into lat/lon using the OpenStreetMap Nominatim
// API. Free to use, no key needed. encodeURIComponent handles city
// names with spaces, accents, or other special characters safely.
// Lat and lon come back as strings from the API, so parseFloat
// converts them to numbers before they go anywhere else.
// --------------------------------------------------------------------
async function getCoordinates(city) {
    const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(city)}&format=json&limit=1`;
    const response = await fetch(url);
    const data = await response.json();

    if (!data.length) {
        throw new Error(`Could not find "${city}"`);
    }

    const result = data[0];
    return {
        lat: parseFloat(result.lat),
        lon: parseFloat(result.lon),
        name: result.display_name
    };
}


// --- getLocationNameFromCoords -------------------------------------
// Reverse geocodes lat/lon into a human-readable place name so GPS
// searches can use the same display card format as text searches.
// --------------------------------------------------------------------
async function getLocationNameFromCoords(lat, lon) {
    const url = `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lon}&format=json`;
    const response = await fetch(url);
    const data = await response.json();

    const address = data.address;
    const name = address.city 
    || address.town 
    || address.village 
    || address.suburb
    || address.county
    || 'Current location';

return name;    
}


// --- calculateAndDisplay --------------------------------------------
// Runs the daylight calculation for today, yesterday, and last week,
// then renders the result card.
// --------------------------------------------------------------------
function calculateAndDisplay(coords) {
    const today = new Date();

    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);

    const lastWeek = new Date();
    lastWeek.setDate(lastWeek.getDate() - 7);

    const todayTimes = getSunTimes(coords.lat, coords.lon, today);
    const yesterdayTimes = getSunTimes(coords.lat, coords.lon, yesterday);
    const lastWeekTimes = getSunTimes(coords.lat, coords.lon, lastWeek);

    // Bail out if any date hits polar conditions
    if (todayTimes === null || yesterdayTimes === null || lastWeekTimes === null) {
        console.log('Sun times unavailable for one or more dates at this location.');
        return;
    }

    const deltaDay = todayTimes.daylight - yesterdayTimes.daylight;
    const deltaWeek = todayTimes.daylight - lastWeekTimes.daylight;

    displayResults(coords, todayTimes, deltaDay, deltaWeek);
}


// --- Search button --------------------------------------------------
// Kicks everything off when the user hits Search. Gets coordinates
// for the city, calculates sun times for today, yesterday, and a
// week ago, works out the deltas, then hands everything to
// displayResults to put on the page.
// --------------------------------------------------------------------
document.getElementById('searchbtn').addEventListener('click', async function() {
    const city = document.getElementById('input').value.trim();
    if (!city) return;

    try {
        const coords = await getCoordinates(city);
        calculateAndDisplay(coords);
    } catch (error) {
        const resultDiv = document.getElementById('result');
        resultDiv.innerHTML = `<div class="daylight-total">${error.message}</div>`;
    }
});


// --- displayResults -------------------------------------------------
// Builds the results HTML and drops it into the result div.
// Keeps the location name short by taking only the first part
// before the comma — the full string from Nominatim is too long.
// --------------------------------------------------------------------
function displayResults(coords, todayTimes, deltaDay, deltaWeek) {
    const resultDiv = document.getElementById('result');
    resultDiv.innerHTML = `
        <div class="location">${coords.name.split(',')[0]}</div>
        <div class="daylight-total">${minsToHours(todayTimes.daylight)} of daylight today</div>
        <div class="sun-times">
            <div class="sun-time-item">
                <span class="sun-time-label">Sunrise</span>
                <span class="sun-time-value">${minsToTime(todayTimes.sunrise)}</span>
            </div>
            <div class="sun-time-item">
                <span class="sun-time-label">Sunset</span>
                <span class="sun-time-value">${minsToTime(todayTimes.sunset)}</span>
            </div>
        </div>
        <div class="cards">
            <div class="card">
                <div class="card-period">vs yesterday</div>
                <div class="card-delta ${deltaDay >= 0 ? 'gain' : 'loss'}">${formatDelta(deltaDay)}</div>
            </div>
            <div class="card">
                <div class="card-period">vs last week</div>
                <div class="card-delta ${deltaWeek >= 0 ? 'gain' : 'loss'}">${formatDelta(deltaWeek)}</div>
            </div>
        </div>
    `;
}


// --- formatDelta ----------------------------------------------------
// Formats a delta in minutes as a readable string.
// Positive = more light, negative = less light.
// Rounds to whole minutes — decimal minutes aren't meaningful here.
// --------------------------------------------------------------------
function formatDelta(minutes) {
    const rounded = Math.round(minutes);

    if (rounded > 0) return `+${rounded} mins more`;
    if (rounded < 0) return `${Math.abs(rounded)} mins less`;
    return 'the same';
}


// --- minsToTime -------------------------------------------------
// Converts minutes from midnight UTC into a readable HH:MM time string.
// Used for displaying sunrise and sunset times.
// --------------------------------------------------------------------
function minsToTime(mins) {
    const hours = Math.floor(mins / 60);
    const minutes = Math.floor(mins % 60);
    return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
}


// --- minsToHours ----------------------------------------------------
// Converts a raw minute count into a readable hours and minutes
// string. Used for displaying total daylight duration.
// --------------------------------------------------------------------
function minsToHours(mins) {
    const hours = Math.floor(mins / 60);
    const minutes = Math.floor(mins % 60);
    return `${hours}h ${minutes}m`;
}

// --- Location button ------------------------------------------------
// Uses browser geolocation, reverse geocodes the coordinates to a
// place name, then runs the same calculation path as text search.
// --------------------------------------------------------------------
document.getElementById('locationbtn').addEventListener('click', async function() {
    const resultDiv = document.getElementById('result');

    if (!navigator.geolocation) {
        resultDiv.innerHTML = '<div class="daylight-total">Geolocation is not supported in this browser.</div>';
        return;
    }

    navigator.geolocation.getCurrentPosition(
        async function(position) {
            const lat = position.coords.latitude;
            const lon = position.coords.longitude;
            const name = await getLocationNameFromCoords(lat, lon);

            calculateAndDisplay({ lat, lon, name });
        },
        function() {
            resultDiv.innerHTML = '<div class="daylight-total">Could not get your location. Please allow location access and try again.</div>';
        }
    );
});

// Auto-load Newquay on page start
getCoordinates('Newquay').then(coords => calculateAndDisplay(coords));