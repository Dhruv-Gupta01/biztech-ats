const mongoose = require('mongoose');

const connectDB = async (retries = 5, delayMs = 5000) => {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const uri = process.env.MONGO_URI;
      if (!uri) {
        throw new Error('MONGO_URI is not defined in environment variables.');
      }
      await mongoose.connect(uri);
      console.log('✅ MongoDB connected');
      return;
    } catch (err) {
      console.error(`❌ MongoDB connection error (attempt ${attempt}/${retries}):`, err.message);
      if (attempt === retries) {
        console.error('💡 Tip: If you see "EBADRESP" or SRV lookup failures, your MongoDB Atlas cluster may be paused or the DNS SRV record is not responding. Try restarting the cluster or check your network/MONGO_URI.');
        process.exit(1);
      }
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }
};

module.exports = connectDB;
