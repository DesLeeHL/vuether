require("dotenv").config()
const axios = require('axios')
const cors = require('cors');
const express = require('express');
const { get } = require("http");
const app = express();
app.use(cors());
const port = 3000

const URL_base = `https://api.openweathermap.org/data/2.5`
const API_key = process.env.OPENWEATHER_API_KEY

// Functions for temperature calculations
const average = arr => (arr.reduce((p, c) => p + c, 0) / arr.length).toFixed(2);
const sum = arr => (arr.reduce((p, c) => p + c, 0)).toFixed(2);
const kel_to_cel = k => Math.round((k - 273.12) * 100) / 100;
const min = arr => (Math.min(...arr));
const max = arr => (Math.max(...arr));
// formatting date from seconds
function dtToDate(dt) {
    let date = new Date(dt * 1000);
    date.setHours(0, 0, 0, 0);
    return date.toLocaleDateString();
}
//get timeZone from DT dt
function timezoneFromDT(dt){
    let sign = 1;
    if(dt<0) sign = -1;
    let date=new Date(Math.abs(dt)*1000);
    let hr = date.getHours()-1;
    return hr*sign;
}
//get hour and minute from dt
function timeFromDT(dt){
    let date=new Date(dt*1000);
    let hrMin = date.getHours()+':'+date.getMinutes()+':'+date.getSeconds();
    return hrMin;
}
app.get('/', (req, res) => res.send('Vuether Backend'));
app.get('/forecast/:city', getForecast);
app.listen(port, () => console.log(`Vuether listening on port ${port}!`));

//PM2_5, mask advised if any day's avg PM2_5 exceeds 10
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

// Temperature Sentiment - hot/mild/cold
function getTempSentiment(forecastData) {
    let max = forecastData[Object.keys(forecastData)[0]].maxTemp;
    let min = forecastData[Object.keys(forecastData)[0]].minTemp;
    let tempFeel = null;

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
    console.log(`Requesting weather forecast data for ${city} from OpenWeather...`);

    var forecastData = {};
    var airPollutionData = {};
    var willRain = false;
    var cityLat = 0;
    var cityLon = 0;
    var cityInfo={}

    axios.get(`${URL_base}/forecast?q=${city}&APPID=${API_key}`).then(
        (response) => {
            const { lat, lon } = response.data.city.coord;
            cityLat = lat;
            cityLon = lon;

            //Innovative Feature
            //get city information
            cityInfo.name=response.data.city.name;
            cityInfo.country=response.data.city.country
            cityInfo.lat=lat;
            cityInfo.lon=lon;
            cityInfo.timeZone=timezoneFromDT(response.data.city.timezone);
            console.log("TimeZOne:",response.data.city.timezone)
            console.log("SR:",response.data.city.sunrise)
            console.log("SR:",response.data.city.sunset)

            cityInfo.sunRise=timeFromDT(response.data.city.sunrise+response.data.city.timezone-3600);
            cityInfo.sunSet=timeFromDT(response.data.city.sunset+response.data.city.timezone-3600);

            var fetchedWeatherData = response.data.list;

            // Loop through forecast of each day
            var days = 0
            for (weatherEntry in fetchedWeatherData) {
                date = dtToDate(response.data.list[weatherEntry].dt);
                // Forecast for only today and the next 4 days
                if (days > 4) break;
                // Init forecast data for a day if undefined or null
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

                // Add rain level if any rain
                if (fetchedWeatherData[weatherEntry].rain && fetchedWeatherData[weatherEntry].rain['3h']) {
                    willRain = true;
                    forecastData[date].rainfallLevels.push(fetchedWeatherData[weatherEntry].rain['3h']);
                }

            }

        }
        //after weather forecast, get air pollution data with lat and lon
    ).then(() => {
        axios.get(`${URL_base}/air_pollution/forecast?lat=${cityLat}&lon=${cityLon}&APPID=${API_key}`).then((responseAirPol) => {
            const fetchedAirPollutionData = responseAirPol.data.list;
            var days = 0
            for (airPollutionEntry of fetchedAirPollutionData) {
                date = dtToDate(airPollutionEntry.dt);
                // Air pollution next 5 days
                if (days > 5) break;
                // Init air pollution data if undefined or null
                if (!airPollutionData[date]) {
                    days++;
                    airPollutionData[date] = {
                        pm2_5: []
                    }
                }
                airPollutionData[date].pm2_5.push(parseInt(airPollutionEntry.components.pm2_5))
            }

            //  Calculate daily averages
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
            // Overall temperature sentiment (4 days) and mask advice (5 days)
            tempSentiment = getTempSentiment(forecastData);
            maskAdvised = getMaskAdvice(airPollutionData);

            res.json({
                forecastData: forecastData,
                willRain: willRain,
                tempSentiment: tempSentiment,
                maskAdvised: maskAdvised,
                airPollutionData: airPollutionData,
                cityInfo: cityInfo
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