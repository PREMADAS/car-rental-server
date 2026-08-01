
const dns = require("node:dns");
dns.setServers(["8.8.8.8", "8.8.4.4"]);

require('dotenv').config();
const express = require('express');
const { MongoClient, ServerApiVersion } = require('mongodb');
const app = express();
const PORT = process.env.PORT;

const uri = process.env.MONGODB_URI;





const client = new MongoClient(uri, {
    serverApi: {
        version: ServerApiVersion.v1,
        strict: true,
        deprecationErrors: true,
    },
});


async function connectDB() {
    try {
        await client.connect();
        await client.db('admin').command({ ping: 1 });
        console.log('Pinged your deployment. You successfully connected to MongoDB!');
    } catch (err) {
        console.error(err);
    }
}
connectDB();

app.get('/', (req, res) => {
    res.send("Server is here")
})


app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`)
})

//s3jdtScOiOvW5c9P
//car-rental-server