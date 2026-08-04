const dns = require("node:dns");
dns.setServers(["8.8.8.8", "8.8.4.4"]);

require('dotenv').config();
const express = require('express');
const cors = require('cors');


const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
const app = express();
app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 5000;

const uri = process.env.MONGODB_URI;

const client = new MongoClient(uri, {
    serverApi: {
        version: ServerApiVersion.v1,
        strict: true,
        deprecationErrors: true,
    },
});

app.get('/', (req, res) => {
    res.send("Server is here");
});

async function run() {
    try {
        await client.connect();
        await client.db('admin').command({ ping: 1 });
        console.log('Pinged your deployment. You successfully connected to MongoDB!');

        const carCollection = client.db("Car-Rental").collection("available-car");
        const carsCollection = client.db("Car-Rental").collection("add-car");


        app.get('/cars', async (req, res) => {
            const result = await carCollection.find().toArray();

            res.send(result);
        });

        app.get('/cars/:id', async (req, res) => {
            const id = req.params.id;
            const query = { _id: new ObjectId(id) };
            const result = await carCollection.findOne(query);
            res.send(result);
        });

        app.post("/new", async (req, res) => {
            try {
                const newCar = req.body;

                console.log(newCar);

                const result = await carsCollection.insertOne(newCar);

                res.status(201).send(result);
            } catch (error) {
                res.status(500).send({ message: error.message });
            }
        });



        app.listen(PORT, () => {
            console.log(`Server running on port ${PORT}`);
        });

    } catch (err) {
        console.error(err);
    }
}

run();