import dotenv from "dotenv"
import axios from "axios"
import express from "express"
import path from "path"
const { get } = require("http");

dotenv.config()

// Setting up Express App
const app = express();
app.use(cors());
const port = 3000

// API Key from .env file and the base url
const base_url = `https://api.openweathermap.org/data/2.5`
const API_key = process.env.API_key

// Some helper functions
const average = arr => (arr.reduce((p, c) => p + c, 0) / arr.length).toFixed(2);
const sum = arr => (arr.reduce((p, c) => p + c, 0)).toFixed(2);
const kelvin_to_celsius = k => (k < 0) ? '0K' : Math.round((k - 273.12) * 100) / 100;
const min_max = (arr) => {
    const min = kelvin_to_celsius(Math.min(...arr));
    const max = kelvin_to_celsius(Math.max(...arr));
    return { min: min, max: max }
}


app.get('/', (req, res) => res.send('Weather App Server Side'));

app.get('/weather/:town', getForecast);

app.listen(port, () => console.log(`Weather app listening on port ${port}!`));

// Air Pollution PM2_5 Analysis
function getMaskAdvise(forecastData) {
    var pm2_5 = [];
    for (forecastDate in forecastData) {
        if (forecastData[forecastDate].avgPM2_5 === null || forecastData[forecastDate].avgPM2_5 === undefined)
            pm2_5.push(parseInt(0));
        else
            pm2_5.push(parseInt(forecastData[forecastDate].avgPM2_5));
    }
    // console.log(pm2_5)
    const pm2_5_avg = average(pm2_5);
    return (pm2_5_avg > 10);
}

// Temperature Analysis - hot/warm/cold
function getTemperatureAnalysis(forecastData) {
    let max = 0;
    let min = forecastData[Object.keys(forecastData)[0]].avgTemp;
    let weatherType = null;

    let tempRange = {};

    for (forecastDate in forecastData) {
        tempRange = forecastData[forecastDate].temperatureRange;
        if (tempRange.max >= max)
            max = tempRange.max;
        if (tempRange.min <= min)
            min = tempRange.min;
    }

    if (max > 24) weatherType = "hot";
    else if (min >= 12 && max <= 24) weatherType = "mild";
    else weatherType = "cold";

    return {
        weatherType: weatherType,
        max: max,
        min: min
    }

}

function getForecast(req, res) {
    var town = req.params.town;
    console.log(`Requesting weather forecast for ${town}...`);

    var forecastData = {};
    var doesRain = false;
    var airPollutionData = {};
    var latitude = 0;
    var longitude = 0;


    axios.get(`${base_url}/forecast?q=${town}&APPID=${API_key}`).then(
        (response) => {
            const { lat, lon } = response.data.city.coord;
            latitude = lat;
            longitude = lon;

            var weatherData = response.data.list;
            // Iterating over each day forecast

            var days = 0
            for (weatherEntry in weatherData) {
                // formatting date
                let date = new Date(response.data.list[weatherEntry].dt * 1000);
                date.setHours(0, 0, 0, 0);
                date = date.toLocaleDateString();
                // Making sure we only have next four days forercast
                if (days > 4) break;
                // Initiliazing if undefined or null
                if (!forecastData[date]) {
                    days++;
                    forecastData[date] = {
                        windSpeeds: [],
                        temperatures: [],
                        rainfallLevels: [],
                    }
                }

                forecastData[date].windSpeeds.push(weatherData[weatherEntry].wind.speed);
                forecastData[date].temperatures.push(weatherData[weatherEntry].main.temp);

                // Check if there is any rain
                if (weatherData[weatherEntry].rain && weatherData[weatherEntry].rain['3h']) {
                    doesRain = true;
                    forecastData[date].rainfallLevels.push(weatherData[weatherEntry].rain['3h']);
                }

            }

        }
    ).then(() => {
        axios.get(`${base_url}/air_pollution/forecast?lat=${latitude}&lon=${longitude}&APPID=${API_key}`).then((response1) => {
            const airPollutionData = response1.data.list;
            var days = 0
            for (airPollutionEntry of airPollutionData) {
                let date = new Date(airPollutionEntry.dt * 1000);
                date.setHours(0, 0, 0, 0);
                date = date.toLocaleDateString();
                // Making sure we only have next four days forercast
                if (days > 4) break;
                // Initiliazing if undefined or null
                if (!airPollutionData[date]) {
                    days++;
                    airPollutionData[date] = {
                        pm2_5: []
                    }
                }
                // console.log(airPollutionEntry.components.pm2_5)
                airPollutionData[date].pm2_5.push(parseInt(airPollutionEntry.components.pm2_5))
                // console.log(`${date} - PM2_5 - ${airPollutionEntry.components.pm2_5}`)
            }


            //  Calculating averages once compiled

            for (forecastDate in forecastData) {

                // console.log(airPollutionData[forecastDate].pm2_5)
                forecastData[forecastDate].avgTemp = kelvin_to_celsius(average(forecastData[forecastDate].temperatures));
                forecastData[forecastDate].temperatureRange = min_max(forecastData[forecastDate].temperatures);
                forecastData[forecastDate].avgWind = average(forecastData[forecastDate].windSpeeds);
                forecastData[forecastDate].rainfallLevels = sum(forecastData[forecastDate].rainfallLevels);
                if (airPollutionData[forecastDate] !== null && airPollutionData[forecastDate] !== undefined)
                    forecastData[forecastDate].avgPM2_5 = average(airPollutionData[forecastDate].pm2_5);
            }

            // Get overall temperature weatherType and air pollution analysis
            temperatureAnalysis = getTemperatureAnalysis(forecastData);
            maskAdvised = getMaskAdvise(forecastData);



            res.json({
                forecastData: forecastData,
                doesRain: doesRain,
                temperatureAnalysis: temperatureAnalysis,
                maskAdvised: maskAdvised
            })


        }).catch((error) => {
            console.error(error);
            res.status(400);
            res.json({
                error: "Bad Request!"
            });
        })
    }

    ).catch((error) => {
        console.error(error);
        res.status(400);
        res.json({
            error: "Bad Request!"
        });
    })

}

