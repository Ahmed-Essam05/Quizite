import mongoose from "mongoose";
import { MongoMemoryServer } from "mongodb-memory-server";

let mongoServer;

export const connectTestDB = async () => {
  const options = {};

  if (process.env.MONGOMS_SYSTEM_BINARY) {
    options.binary = { systemBinary: process.env.MONGOMS_SYSTEM_BINARY };
  }

  mongoServer = await MongoMemoryServer.create(options);
  await mongoose.connect(mongoServer.getUri(), {
    useNewUrlParser: true,
    useUnifiedTopology: true,
  });
};

export const clearTestDB = async () => {
  const collections = await mongoose.connection.db.collections();
  await Promise.all(collections.map((collection) => collection.deleteMany({})));
};

export const disconnectTestDB = async () => {
  await mongoose.disconnect();
  if (mongoServer) {
    await mongoServer.stop();
  }
};
