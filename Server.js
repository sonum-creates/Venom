
require("dotenv").config();

const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");

const app = express();

app.use(helmet());
app.use(cors({
  origin: process.env.FRONTEND_URL
    ? process.env.FRONTEND_URL.split(",").map(url => url.trim())
    : false
}));
app.use(express.json({ limit: "10kb" }));

app.use("/api", rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  message: { error: "Too many requests. Try again later." }
}));

// Database model
const scoreSchema = new mongoose.Schema({
  player: {
    type: String,
    required: true,
    trim: true,
    minlength: 1,
    maxlength: 20
  },
  score: {
    type: Number,
    required: true,
    min: 0,
    max: 10000000,
    validate: {
      validator: Number.isSafeInteger,
      message: "Score must be a whole number"
    }
  }
}, { timestamps: true });

const Score = mongoose.model("Score", scoreSchema);

// Test route
app.get("/", (req, res) => {
  res.json({
    message: "Worm Arena backend is running!"
  });
});

// Health check
app.get("/api/health", (req, res) => {
  res.json({
    status: "ok",
    database: mongoose.connection.readyState === 1
      ? "connected"
      : "disconnected"
  });
});

// Submit score
app.post("/api/scores", async (req, res) => {
  try {
    const { player, score } = req.body;

    if (
      typeof player !== "string" ||
      player.trim().length < 1 ||
      player.trim().length > 20 ||
      !Number.isSafeInteger(score) ||
      score < 0 ||
      score > 10000000
    ) {
      return res.status(400).json({
        error: "Enter a valid player name and score."
      });
    }

    const savedScore = await Score.create({
      player: player.trim(),
      score
    });

    res.status(201).json({
      message: "Score saved successfully!",
      data: savedScore
    });
  } catch (error) {
    console.error("Score error:", error.message);
    res.status(500).json({
      error: "Could not save score."
    });
  }
});

// Online leaderboard
app.get("/api/leaderboard", async (req, res) => {
  try {
    const limit = Math.min(
      Math.max(parseInt(req.query.limit, 10) || 10, 1),
      100
    );

    const leaderboard = await Score.find()
      .sort({ score: -1, createdAt: 1 })
      .limit(limit)
      .select("player score createdAt")
      .lean();

    res.json({
      leaderboard: leaderboard.map((item, index) => ({
        rank: index + 1,
        player: item.player,
        score: item.score,
        date: item.createdAt
      }))
    });
  } catch (error) {
    console.error("Leaderboard error:", error.message);
    res.status(500).json({
      error: "Could not load leaderboard."
    });
  }
});

// Start server after connecting to MongoDB
const PORT = process.env.PORT || 3000;

async function startServer() {
  try {
    if (!process.env.MONGODB_URI) {
      throw new Error("MONGODB_URI is missing from .env");
    }

    await mongoose.connect(process.env.MONGODB_URI);
    console.log("MongoDB connected successfully!");

    app.listen(PORT, "0.0.0.0", () => {
      console.log(`Worm Arena server running on port ${PORT}`);
    });
  } catch (error) {
    console.error("Server startup failed:", error.message);
    process.exit(1);
  }
}

startServer();
      
