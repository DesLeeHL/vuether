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
const kel_to_cel = k => Math.round((k - 273.12) * 100) / 100;
const min_max = (arr) => {
    const min = kel_to_cel(Math.min(...arr));
    const max = kel_to_cel(Math.max(...arr));
    return { min: min, max: max }
}


app.get('/', (req, res) => res.send('Weather App Server Side'));

app.get('/forecast/:city', getForecast);

app.listen(port, () => console.log(`Weather app listening on port ${port}!`));

//PM2_5 Analysis, mask advised if any day PM2_5 exceeds 10
function getMaskAdvice(airPollutionData) {
    for (date in airPollutionData) {
        if (!airPollutionData[date].pm2_5 === null && !airPollutionData[date].pm2_5 === undefined
            && airPollutionData[date].pm2_5>10)
                return true;
        return false;
    }
}

// Temperature Analysis - hot/mild/cold
function getTempSentiment(forecastData) {
    let max = 0;
    let min = forecastData[Object.keys(forecastData)[0]].avgTemp;
    let weatherType = null;

    let tempRange = {};

    for (date in forecastData) {
        tempRange = forecastData[date].tempRange;
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
    var cityLat = 0;
    var cityLon = 0;


    axios.get(`${URL_base}/forecast?q=${city}&APPID=${API_key}`).then(
        (response) => {
            const { lat, lon } = response.data.city.coord;
            cityLat = lat;
            cityLon = lon;

            var fetchedWeatherData = response.data.list;
            // Iterating over each day forecast

            var days = 0
            for (weatherEntry in fetchedWeatherData) {
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
                        temperatures: [],
                        windSpeeds: [],
                        rainfallLevels: []
                    }
                }

                forecastData[date].windSpeeds.push(fetchedWeatherData[weatherEntry].wind.speed);
                forecastData[date].temperatures.push(fetchedWeatherData[weatherEntry].main.temp);

                // Check if there is any rain
                if (fetchedWeatherData[weatherEntry].rain && fetchedWeatherData[weatherEntry].rain['3h']) {
                    willRain = true;
                    forecastData[date].rainfallLevels.push(fetchedWeatherData[weatherEntry].rain['3h']);
                }

            }

        }
    ).then(() => {
        axios.get(`${URL_base}/air_pollution/forecast?lat=${cityLat}&lon=${cityLon}&APPID=${API_key}`).then((responseAirPol) => {
            const fetchedAirPollutionData = responseAirPol.data.list;
            var days = 0
            for (airPollutionEntry of fetchedAirPollutionData) {
                let date = new Date(airPollutionEntry.dt * 1000);
                date.setHours(0, 0, 0, 0);
                date = date.toLocaleDateString();
                // Air pollution next 5 days
                if (days > 5) break;
                // Initiliazing if undefined or null
                if (!fetchedAirPollutionData[date]) {
                    days++;
                    fetchedAirPollutionData[date] = {
                        pm2_5: []
                    }
                }
                // console.log(airPollutionEntry.components.pm2_5)
                airPollutionData[date].pm2_5.push(parseInt(airPollutionEntry.components.pm2_5))
                // console.log(`${date} - PM2_5 - ${airPollutionEntry.components.pm2_5}`)
            }


            //  Calculating averages once compiled

            for (date in forecastData) {

                // console.log(fetchedAirPollutionData[date].pm2_5)
                forecastData[date].avgTemp = kel_to_cel(average(forecastData[date].temperatures));
                forecastData[date].tempRange = min_max(forecastData[date].temperatures);
                forecastData[date].avgWind = average(forecastData[date].windSpeeds);
                forecastData[date].rainfallLevels = sum(forecastData[date].rainfallLevels);
                
            }

            // Get overall temperature weatherType and air pollution analysis
            tempSentiment = getTempSentiment(forecastData);
            maskAdvised = getMaskAdvice(airPollutionData);



            res.json({
                forecastData: forecastData,
                willRain: willRain,
                tempSentiment: tempSentiment,
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