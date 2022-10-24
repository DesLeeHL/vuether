// console.log('Vue App Backend')
require("dotenv").config()

const axios = require('axios')
const cors = require('cors');
const express = require('express');
const { get } = require("http");

// Setting up Express App
const app = express();
app.use(cors());
const port = 3000

// API Key from .env file and the base url
const URL_base = `https://api.openweathermap.org/data/2.5`
const API_key = process.env.OPENWEATHER_API_KEY

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

app.get('/forecast/:city', getForecast);

app.listen(port, () => console.log(`Weather app listening on port ${port}!`));

// Air Pollution PM2_5 Analysis
function getMaskAdvice(forecastData) {
    var pm2_5 = [];
    for (date in forecastData) {
        if (forecastData[date].avgPM2_5 === null || forecastData[date].avgPM2_5 === undefined)
            pm2_5.push(parseInt(0));
        else
            pm2_5.push(parseInt(forecastData[date].avgPM2_5));
    }
    // console.log(pm2_5)
    const pm2_5_avg = average(pm2_5);
    return (pm2_5_avg > 10);
}

// Temperature Analysis - hot/warm/cold
function getTempSentiment(forecastData) {
    let max = 0;
    let min = forecastData[Object.keys(forecastData)[0]].avgTemp;
    let weatherType = null;

    let tempRange = {};

    for (date in forecastData) {
        tempRange = forecastData[date].temperatureRange;
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
    var city = req.params.city;
    console.log(`Requesting weather forecast for ${city}...`);

    var forecastData = {};
    var willRain = false;
    var airPollutionData = {};
    var townLat = 0;
    var townLon = 0;


    axios.get(`${URL_base}/forecast?q=${city}&APPID=${API_key}`).then(
        (response) => {
            const { lat, lon } = response.data.city.coord;
            townLat = lat;
            townLon = lon;

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
                    willRain = true;
                    forecastData[date].rainfallLevels.push(weatherData[weatherEntry].rain['3h']);
                }

            }

        }
    ).then(() => {
        axios.get(`${URL_base}/air_pollution/forecast?lat=${townLat}&lon=${townLon}&APPID=${API_key}`).then((response1) => {
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

            for (date in forecastData) {

                // console.log(airPollutionData[date].pm2_5)
                forecastData[date].avgTemp = kelvin_to_celsius(average(forecastData[date].temperatures));
                forecastData[date].temperatureRange = min_max(forecastData[date].temperatures);
                forecastData[date].avgWind = average(forecastData[date].windSpeeds);
                forecastData[date].rainfallLevels = sum(forecastData[date].rainfallLevels);
                if (airPollutionData[date] !== null && airPollutionData[date] !== undefined)
                    forecastData[date].avgPM2_5 = average(airPollutionData[date].pm2_5);
            }

            // Get overall temperature weatherType and air pollution analysis
            tempSentiment = getTempSentiment(forecastData);
            maskAdvice = getMaskAdvice(forecastData);



            res.json({
                forecastData: forecastData,
                willRain: willRain,
                tempSentiment: tempSentiment,
                maskAdvice: maskAdvice
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