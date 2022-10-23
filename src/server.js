import dotenv  from "dotenv"
import axios  from "axios"
import express from "express"
import path  from "path"

dotenv.config()

const app = express();
const port = 3000
const API_key = process.env.OPENWEATHER_API_KEY
const url = 'https://api.openweathermap.org/data/2.5'



const city = 'Dublin'

axios.get(`${url}/forecast?q=${city}&APPID=${API_key}`).then((response) => {
    console.log(`Forecast in ${city}`)
    console.log(response.data)
})

function getForcast(req, res) {
    let city = req.params.city
    console.log(`Getting weather forecast for ${city}`)

    let forcastSumm = {}
    let willRain = false
    let forecastSentiment = null

    axios.get(`${base_url}/forecast?q=${city}&APPID=${API_key}`).then(
        (response) => {
            res.json({
                data: response.data
            })
        }
    ).catch((error) => {
        console.log(error);
        res.status(400);
        res.json({
            error: "Bad Request!"
        });
    })
}