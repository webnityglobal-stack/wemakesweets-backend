require('dotenv').config();
const mongoose = require('mongoose');

async function migrate() {
  await mongoose.connect(process.env.MONGO_URI);
  console.log('Connected to DB');

  const users = await mongoose.connection.db.collection('users').find({}).toArray();
  for (const u of users) {
    const updates = {};
    if (u.fullName && !u.name) updates.name = u.fullName.trim();
    if (u.name && !u.fullName) updates.fullName = u.name.trim();
    if (u.mobile && !u.phone) updates.phone = u.mobile.trim();
    if (u.phone && !u.mobile) updates.mobile = u.phone.trim();

    if (Object.keys(updates).length > 0) {
      await mongoose.connection.db.collection('users').updateOne(
        { _id: u._id },
        { $set: updates }
      );
      console.log('Updated user:', u.email, updates);
    }
  }

  const updatedUsers = await mongoose.connection.db.collection('users').find({}).toArray();
  console.log('Users after migration:');
  updatedUsers.forEach((u) => {
    console.log(u.email, { name: u.name, fullName: u.fullName, phone: u.phone, mobile: u.mobile });
  });

  process.exit(0);
}

migrate().catch((err) => {
  console.error(err);
  process.exit(1);
});
