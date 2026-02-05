require('dotenv').config(); // Loads.env variables first
const express = require('express');
const cors =require('cors');
const cookieParser = require('cookie-parser');
const db = require('./models'); // This will be your Sequelize connection
const mainRouter = require('./routes'); // Your main API router

const app = express();

// --- Global Middleware ---
// Enable CORS for React frontend
app.use(cors({
  origin: 'http://localhost:3000', 
  //origin: 'http://192.168.1.196:3000',
  credentials: true // Allows cookies to be sent
}));
app.use(express.json()); // Parses incoming JSON request bodies
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser()); // Parses cookies for auth

// --- API Routes ---
// All API routes will be prefixed with /api
app.use('/api', mainRouter);

// --- Health Check Route ---
app.get('/', (req, res) => {
  res.status(200).send('Combine Harvester API is running.');
});

// --- Database Connection & Server Start ---
const PORT = process.env.PORT || 8080;

// Sync database and start server
db.sequelize.sync() // { force: true } to drop and resync (in dev)
 .then(() => {
    console.log('Database synced successfully.');
    app.listen(PORT, () => {
      console.log(`Server is running on port ${PORT}.`);
    });
  })
 .catch((err) => {
    console.error('Failed to sync database:', err);
  });