const dns = require("node:dns");
dns.setServers(["8.8.8.8", "8.8.4.4"]);

require('dotenv').config();
const express = require('express');
const cors = require('cors');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const cookieParser = require('cookie-parser');


const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
const app = express();
app.use(cors({
    origin: "http://localhost:3000",
    credentials: true
}));
app.use(express.json());
app.use(cookieParser());

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
        const addCarCollection = client.db("Car-Rental").collection("add-car");
        const exploreCarCollection = client.db("Car-Rental").collection("explore-car");
        const userCollection = client.db("Car-Rental").collection("users");


        const verifyToken = (req, res, next) => {
            const token = req.cookies?.token;
            if (!token) {
                return res.status(401).send({ message: "Unauthorized access" });
            }
            jwt.verify(token, process.env.JWT_SECRET, (err, decoded) => {
                if (err) {
                    return res.status(401).send({ message: "Unauthorized access" });
                }
                req.decoded = decoded;
                next();
            });
        };

        app.post('/register', async (req, res) => {
            try {
                const { name, email, photoURL, password } = req.body;

                const existingUser = await userCollection.findOne({ email });
                if (existingUser) {
                    return res.status(400).send({ message: "User already exists" });
                }

                const hashedPassword = await bcrypt.hash(password, 10);

                const newUser = { name, email, photoURL, password: hashedPassword, createdAt: new Date() };
                const result = await userCollection.insertOne(newUser);

                res.status(201).send({ message: "User registered successfully" });
            } catch (error) {
                res.status(500).send({ message: error.message });
            }
        });

        app.post('/login', async (req, res) => {
            try {
                const { email, password } = req.body;

                const user = await userCollection.findOne({ email });
                if (!user) {
                    return res.status(401).send({ message: "Invalid email or password" });
                }

                const isPasswordValid = await bcrypt.compare(password, user.password);
                if (!isPasswordValid) {
                    return res.status(401).send({ message: "Invalid email or password" });
                }

                const token = jwt.sign(
                    { email: user.email, id: user._id },
                    process.env.JWT_SECRET,
                    { expiresIn: '7d' }
                );

                res.cookie('token', token, {
                    httpOnly: true,
                    secure: process.env.NODE_ENV === 'production',
                    sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'strict',
                });

                res.send({ message: "Login successful", user: { name: user.name, email: user.email } });
            } catch (error) {
                res.status(500).send({ message: error.message });
            }
        });

        app.post('/logout', (req, res) => {
            res.clearCookie('token', {
                httpOnly: true,
                secure: process.env.NODE_ENV === 'production',
                sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'strict',
            });
            res.send({ message: "Logged out successfully" });
        });



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

        app.post("/new", verifyToken, async (req, res) => {
            try {
                const newCar = req.body;
                newCar.email = req.decoded.email;
                const result = await addCarCollection.insertOne(newCar);
                res.status(201).send(result);
            } catch (error) {
                res.status(500).send({ message: error.message });
            }
        });
        app.get('/my-added-cars', verifyToken, async (req, res) => {
            const email = req.query.email;

            if (req.decoded.email !== email) {
                return res.status(403).send({ message: "Forbidden access" });
            }

            const query = { email: email };
            const result = await addCarCollection.find(query).toArray();
            res.send(result);
        });

        app.get('/me', verifyToken, async (req, res) => {
            const user = await userCollection.findOne({
                email: req.decoded.email,
            });

            if (!user) {
                return res.status(404).send({
                    message: "User not found",
                });
            }

            res.send({
                _id: user._id,
                name: user.name,
                email: user.email,
                photoURL: user.photoURL,
            });
        });



        app.get('/explore/:id', async (req, res) => {
            const id = req.params.id;
            const query = { _id: new ObjectId(id) };
            const result = await exploreCarCollection.findOne(query);
            res.send(result);
        });

        app.get('/explore', async (req, res) => {
            try {
                const { search, type, available } = req.query;
                const query = {};

                if (search) {
                    query.$or = [
                        { brand: { $regex: search, $options: "i" } },
                        { model: { $regex: search, $options: "i" } },
                    ];
                }

                if (type) {
                    query.category = { $in: type.split(",") };
                }
                if (available !== undefined) {
                    query.available = available === "true";
                }

                const result = await exploreCarCollection.find(query).toArray();
                res.send(result);
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