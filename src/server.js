import dotenv from "dotenv"
import axios from "axios"
import express from "express"
import path from "path"
import {get} from "http"

dotenv.config()

const app = express()
const port = 3000
const API_key = process.env.OPENWEATHER_API_KEY
const URL_base = 'https://api.openweathermap.org/data/2.5'

const average = arr => arr.reduce((p, c) => p + c, 0) / arr.length
const sum = arr => arr.reduce((p, c) => p + c, 0)
const kel_to_cel = k => Math.round((k - 273.12) * 100) / 100
const min_max = (arr) => {
    const min = kel_to_cel(Math.min(...arr))
    const max = kel_to_cel(Math.max(...arr))
    return { min: min, max: max }
}

const city = 'Dublin'

app.get('/', (req, res) => res.send('Vuether Server'))
app.get('/forecast/:city', getForecast)

app.listen(port, () => console.log(`Example app listening on port ${port}!`))

function getMaskAdvise(forecastData) {
    let pm25 = []
    for (dateEntry in forecastData) {
        pm25.push(forecastData[dateEntry].averagePM2_5)
    }
    // console.log(pm2_5)
    const pm25_avg = average(pm25)
    return pm25_avg > 10
}

function getTemperaturesSummary(forecastData) {
    let max = 0
    let min = forecastData[Object.keys(forecastData)[0]].averageTemp
    let sentiment = null

    let minMaxObj = {}

    // Loop over every day getting the absolute min and max values
    for (dateEntry in forecastData) {
        minMaxObj = forecastData[dateEntry].temperatureRange
        // Check if the max on this day is more than current max
        if (minMaxObj.max >= max)
            max = minMaxObj.max
        // Check if the min on this day is more than current max
        if (minMaxObj.min <= min)
            min = minMaxObj.min
    }

    if (max >= 20.0)
        sentiment = "hot"
    else if (max <= 20.0 && min >= 10.0)
        sentiment = "warm"
    else
        sentiment = "cold"

    return {
        sentiment: sentiment,
        max: max,
        min: min
    }
}

// axios.get(`${URL_base}/forecast?q=${city}&APPID=${API_key}`).then((response) => {
//     console.log(`Forecast in ${city}`)
//     console.log(response.data)
// })

function getForecast(req, res) {
    let city = req.params.city
    console.log(`Getting weather forecast for ${city} ...`)

    let forcastData = {}
    let willRain = false
    let forecastSentiment = null
    let airPolData = {}
    var latitude, longitude = 0

    axios.get(`${URL_base}/forecast?q=${city}&APPID=${API_key}`).then(
        (response) => {
            const { latitude, longitude } = response.data.city.coord
            latitude = latitude
            longitude = longitude
            // const airPollution = getAirPollutionForecast(latitude, longitude)

            var weatherData = response.data.list

            //  Loop over OpenWeather API response and extract data for each day
            for (weatherEntry in weatherData) {
                // Make the date look nicer for front-end
                let date = new Date(response.data.list[weatherEntry].dt * 1000)
                date.setHours(0, 0, 0, 0)
                date = date.toLocaleDateString()

                // First check if there is a date entry for the given date, if not create one
                if (!forecastSummary[date]) {
                    forecastSummary[date] = {
                        temperatures: [],
                        windSpeeds: [],
                        rainfallLevels: [],
                    }
                }

                // Extract temperature and wind speed data
                forecastSummary[date].temperatures.push(weatherData[weatherEntry].main.temp)
                forecastSummary[date].windSpeeds.push(weatherData[weatherEntry].wind.speed)

                // Check if there is any rain
                if (weatherData[weatherEntry].rain && weatherData[weatherEntry].rain['3h']) {
                    isRain = true
                    forecastSummary[date].rainfallLevels.push(weatherData[weatherEntry].rain['3h'])
                }

            }
        }
    ).catch((error) => {
        console.log(error)
        res.status(400)
        res.json({
            error: "Bad Request!"
        })
    })

    axios.get(`${URL_base}/air_pollution/forecast?latitude=${latitude}&longitude=${longitude}&APPID=${API_key}`).then((response1) => {
        const airPollutionData = response1.data.list
        for (airPollutionEntry of airPollutionData) {
            let date = new Date(airPollutionEntry.dt * 1000)
            date.setHours(0, 0, 0, 0)
            date = date.toLocaleDateString()

            // First check if there is a date entry for the given date, if not create one
            if (!airPollutionSummary[date]) {
                airPollutionSummary[date] = {
                    pm2_5: []
                }
            }
            // Extract temperature and wind speed data
            airPollutionSummary[date].pm2_5.push(airPollutionEntry.components.pm2_5)
            // console.log(`${date} - PM2_5 - ${airPollutionEntry.components.pm2_5}`)
        }

        // When finished extracting data, calculate averages
        for (dateEntry in forecastSummary) {
            forecastSummary[dateEntry].averageTemp = kelvin_to_celsius(average(forecastSummary[dateEntry].temperatures))
            forecastSummary[dateEntry].averageWind = average(forecastSummary[dateEntry].windSpeeds)
            forecastSummary[dateEntry].rainfallLevels = sum(forecastSummary[dateEntry].rainfallLevels)
            forecastSummary[dateEntry].temperatureRange = min_max(forecastSummary[dateEntry].temperatures)
            forecastSummary[dateEntry].averagePM2_5 = average(airPollutionSummary[dateEntry].pm2_5)
        }

        // Get overall temperature sentiment
        temperatureSummary = getTemperaturesSummary(forecastSummary)
        maskAdvised = getMaskAdvise(forecastSummary)


        res.json({
            forecastSummary: forecastSummary,
            isRain: isRain,
            temperatureSummary: temperatureSummary,
            maskAdvised: maskAdvised
        })

    }).catch((error) => {
        console.error(error)
        res.status(400)
        res.json({
            error: "Bad Request!"
        })
    })
}