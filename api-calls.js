require("dotenv").config()
const API_key=process.env_key=OPENWEATHER_API_KEY
const url='https://api.openweathermap.org/data/3.0'

const axios = require('axios')

const city = 'Dublin'
axios.get(`${base_url}/forecast?q=${city}&APPID=${API_key}`).then((response) => {
    console.log(`Forecast in ${city}`)
    console.log(response.data)
})
