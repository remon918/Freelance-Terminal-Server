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
        const paymentCollection = database.collection("payment")


        app.get("/api/admin/users", async (req, res) => {
            try {
                // এখানে সব ইউজার ব্যাক করবে (সিকিউরিটির জন্য পাসওয়ার্ড বাদ দেওয়া হয়েছে)
                const users = await usersCollection.find({}, { projection: { password: 0 } }).toArray();
                res.status(200).json({ success: true, users });
            } catch (error) {
                console.error("Error fetching admin users:", error);
                res.status(500).json({ success: false, message: "Internal server error" });
            }
        });

        app.patch("/api/admin/users/:id/status", async (req, res) => {
            try {
                const { id } = req.params;
                const { status } = req.body; // ফ্রন্টএন্ড থেকে 'Active' অথবা 'Blocked' আসবে

                if (!ObjectId.isValid(id)) {
                    return res.status(400).json({ success: false, message: "Invalid User ID format" });
                }

                if (!status || (status !== "Active" && status !== "Blocked")) {
                    return res.status(400).json({ success: false, message: "Invalid status value" });
                }

                const filter = { _id: new ObjectId(id) };
                const updateDoc = {
                    $set: {
                        status: status // ডাটাবেজে ইউজারের স্ট্যাটাস আপডেট হবে
                    }
                };

                const result = await usersCollection.updateOne(filter, updateDoc);

                if (result.matchedCount === 0) {
                    return res.status(404).json({ success: false, message: "User not found" });
                }

                res.status(200).json({ success: true, message: `User status updated to ${status}` });
            } catch (error) {
                console.error("Error updating user status:", error);
                res.status(500).json({ success: false, message: "Internal server error" });
            }
        });

        app.get("/api/admin/tasks", async (req, res) => {
            try {
                // সরাসরি কালেকশন থেকে সব টাস্ক খুঁজে নেওয়া (কোনো ডুপ্লিকেট তৈরি হবে না)
                const tasks = await tasksCollection.find({}).sort({ createdAt: -1 }).toArray();

                // ফ্রন্টএন্ড ড্রপডাউন এবং টেবিলের ফিল্ডের সাথে ডেটা মেলানো
                const formattedTasks = tasks.map(task => {
                    // ১. ক্যাটাগরি ম্যাপিং সেফটি (UI/UX Design বা Design যাই থাকুক, ড্রপডাউনের সাথে মিলানো)
                    let cleanCategory = task.category ? String(task.category).trim() : "Other";
                    const lowerCat = cleanCategory.toLowerCase();

                    if (lowerCat.includes("dev") || lowerCat.includes("web") || lowerCat.includes("soft")) {
                        cleanCategory = "Development";
                    } else if (lowerCat.includes("design") || lowerCat.includes("ui") || lowerCat.includes("ux")) {
                        cleanCategory = "Design";
                    } else if (lowerCat.includes("writ") || lowerCat.includes("content")) {
                        cleanCategory = "Writing";
                    } else if (lowerCat.includes("market") || lowerCat.includes("seo") || lowerCat.includes("ads")) {
                        cleanCategory = "Marketing";
                    } else {
                        cleanCategory = "Other";
                    }

                    return {
                        _id: task._id,
                        title: task.title,
                        category: cleanCategory,
                        budget: task.budget,
                        status: task.status ? String(task.status).trim() : "Open",
                        proposals: task.proposals, // প্রপোজাল অ্যারে সরাসরি পাস করা হলো
                        createdAt: task.createdAt,
                        // আপনার ডেটাবেজের client_email কে ফ্রন্টএন্ডের clientEmail এ ম্যাপ করা হলো
                        clientEmail: task.client_email || "no-email@domain.com"
                    };
                });

                res.status(200).json({ success: true, tasks: formattedTasks });
            } catch (error) {
                console.error("Error fetching tasks:", error);
                res.status(500).json({ success: false, message: "Internal server error" });
            }
        });

        // ২. কোনো নির্দিষ্ট টাস্ক ডিলিট করার API
        app.delete("/api/admin/tasks/:id", async (req, res) => {
            try {
                const { id } = req.params;
                if (!ObjectId.isValid(id)) {
                    return res.status(400).json({ success: false, message: "Invalid Task ID" });
                }

                const result = await tasksCollection.deleteOne({ _id: new ObjectId(id) });

                if (result.deletedCount === 0) {
                    return res.status(404).json({ success: false, message: "Task not found" });
                }

                res.status(200).json({ success: true, message: "Task deleted successfully" });
            } catch (error) {
                console.error("Error deleting task:", error);
                res.status(500).json({ success: false, message: "Internal server error" });
            }
        });

        app.post("/api/payment", async (req, res) => {
            try {
                const { sessionId, userId, userEmail, priceId, taskId, proposalId } = req.body;

                if (!sessionId || !taskId) {
                    return res.status(400).json({ success: false, msg: "Missing required fields" });
                }

                const isExist = await paymentCollection.findOne({ sessionId });
                if (isExist) {
                    return res.status(400).json({ success: false, msg: "Already Exist!" });
                }

                if (!ObjectId.isValid(taskId)) {
                    return res.status(400).json({ success: false, msg: "Invalid Task ID format" });
                }

                await paymentCollection.insertOne({
                    sessionId,
                    userEmail,
                    userId,
                    priceId,
                    taskId: new ObjectId(taskId), // ObjectId তে কনভার্ট করে সেভ করুন
                    proposalId: proposalId && ObjectId.isValid(proposalId) ? new ObjectId(proposalId) : proposalId,
                    createdAt: new Date()
                });

                const filter = { _id: new ObjectId(taskId) };
                let updateDoc = {};
                let options = {};

                if (proposalId && ObjectId.isValid(proposalId)) {
                    updateDoc = {
                        $set: {
                            status: "Accepted",
                            // নির্দিষ্ট প্রপোজালটি Accepted হবে
                            "proposals.$[elem].status": "Accepted",
                            // বাকি সব 'Pending' প্রপোজাল অটোমেটিক 'Rejected' হয়ে যাবে
                            "proposals.$[other].status": "Rejected"
                        }
                    };
                    options = {
                        arrayFilters: [
                            { "elem.proposalId": new ObjectId(proposalId) },
                            { "other.proposalId": { $ne: new ObjectId(proposalId) }, "other.status": "Pending" }
                        ]
                    };
                } else {
                    updateDoc = { $set: { status: "Accepted" } };
                }

                const result = await tasksCollection.updateOne(filter, updateDoc, options);

                if (result.matchedCount === 0) {
                    return res.status(404).json({ success: false, msg: "Task not found!" });
                }

                res.status(200).json({ success: true, msg: "Status updated globally across the website!" });

            } catch (error) {
                console.error("Global Payment API Error:", error);
                res.status(500).json({ success: false, message: "Internal server error" });
            }
        });

        app.get("/api/payment-history", async (req, res) => {
            try {
                const { email } = req.query;
                if (!email) {
                    return res.status(400).send({ success: false, message: "Client email is required" });
                }

                const paymentData = await paymentCollection.aggregate([
                    { $match: { userEmail: email } },
                    {
                        $addFields: {
                            taskObjectId: {
                                $cond: {
                                    if: { $eq: [{ $type: "$taskId" }, "string"] },
                                    then: { $toObjectId: "$taskId" },
                                    else: "$taskId"
                                }
                            }
                        }
                    },
                    {
                        $lookup: {
                            from: "tasks",
                            localField: "taskObjectId",
                            foreignField: "_id",
                            as: "taskDetails"
                        }
                    },
                    { $unwind: { path: "$taskDetails", preserveNullAndEmptyArrays: true } },
                    { $sort: { createdAt: -1 } },
                    {
                        $facet: {
                            history: [
                                {
                                    $project: {
                                        _id: 1,
                                        sessionId: 1,
                                        createdAt: 1,
                                        taskTitle: { $ifNull: ["$taskDetails.title", "Unknown Task"] },
                                        amount: { $ifNull: ["$taskDetails.budget", 0] }
                                    }
                                }
                            ],
                            totalSpend: [
                                {
                                    $group: {
                                        _id: null,
                                        total: { $sum: { $ifNull: ["$taskDetails.budget", 0] } }
                                    }
                                }
                            ]
                        }
                    }
                ]).toArray();

                const history = paymentData[0]?.history || [];
                const totalSpend = paymentData[0]?.totalSpend[0]?.total || 0;

                res.status(200).send({ success: true, history, totalSpend });
            } catch (error) {
                console.error("Error fetching payment history:", error);
                res.status(500).send({ success: false, message: "Internal server error" });
            }
        });

        app.get("/api/freelancer-earnings", async (req, res) => {
            try {
                const { email } = req.query;
                if (!email) {
                    return res.status(400).send({ success: false, message: "Freelancer email is required" });
                }

                console.log("Processing earnings for freelancer:", email);

                // ১. কালেকশন থেকে সব ডাটা রিড করি
                const allPayments = await paymentCollection.find({}).toArray();
                const allTasks = await tasksCollection.find({}).toArray();

                const history = [];
                let totalEarned = 0;

                const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
                const monthlyChartData = months.map(m => ({ month: m, earnings: 0 }));

                // ২. লুপ চালিয়ে ডাটা ফিল্টার ও ম্যাচিং
                allTasks.forEach(task => {
                    // চেক করি এই টাস্কের proposals অ্যারেতে এই ফ্রিল্যান্সারের কোনো প্রোপোজাল আছে কি না
                    const hasFreelancerProposal = task.proposals && task.proposals.some(prop =>
                        prop.freelancerEmail?.toLowerCase() === email.toLowerCase() ||
                        prop.email?.toLowerCase() === email.toLowerCase()
                    );

                    if (hasFreelancerProposal) {
                        // এই টাস্কের ক্লায়েন্টের ইমেইল দিয়ে পেমেন্ট কালেকশনে কোনো পেমেন্ট আছে কি না খুঁজি
                        const matchedPayment = allPayments.find(payment =>
                            payment.userEmail?.toLowerCase() === task.client_email?.toLowerCase()
                        );

                        // যদি পেমেন্ট পাওয়া যায় (তার মানে ক্লায়েন্ট অলরেডি পে করেছে)
                        if (matchedPayment) {
                            const amount = Number(task.budget) || 0;
                            totalEarned += amount;

                            // চার্টের জন্য মাস ক্যালকুলেশন
                            const paymentDate = matchedPayment.createdAt ? new Date(matchedPayment.createdAt) : new Date();
                            const monthIndex = paymentDate.getMonth();
                            if (monthIndex >= 0 && monthIndex < 12) {
                                monthlyChartData[monthIndex].earnings += amount;
                            }

                            // হিস্ট্রি টেবিলের জন্য ডাটা ফরম্যাটিং
                            history.push({
                                _id: matchedPayment._id,
                                sessionId: matchedPayment.sessionId,
                                createdAt: matchedPayment.createdAt || task.createdAt,
                                clientEmail: task.client_email || "N/A",
                                taskTitle: task.title || "Untitled Task",
                                amount: amount
                            });
                        }
                    }
                });

                const paymentCount = history.length;
                const avgEarned = paymentCount > 0 ? Math.round(totalEarned / paymentCount) : 0;

                console.log(`Matched ${paymentCount} successfully paid tasks for freelancer.`);

                res.status(200).send({
                    success: true,
                    totalEarned,
                    avgEarned,
                    paymentCount,
                    monthlyChartData,
                    history
                });

            } catch (error) {
                console.error("Error in freelancer earnings:", error);
                res.status(500).send({ success: false, message: error.message });
            }
        });

        app.get("/api/freelancers/:id", async (req, res) => {
            try {
                const id = req.params.id;
                if (!ObjectId.isValid(id)) {
                    return res.status(400).send({ error: true, message: "Invalid Freelancer ID format" });
                }
                const query = { _id: new ObjectId(id), role: "freelancer" };
                const freelancer = await usersCollection.findOne(query, {
                    projection: { password: 0 }
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




        app.put("/api/freelancers/:id", async (req, res) => {
            try {
                const id = req.params.id;
                const updatedData = req.body;
                if (!ObjectId.isValid(id)) {
                    return res.status(400).send({ error: true, message: "Invalid Freelancer ID format" });
                }
                const filter = { _id: new ObjectId(id) };
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
                const currentPage = parseInt(page) || 1;
                const currentLimit = parseInt(limit) || 12;
                const skip = (currentPage - 1) * currentLimit;
                const query = { role: "freelancer" };
                if (search) {
                    query.$or = [
                        { name: { $regex: search, $options: "i" } },
                        { title: { $regex: search, $options: "i" } },
                        { skills: { $regex: search, $options: "i" } }
                    ];
                }
                if (minRate || maxRate) {
                    query.hourlyRate = {};
                    if (minRate) query.hourlyRate.$gte = Number(minRate);
                    if (maxRate) query.hourlyRate.$lte = Number(maxRate);
                }
                const pipeline = [
                    { $match: query },
                    { $project: { password: 0 } },
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



        app.get("/api/tasks/:id", async (req, res) => {
            try {
                const id = req.params.id;

                if (!ObjectId.isValid(id)) {
                    return res.status(400).send({ error: true, message: "Invalid Task ID format" });
                }
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
                const currentPage = parseInt(page) || 1;
                const currentLimit = parseInt(limit) || 6;
                const skip = (currentPage - 1) * currentLimit;
                const query = {};
                if (status) {
                    query.status = status;
                }
                if (search) {
                    query.$or = [
                        { title: { $regex: search, $options: "i" } },
                        { description: { $regex: search, $options: "i" } }
                    ];
                }
                if (category) {
                    query.category = category;
                }
                if (minBudget || maxBudget) {
                    query.budget = {};
                    if (minBudget) query.budget.$gte = Number(minBudget);
                    if (maxBudget) query.budget.$lte = Number(maxBudget);
                }
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
                            proposals: {
                                $filter: {
                                    input: { $ifNull: ["$proposals", []] },
                                    as: "proposal",
                                    cond: { $ne: ["$$proposal.status", "Rejected"] }
                                }
                            }
                        }
                    },
                    { $sort: { createdAt: -1 } },
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
                            status: "$proposals.status",
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
                const updateDoc = {
                    $push: { proposals: newProposal }
                };
                const result = await tasksCollection.updateOne(filter, updateDoc);
                res.status(201).send({ success: true, message: "Proposal submitted successfully", data: newProposal });
            } catch (error) {
                res.status(500).send({ error: true, message: "Internal server error" });
            }
        });

        app.put("/api/proposals/:taskId/:proposalId", async (req, res) => {
            try {
                const { taskId, proposalId } = req.params;
                const { status } = req.body;
                if (!ObjectId.isValid(taskId) || !ObjectId.isValid(proposalId)) {
                    return res.status(400).send({ error: true, message: "Invalid Task ID or Proposal ID format" });
                }
                if (!status) {
                    return res.status(400).send({ error: true, message: "Status is required" });
                }
                const filter = {
                    _id: new ObjectId(taskId),
                    "proposals.proposalId": new ObjectId(proposalId)
                };
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

        app.get("/api/proposals/details/:proposalId", async (req, res) => {
            try {
                const { proposalId } = req.params;
                if (!ObjectId.isValid(proposalId)) {
                    return res.status(400).send({
                        success: false,
                        message: "Invalid Proposal ID format"
                    });
                }
                const proposalData = await tasksCollection.aggregate([
                    { $match: { "proposals.proposalId": new ObjectId(proposalId) } },
                    { $unwind: "$proposals" },
                    { $match: { "proposals.proposalId": new ObjectId(proposalId) } },
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
                if (!proposalData || proposalData.length === 0) {
                    return res.status(404).send({
                        success: false,
                        message: "Proposal not found"
                    });
                }
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
        

        
        app.get("/api/freelancer-projects", async (req, res) => {
            try {
                const { email } = req.query;
                if (!email) {
                    return res.status(400).send({ success: false, message: "Freelancer email is required" });
                }

                // টাস্ক কালেকশন থেকে ডাটা ফিল্টার করা
                const projects = await tasksCollection.find({
                    "proposals.freelancerEmail": email,
                    status: { $in: ["Accepted", "Completed"] } // শুধু Accepted এবং Completed গুলো নিব
                }).toArray();

                // ফ্রন্টএন্ডের সুবিধার জন্য Accepted এবং Completed আলাদা করে পাঠানো
                const activeProjects = projects.filter(task => task.status === "Accepted");
                const completedProjects = projects.filter(task => task.status === "Completed");

                res.status(200).send({
                    success: true,
                    activeProjects,
                    completedProjects
                });
            } catch (error) {
                console.error("Error fetching freelancer projects:", error);
                res.status(500).send({ success: false, message: "Internal server error" });
            }
        });

        app.patch("/api/tasks/complete/:id", async (req, res) => {
            try {
                const { id } = req.params;
                const { deliverableUrl } = req.body;

                if (!ObjectId.isValid(id)) {
                    return res.status(400).send({ success: false, message: "Invalid Task ID format" });
                }
                if (!deliverableUrl) {
                    return res.status(400).send({ success: false, message: "Deliverable URL is required" });
                }

                const filter = { _id: new ObjectId(id) };
                const updateDoc = {
                    $set: {
                        status: "Completed",
                        deliverableUrl: deliverableUrl, // লিঙ্কটি টাস্ক অবজেক্টে সেভ হবে
                        completedAt: new Date()
                    }
                };

                const result = await tasksCollection.updateOne(filter, updateDoc);

                if (result.matchedCount === 0) {
                    return res.status(404).send({ success: false, message: "Task not found" });
                }

                res.status(200).send({ success: true, message: "Task marked as completed successfully!" });
            } catch (error) {
                console.error("Error completing task:", error);
                res.status(500).send({ success: false, message: "Internal server error" });
            }
        });


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