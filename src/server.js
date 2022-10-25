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
const min = arr => (Math.min(...arr));
const max = arr => (Math.max(...arr));


app.get('/', (req, res) => res.send('Weather App Server Side'));

app.get('/forecast/:city', getForecast);

app.listen(port, () => console.log(`Weather app listening on port ${port}!`));

//PM2_5 Analysis, mask advised if any day's avg PM2_5 exceeds 10
function getMaskAdvice(airPollutionData) {
    for (date in airPollutionData) {
        if (airPollutionData[date].avgPM2_5 !== null && airPollutionData[date].avgPM2_5 !== undefined
            && airPollutionData[date].avgPM2_5 > 10) {
            console.log(airPollutionData[date].avgPM2_5);
            return true;
        }
    }
    return false;
}

// Temperature Analysis - hot/mild/cold
function getTempSentiment(forecastData) {
    let max = forecastData[Object.keys(forecastData)[0]].maxTemp;
    let min = forecastData[Object.keys(forecastData)[0]].minTemp;
    let tempFeel = null;

    let tempRange = {};

    for (date in forecastData) {
        currMinTemp = forecastData[date].minTemp;
        currMaxTemp = forecastData[date].maxTemp;

        if (currMinTemp <= min)
            min = currMinTemp;
        if (currMaxTemp >= max)
            max = currMaxTemp;
    }

    if (max > 24) tempFeel = "hot";
    else if (min >= 12 && max <= 24) tempFeel = "mild";
    else tempFeel = "cold";

    return {
        tempFeel: tempFeel,
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
                        temperaturesK: [],
                        tempMinsK: [],
                        tempMaxsK: [],
                        windSpeeds: [],
                        rainfallLevels: []
                    }
                }

                forecastData[date].temperaturesK.push(fetchedWeatherData[weatherEntry].main.temp);
                forecastData[date].tempMinsK.push(fetchedWeatherData[weatherEntry].main.temp_min);
                forecastData[date].tempMaxsK.push(fetchedWeatherData[weatherEntry].main.temp_max);
                forecastData[date].windSpeeds.push(fetchedWeatherData[weatherEntry].wind.speed);

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
                if (!airPollutionData[date]) {
                    days++;
                    airPollutionData[date] = {
                        pm2_5: []
                    }
                }
                airPollutionData[date].pm2_5.push(parseInt(airPollutionEntry.components.pm2_5))
            }


            //  Calculating averages once compiled

            for (date in forecastData) {
                forecastData[date].avgTemp = kel_to_cel(average(forecastData[date].temperaturesK));
                //Getting min/max temperature by getting min/max of each day's min/max temps 
                forecastData[date].minTemp = kel_to_cel(min(forecastData[date].tempMinsK));
                forecastData[date].maxTemp = kel_to_cel(max(forecastData[date].tempMaxsK));
                forecastData[date].avgWind = average(forecastData[date].windSpeeds);
                forecastData[date].rainfallLevels = sum(forecastData[date].rainfallLevels);

            }

            for (date in airPollutionData) {
                if (airPollutionData[date].pm2_5 !== null && airPollutionData[date].pm2_5 !== undefined)
                    airPollutionData[date].avgPM2_5 = average(airPollutionData[date].pm2_5);
            }
            // Get overall temperature tempSentiment and air pollution analysis
            tempSentiment = getTempSentiment(forecastData);
            maskAdvised = getMaskAdvice(airPollutionData);



            res.json({
                forecastData: forecastData,
                willRain: willRain,
                tempSentiment: tempSentiment,
                maskAdvised: maskAdvised,
                airPollutionData: airPollutionData
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