require('dotenv').config();
const express = require('express');
const cors = require('cors');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const cookieParser = require('cookie-parser');
const { OAuth2Client } = require('google-auth-library');
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');

const app = express();


app.set('trust proxy', 1);

const googleClient = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);

app.use(
    cors({
        origin: [
            "http://localhost:5173",
            "http://localhost:3000",
            "https://car-rental-platform-client.vercel.app"
        ],
        credentials: true
    })
);

app.use(express.json());
app.use(cookieParser());

const PORT = process.env.PORT || 5000;
const uri = process.env.MONGODB_URI;

// MongoDB Client Setup
const client = new MongoClient(uri, {
    serverApi: {
        version: ServerApiVersion.v1,
        strict: true,
        deprecationErrors: true,
    },
});


let carCollection, addCarCollection, exploreCarCollection, userCollection, bookingsCollection;

async function connectDB() {
    if (!carCollection) {
        await client.connect();
        const db = client.db("Car-Rental");
        carCollection = db.collection("available-car");
        addCarCollection = db.collection("add-car");
        exploreCarCollection = db.collection("explore-car");
        userCollection = db.collection("users");
        bookingsCollection = db.collection("bookings");
        console.log("Connected to MongoDB!");
    }
}


app.use(async (req, res, next) => {
    try {
        await connectDB();
        next();
    } catch (err) {
        res.status(500).send({ message: "Database Connection Error", error: err.message });
    }
});


const cookieOptions = {
    httpOnly: true,
    secure: true,
    sameSite: 'lax',
    maxAge: 7 * 24 * 60 * 60 * 1000,
};


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


app.get('/', (req, res) => {
    res.send("Server is running successfully");
});


app.post('/register', async (req, res) => {
    try {
        const { name, email, photoURL, password } = req.body;
        if (!name || !email || !password || password.length < 6) {
            return res.status(400).send({ message: "Invalid input" });
        }

        const existingUser = await userCollection.findOne({ email });
        if (existingUser) {
            return res.status(400).send({ message: "User already exists" });
        }

        const hashedPassword = await bcrypt.hash(password, 10);
        const newUser = { name, email, photoURL, password: hashedPassword, createdAt: new Date() };
        await userCollection.insertOne(newUser);

        res.status(201).send({ message: "User registered successfully" });
    } catch (error) {
        res.status(500).send({ message: "Something went wrong" });
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

        res.cookie('token', token, cookieOptions);

        res.send({ message: "Login successful", user: { name: user.name, email: user.email } });
    } catch (error) {
        res.status(500).send({ message: "Something went wrong" });
    }
});

app.post('/google-login', async (req, res) => {
    try {
        const { credential } = req.body;
        const ticket = await googleClient.verifyIdToken({
            idToken: credential,
            audience: process.env.GOOGLE_CLIENT_ID,
        });

        const payload = ticket.getPayload();
        const { email, name, picture } = payload;

        let user = await userCollection.findOne({ email });
        if (!user) {
            const newUser = {
                name,
                email,
                photoURL: picture,
                password: null,
                provider: "google",
                createdAt: new Date(),
            };
            const result = await userCollection.insertOne(newUser);
            user = { ...newUser, _id: result.insertedId };
        }

        const token = jwt.sign(
            { email: user.email, id: user._id },
            process.env.JWT_SECRET,
            { expiresIn: '7d' }
        );

        res.cookie('token', token, cookieOptions);

        res.send({
            message: "Google login successful",
            user: { name: user.name, email: user.email },
        });
    } catch (error) {
        res.status(500).send({ message: "Something went wrong" });
    }
});

app.post('/logout', (req, res) => {
    res.clearCookie('token', cookieOptions);
    res.send({ message: "Logged out successfully" });
});

// App / Car Routes
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
        newCar.booking_count = 0;
        const result = await addCarCollection.insertOne(newCar);
        res.status(201).send(result);
    } catch (error) {
        res.status(500).send({ message: "Something went wrong" });
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

app.get('/my-added-cars/:id', verifyToken, async (req, res) => {
    try {
        const id = req.params.id;
        const query = { _id: new ObjectId(id) };
        const car = await addCarCollection.findOne(query);

        if (!car) {
            return res.status(404).send({ message: "Car not found" });
        }
        if (car.email !== req.decoded.email) {
            return res.status(403).send({ message: "Forbidden access" });
        }

        res.send(car);
    } catch (error) {
        res.status(500).send({ message: "Something went wrong" });
    }
});

app.patch('/my-added-cars/:id', verifyToken, async (req, res) => {
    try {
        const id = req.params.id;
        const query = { _id: new ObjectId(id) };

        const existingCar = await addCarCollection.findOne(query);
        if (!existingCar) {
            return res.status(404).send({ message: "Car not found" });
        }
        if (existingCar.email !== req.decoded.email) {
            return res.status(403).send({ message: "Forbidden access" });
        }

        const { pricePerDay, description, available, image, carType, location } = req.body;
        const updateDoc = {
            $set: {
                pricePerDay: Number(pricePerDay),
                description,
                available,
                image,
                carType,
                location,
            },
        };

        const result = await addCarCollection.updateOne(query, updateDoc);
        res.send(result);
    } catch (error) {
        res.status(500).send({ message: "Something went wrong" });
    }
});

app.delete('/my-added-cars/:id', verifyToken, async (req, res) => {
    try {
        const id = req.params.id;
        const query = { _id: new ObjectId(id) };

        const existingCar = await addCarCollection.findOne(query);
        if (!existingCar) {
            return res.status(404).send({ message: "Car not found" });
        }
        if (existingCar.email !== req.decoded.email) {
            return res.status(403).send({ message: "Forbidden access" });
        }

        const result = await addCarCollection.deleteOne(query);
        res.send(result);
    } catch (error) {
        res.status(500).send({ message: "Something went wrong" });
    }
});

app.get('/me', verifyToken, async (req, res) => {
    const user = await userCollection.findOne({ email: req.decoded.email });
    if (!user) {
        return res.status(404).send({ message: "User not found" });
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
        res.status(500).send({ message: "Something went wrong" });
    }
});

app.post('/bookings', verifyToken, async (req, res) => {
    try {
        const booking = req.body;

        if (booking.userEmail && booking.userEmail !== req.decoded.email) {
            return res.status(403).send({ message: "Forbidden access" });
        }

        booking.userEmail = req.decoded.email;
        booking.createdAt = new Date();
        booking.status = "pending";

        const result = await bookingsCollection.insertOne(booking);

        if (booking.carId) {
            await exploreCarCollection.updateOne(
                { _id: new ObjectId(booking.carId) },
                { $inc: { booking_count: 1 } }
            );
        }

        res.send(result);
    } catch (error) {
        res.status(500).send({ message: "Something went wrong" });
    }
});

app.get('/bookings', verifyToken, async (req, res) => {
    const email = req.query.email;
    if (req.decoded.email !== email) {
        return res.status(403).send({ message: "Forbidden access" });
    }

    const query = { userEmail: email };
    const result = await bookingsCollection.find(query).toArray();
    res.send(result);
});


if (process.env.NODE_ENV !== 'production') {
    app.listen(PORT, () => {
        console.log(`Server running on port ${PORT}`);
    });
}


module.exports = app;