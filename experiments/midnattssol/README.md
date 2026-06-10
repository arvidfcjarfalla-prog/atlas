# Midnattssol

A single-file, zero-dependency visualization of daylight across the year in ten
Swedish cities, from Kiruna's midnight sun to Malmö's December dusk.

Open `index.html` in any browser. No build step, no network requests, no
external scripts or fonts.

## What it shows

For the selected city and the current year:

- **Daylight band** (gold): sunrise to sunset for every day of the year.
- **Civil twilight band** (dim gold): sun between 0° and −6° below the horizon.
- **Solar noon line**: wobbles with the equation of time, jumps an hour at the
  DST transitions in March and October (visible as notches in all curves).
- **Scrubbing**: pointer or arrow keys select a date; the readout shows
  sunrise, sunset, day length, and the change since the previous day.
- **Facts**: longest/shortest day, midnight-sun and polar-night day counts.

## How it works

Sunrise, sunset, and civil twilight are computed in the browser with NOAA's
general solar position equations (fractional-year form of the equation of time
and solar declination, zenith 90.833° for rise/set and 96° for civil twilight).
Times are converted to Swedish clock time including the CET/CEST switch.

Polar days are folded onto the solar-noon line (rise = set = noon under polar
night, noon ± 12 h under midnight sun) so every curve is continuous, which
makes the 180 ms morph between cities a plain per-day interpolation. Events
past midnight wrap around the day boundary when drawn.

## Accuracy

Spot-checked against almanac values: Stockholm solstice sunrise/sunset match
to the minute; Kiruna's midnight-sun period (50 days, 28 May–16 Jul) and polar
night (22 days) are within a day of published tables. The NOAA approximation
is good to a minute or two at these latitudes.
