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



        // ফ্রিল্যান্সার প্রোফাইল আপডেট করার API
        app.put("/api/freelancers/:id", async (req, res) => {
            try {
                const id = req.params.id;
                const updatedData = req.body;

                // আইডি ফরম্যাট চেক
                if (!ObjectId.isValid(id)) {
                    return res.status(400).send({ error: true, message: "Invalid Freelancer ID format" });
                }

                const filter = { _id: new ObjectId(id) };

                // মঙ্গোডিবির জন্য আপডেট অবজেক্ট তৈরি
                const updateDoc = {
                    $set: {
                        name: updatedData.name,
                        title: updatedData.title,
                        image: updatedData.image,
                        bio: updatedData.bio,
                        skills: updatedData.skills,
                        hourlyRate: Number(updatedData.hourlyRate),
                    },
                };

                const result = await usersCollection.updateOne(filter, updateDoc);

                if (result.matchedCount === 0) {
                    return res.status(404).send({ error: true, message: "Freelancer not found" });
                }

                res.send({ success: true, message: "Profile updated successfully" });
            } catch (error) {
                console.error("Error updating freelancer profile:", error);
                res.status(500).send({ error: true, message: "Internal server error" });
            }
        });

        app.get("/api/freelancers", async (req, res) => {
            try {
                const { search, minRate, maxRate, page, limit } = req.query;

                // পেজিনেশন ডিফল্ট ভ্যালু (১ পেজে ১২ জন ফ্রিল্যান্সার)
                const currentPage = parseInt(page) || 1;
                const currentLimit = parseInt(limit) || 12;
                const skip = (currentPage - 1) * currentLimit;

                // প্রাথমিক কোয়েরি (শুধু ফ্রিল্যান্সারদের নিবে)
                const query = { role: "freelancer" };

                // ১. সার্চ ফিল্টার (Name, Title বা Skills-এর মধ্যে খুঁজবে)
                if (search) {
                    query.$or = [
                        { name: { $regex: search, $options: "i" } },
                        { title: { $regex: search, $options: "i" } },
                        { skills: { $regex: search, $options: "i" } } // অ্যারে বা স্ট্রিং দুটাই হ্যান্ডেল করবে
                    ];
                }

                // ২. আওয়ার্লি রেট ফিল্টার
                if (minRate || maxRate) {
                    query.hourlyRate = {};
                    if (minRate) query.hourlyRate.$gte = Number(minRate);
                    if (maxRate) query.hourlyRate.$lte = Number(maxRate);
                }

                // ডাটা এবং টোটাল কাউন্ট একবারে আনার জন্য এগ্রিগেশন
                const pipeline = [
                    { $match: query },
                    { $project: { password: 0 } }, // পাসওয়ার্ড বাদ দেওয়া হলো
                    {
                        $facet: {
                            data: [
                                { $skip: skip },
                                { $limit: currentLimit }
                            ],
                            totalCount: [
                                { $count: "count" }
                            ]
                        }
                    }
                ];

                const aggregationResult = await usersCollection.aggregate(pipeline).toArray();

                const freelancers = aggregationResult[0].data;
                const totalResults = aggregationResult[0].totalCount[0]?.count || 0;
                const totalPages = Math.ceil(totalResults / currentLimit);

                res.send({
                    success: true,
                    freelancers,
                    totalResults,
                    totalPages,
                    currentPage,
                    limit: currentLimit
                });
            } catch (error) {
                console.error("Error fetching freelancers:", error);
                res.status(500).send({ error: true, message: "Internal server error" });
            }
        });


        // একটি নির্দিষ্ট আইডি দিয়ে সিঙ্গেল টাস্ক খোঁজার API
        // একটি নির্দিষ্ট আইডি দিয়ে সিঙ্গেল টাস্ক খোঁজার API (রিজেক্টেড প্রপোজাল ফিল্টারসহ)
        app.get("/api/tasks/:id", async (req, res) => {
            try {
                const id = req.params.id;

                if (!ObjectId.isValid(id)) {
                    return res.status(400).send({ error: true, message: "Invalid Task ID format" });
                }

                // এগ্রিগেশন ব্যবহার করে টাস্কের ভেতর থেকে Rejected প্রপোজালগুলো বাদ দেওয়া হচ্ছে
                const taskArray = await tasksCollection.aggregate([
                    { $match: { _id: new ObjectId(id) } },
                    {
                        $project: {
                            title: 1,
                            description: 1,
                            budget: 1,
                            deadline: 1,
                            category: 1,
                            status: 1,
                            clientId: 1,
                            client_email: 1,
                            // 🔥 এই লজিকটি কেবল "status !== Rejected" প্রপোজালগুলোকে রাখবে
                            proposals: {
                                $filter: {
                                    input: { $ifNull: ["$proposals", []] },
                                    as: "proposal",
                                    cond: { $ne: ["$$proposal.status", "Rejected"] }
                                }
                            }
                        }
                    }
                ]).toArray();

                if (!taskArray || taskArray.length === 0) {
                    return res.status(404).send({ error: true, message: "Task not found" });
                }

                // এগ্রিগেশন সবসময় অ্যারে দেয়, তাই ১ম এলিমেন্টটি অবজেক্ট আকারে পাঠানো হলো
                res.send(taskArray[0]);
            } catch (error) {
                console.error("Error fetching single task:", error);
                res.status(500).send({ error: true, message: "Internal server error" });
            }
        });


        app.delete("/api/tasks/:id", async (req, res) => {
            try {
                const { id } = req.params;

                if (!ObjectId.isValid(id)) {
                    return res.status(400).send({
                        success: false,
                        message: "Invalid Task ID",
                    });
                }

                const existingTask = await tasksCollection.findOne({
                    _id: new ObjectId(id),
                });

                if (!existingTask) {
                    return res.status(404).send({
                        success: false,
                        message: "Task not found",
                    });
                }

                if (existingTask.status !== "open") {
                    return res.status(403).send({
                        success: false,
                        message: "Only open tasks can be deleted",
                    });
                }

                const result = await tasksCollection.deleteOne({
                    _id: new ObjectId(id),
                });

                res.send({
                    success: true,
                    result,
                });
            } catch (error) {
                console.error(error);

                res.status(500).send({
                    success: false,
                    message: "Failed to delete task",
                });
            }
        });


        app.put("/api/tasks/:id", async (req, res) => {
            try {
                const { id } = req.params;
                const updatedTask = req.body;

                if (!ObjectId.isValid(id)) {
                    return res.status(400).send({
                        success: false,
                        message: "Invalid Task ID",
                    });
                }

                const existingTask = await tasksCollection.findOne({
                    _id: new ObjectId(id),
                });

                if (!existingTask) {
                    return res.status(404).send({
                        success: false,
                        message: "Task not found",
                    });
                }

                if (existingTask.status !== "open") {
                    return res.status(403).send({
                        success: false,
                        message: "Only open tasks can be edited",
                    });
                }

                const result = await tasksCollection.updateOne(
                    {
                        _id: new ObjectId(id),
                    },
                    {
                        $set: {
                            title: updatedTask.title,
                            description: updatedTask.description,
                            budget: updatedTask.budget,
                            deadline: updatedTask.deadline,
                            category: updatedTask.category,
                        },
                    }
                );

                res.send({
                    success: true,
                    result,
                });
            } catch (error) {
                console.error(error);

                res.status(500).send({
                    success: false,
                    message: "Failed to update task",
                });
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
            try {
                const { status, search, category, minBudget, maxBudget, page, limit } = req.query;

                // পেজিনেশন ডিফল্ট ভ্যালু সেটআপ
                const currentPage = parseInt(page) || 1;
                const currentLimit = parseInt(limit) || 6; // প্রতি পেজে ৬টা করে টাস্ক দেখাবে
                const skip = (currentPage - 1) * currentLimit;

                // প্রাথমিক কোয়েরি অবজেক্ট
                const query = {};

                // ১. স্ট্যাটাস ফিল্টার (যেমন: open)
                if (status) {
                    query.status = status;
                }

                // ২. সার্চ ফিল্টার (Title এবং Description দুইটার মধ্যেই খুঁজবে)
                if (search) {
                    query.$or = [
                        { title: { $regex: search, $options: "i" } },
                        { description: { $regex: search, $options: "i" } }
                    ];
                }

                // ৩. ক্যাটাগরি ফিল্টার
                if (category) {
                    query.category = category;
                }

                // ৪. বাজেট রেঞ্জ ফিল্টার (Min & Max range দিয়ে)
                if (minBudget || maxBudget) {
                    query.budget = {};
                    if (minBudget) query.budget.$gte = Number(minBudget);
                    if (maxBudget) query.budget.$lte = Number(maxBudget);
                }

                // ৫. এগ্রিগেশন পাইপলাইন তৈরি (ফিল্টারিং + Rejected প্রপোজাল বাদ দেওয়া + পেজিনেশন)
                const pipeline = [
                    { $match: query },
                    {
                        $project: {
                            title: 1,
                            description: 1,
                            budget: 1,
                            deadline: 1,
                            category: 1,
                            status: 1,
                            clientId: 1,
                            client_email: 1,
                            createdAt: 1,
                            // কেবল "status !== Rejected" প্রপোজালগুলোকে রাখবে
                            proposals: {
                                $filter: {
                                    input: { $ifNull: ["$proposals", []] },
                                    as: "proposal",
                                    cond: { $ne: ["$$proposal.status", "Rejected"] }
                                }
                            }
                        }
                    },
                    { $sort: { createdAt: -1 } }, // নতুন টাস্ক আগে দেখাবে
                    {
                        $facet: {
                            data: [
                                { $skip: skip },
                                { $limit: currentLimit }
                            ],
                            totalCount: [
                                { $count: "count" }
                            ]
                        }
                    }
                ];

                const aggregationResult = await tasksCollection.aggregate(pipeline).toArray();

                const tasks = aggregationResult[0].data;
                const totalResults = aggregationResult[0].totalCount[0]?.count || 0;
                const totalPages = Math.ceil(totalResults / currentLimit);

                // রেসপন্স অবজেক্ট পাঠানো
                res.send({
                    success: true,
                    tasks,
                    totalResults,
                    totalPages,
                    currentPage,
                    limit: currentLimit
                });
            } catch (error) {
                console.error("Error fetching tasks:", error);
                res.status(500).send({ error: true, message: "Internal server error" });
            }
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

                // ফ্রন্টএন্ড থেকে proposals না আসলেও ব্যাকএন্ড নিশ্চিত করবে যেন এটি একটি empty array হয়
                const finalTaskData = {
                    ...task,
                    proposals: task.proposals || []
                };

                const result = await tasksCollection.insertOne(finalTaskData);

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



        app.get("/api/my-proposals", async (req, res) => {
            try {
                const { email } = req.query;

                if (!email) {
                    return res.status(400).send({ error: true, message: "Freelancer email is required" });
                }

                const proposals = await tasksCollection.aggregate([
                    // ১. শুধু ফ্রিল্যান্সারের ইমেইল ম্যাচ করো (রিজেক্টেড ফিল্টার বাদ দেওয়া হলো)
                    { $match: { "proposals.freelancerEmail": email } },
                    { $unwind: "$proposals" },
                    { $match: { "proposals.freelancerEmail": email } },
                    {
                        $project: {
                            _id: 0,
                            taskId: "$_id",
                            taskTitle: "$title",
                            taskBudget: "$budget",
                            taskDeadline: "$deadline",
                            taskStatus: "$status",
                            proposalId: "$proposals.proposalId",
                            proposedBudget: "$proposals.proposedBudget",
                            estimatedDays: "$proposals.estimatedDays",
                            coverNote: "$proposals.coverNote",
                            status: "$proposals.status", // এখানে "Rejected" স্ট্যাটাস চলে আসবে
                            createdAt: "$proposals.createdAt"
                        }
                    },
                    { $sort: { createdAt: -1 } }
                ]).toArray();

                res.send(proposals);
            } catch (error) {
                console.error("Error fetching freelancer proposals:", error);
                res.status(500).send({ error: true, message: "Internal server error" });
            }
        });



        app.post("/api/proposals", async (req, res) => {
            try {
                const { taskId, proposedBudget, estimatedDays, coverNote, freelancerEmail } = req.body;

                // নতুন প্রপোজাল অবজেক্ট তৈরি
                const newProposal = {
                    proposalId: new ObjectId(),
                    freelancerEmail: freelancerEmail || "qisykapa@mailinator.com",
                    proposedBudget: Number(proposedBudget),
                    estimatedDays: Number(estimatedDays),
                    coverNote,
                    status: "Pending",
                    createdAt: new Date()
                };

                const filter = { _id: new ObjectId(taskId) };

                // $push ব্যবহার করায় এটি সরাসরি ডেটাবেজের proposals অ্যারেতে ঢুকে যাবে
                const updateDoc = {
                    $push: { proposals: newProposal }
                };

                const result = await tasksCollection.updateOne(filter, updateDoc);

                res.status(201).send({ success: true, message: "Proposal submitted successfully", data: newProposal });
            } catch (error) {
                res.status(500).send({ error: true, message: "Internal server error" });
            }
        });

        // ৪. নির্দিষ্ট প্রপোজালের স্ট্যাটাস আপডেট করার API (Reject/Accept এর জন্য)
        app.put("/api/proposals/:taskId/:proposalId", async (req, res) => {
            try {
                const { taskId, proposalId } = req.params;
                const { status } = req.body; // ফ্রন্টএন্ড থেকে পাঠানো হবে { "status": "Rejected" }

                // আইডিগুলোর ফরম্যাট ভ্যালিডেশন চেক
                if (!ObjectId.isValid(taskId) || !ObjectId.isValid(proposalId)) {
                    return res.status(400).send({ error: true, message: "Invalid Task ID or Proposal ID format" });
                }

                if (!status) {
                    return res.status(400).send({ error: true, message: "Status is required" });
                }

                // টাস্ক আইডি এবং তার ভেতরের নির্দিষ্ট প্রপোজাল আইডি ম্যাচ করার ফিল্টার
                const filter = {
                    _id: new ObjectId(taskId),
                    "proposals.proposalId": new ObjectId(proposalId)
                };

                // মঙ্গোডিবির পজিশনাল অপারেটর ($) দিয়ে নির্দিষ্ট প্রপোজালের স্ট্যাটাস আপডেট
                const updateDoc = {
                    $set: { "proposals.$.status": status }
                };

                const result = await tasksCollection.updateOne(filter, updateDoc);

                if (result.matchedCount === 0) {
                    return res.status(404).send({ error: true, message: "Task or Proposal not found" });
                }

                res.status(200).send({ success: true, message: `Proposal status updated to ${status}` });
            } catch (error) {
                console.error("Error updating proposal status:", error);
                res.status(500).send({ error: true, message: "Internal server error" });
            }
        });

        // ৫. নির্দিষ্ট প্রপোজালের আইডি দিয়ে তার ডিটেইলস (এবং টাস্কের টাইটেল) খোঁজার API
        app.get("/api/proposals/details/:proposalId", async (req, res) => {
            try {
                const { proposalId } = req.params;

                // আইডি ফরম্যাট চেক
                if (!ObjectId.isValid(proposalId)) {
                    return res.status(400).send({
                        success: false,
                        message: "Invalid Proposal ID format"
                    });
                }

                // মঙ্গোডিবি এগ্রিগেশন পাইপলাইন
                const proposalData = await tasksCollection.aggregate([
                    // ১. ওই টাস্কটি খুঁজে বের করো যার ভেতরে এই proposalId-টি আছে
                    { $match: { "proposals.proposalId": new ObjectId(proposalId) } },

                    // ২. proposals অ্যারেটিকে ভেঙ্গে সিঙ্গেল অবজেক্টে রূপান্তর করো
                    { $unwind: "$proposals" },

                    // ৩. এবার ভেঙ্গে যাওয়া অবজেক্টগুলো থেকে নিখুঁতভাবে আইডি ম্যাচ করো
                    { $match: { "proposals.proposalId": new ObjectId(proposalId) } },

                    // ৪. ফ্রন্টএন্ডের সুবিধার জন্য ডাটা স্ট্রাকচার সুন্দর করে সাজিয়ে নাও (Project)
                    {
                        $project: {
                            _id: 0,
                            taskId: "$_id",
                            taskTitle: "$title",
                            taskBudget: "$budget",
                            taskDeadline: "$deadline",
                            proposalId: "$proposals.proposalId",
                            freelancerEmail: "$proposals.freelancerEmail",
                            proposedBudget: "$proposals.proposedBudget",
                            estimatedDays: "$proposals.estimatedDays",
                            coverNote: "$proposals.coverNote",
                            status: "$proposals.status",
                            createdAt: "$proposals.createdAt"
                        }
                    }
                ]).toArray();

                // যদি কোনো ডাটা খুঁজে না পাওয়া যায়
                if (!proposalData || proposalData.length === 0) {
                    return res.status(404).send({
                        success: false,
                        message: "Proposal not found"
                    });
                }

                // এগ্রিগেশন সবসময় অ্যারে দেয়, তাই ১ম এলিমেন্টটি অবজেক্ট আকারে রেসপন্স পাঠানো হলো
                res.status(200).send({
                    success: true,
                    data: proposalData[0]
                });

            } catch (error) {
                console.error("Error fetching single proposal details:", error);
                res.status(500).send({
                    success: false,
                    message: "Internal server error"
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