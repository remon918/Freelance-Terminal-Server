const express = require('express');
const cors = require('cors')
const app = express()
const port = 5000
require('dotenv').config()
app.use(cors())
app.use(express.json())

const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');

app.get('/', (req, res) => {
    res.send('Hello World!')
})



const uri = process.env.MONGODB_URI;

// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const client = new MongoClient(uri, {
    serverApi: {
        version: ServerApiVersion.v1,
        strict: true,
        deprecationErrors: true,
    }
});

async function run() {
    try {
        // Connect the client to the server	(optional starting in v4.7)
        await client.connect();



        const database = client.db('freelance_db');
        const tasksCollection = database.collection('tasks');
        const usersCollection = database.collection('user');


        // একটি নির্দিষ্ট আইডি দিয়ে সিঙ্গেল ফ্রিল্যান্সারের প্রোফাইল খোঁজার API
        app.get("/api/freelancers/:id", async (req, res) => {
            try {
                const id = req.params.id;

                // চেক করা আইডিটি মঙ্গোডিবি ObjectId ফরম্যাটে সঠিক কি না
                if (!ObjectId.isValid(id)) {
                    return res.status(400).send({ error: true, message: "Invalid Freelancer ID format" });
                }

                const query = { _id: new ObjectId(id), role: "freelancer" };
                const freelancer = await usersCollection.findOne(query, {
                    projection: { password: 0 } // নিরাপত্তার জন্য পাসওয়ার্ড বাদ দেওয়া হলো
                });

                if (!freelancer) {
                    return res.status(404).send({ error: true, message: "Freelancer not found" });
                }

                res.send(freelancer);
            } catch (error) {
                console.error("Error fetching freelancer details:", error);
                res.status(500).send({ error: true, message: "Internal server error" });
            }
        });

        app.get("/api/freelancers", async (req, res) => {
            try {
                // ফিল্টার করছি যেখানে role হবে 'freelancer'
                const query = { role: "freelancer" };

                // ড্যাশবোর্ডে দেখানোর জন্য দরকারি ফিল্ডগুলো প্রোজেক্ট করতে পারেন (নিরাপত্তার জন্য পাসওয়ার্ড বাদ দিতে)
                const freelancers = await usersCollection.find(query).project({
                    password: 0, // পাসওয়ার্ড ফিল্ড থাকলে তা বাদ দেবে
                }).toArray();

                res.send(freelancers);
            } catch (error) {
                console.error("Error fetching freelancers:", error);
                res.status(500).send({ error: true, message: "Internal server error" });
            }
        });


        // একটি নির্দিষ্ট আইডি দিয়ে সিঙ্গেল টাস্ক খোঁজার API
        app.get("/api/tasks/:id", async (req, res) => {
            try {
                const id = req.params.id;

                // চেক করা আইডিটি মঙ্গোডিবি ফরম্যাটে সঠিক কি না
                if (!ObjectId.isValid(id)) {
                    return res.status(400).send({ error: true, message: "Invalid Task ID format" });
                }

                const query = { _id: new ObjectId(id) };
                const task = await tasksCollection.findOne(query);

                if (!task) {
                    return res.status(404).send({ error: true, message: "Task not found" });
                }

                res.send(task);
            } catch (error) {
                console.error("Error fetching single task:", error);
                res.status(500).send({ error: true, message: "Internal server error" });
            }
        });

        app.get("/api/my-tasks", async (req, res) => {
            const { clientId } = req.query;

            if (!clientId) {
                return res.status(400).send({
                    message: "clientId is required",
                });
            }

            const tasks = await tasksCollection.find({
                clientId,
            }).toArray();

            res.send(tasks);
        });

        app.get("/api/tasks", async (req, res) => {
            const query = {};

            if (req.query.status) {
                query.status = req.query.status;
            }

            const tasks = await tasksCollection.find(query).toArray();

            res.send(tasks);
        });

        app.post("/api/tasks", async (req, res) => {
            try {
                const task = req.body;

                const existingTask = await tasksCollection.findOne({
                    title: task.title,
                    description: task.description,
                    client_email: task.client_email,
                });

                if (existingTask) {
                    return res.status(409).send({
                        success: false,
                        message: "Task already exists",
                    });
                }

                const result = await tasksCollection.insertOne(task);

                res.status(201).send({
                    success: true,
                    insertedId: result.insertedId,
                });
            } catch (error) {
                console.log(error);

                res.status(500).send({
                    success: false,
                    message: "Failed to create task",
                });
            }
        });



        // Send a ping to confirm a successful connection
        await client.db("admin").command({ ping: 1 });
        console.log("Pinged your deployment. You successfully connected to MongoDB!");
    } finally {
        // Ensures that the client will close when you finish/error
        // await client.close();
    }
}
run().catch(console.dir);



app.listen(port, () => {
    console.log(`Example app listening on port ${port}`)
})