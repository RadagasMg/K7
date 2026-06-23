import { initializeApp, applicationDefault } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import fs from "fs";

const config = JSON.parse(fs.readFileSync("./firebase-applet-config.json", "utf-8"));

const app = initializeApp({
  credential: applicationDefault(),
  projectId: config.projectId,
});

async function run() {
  try {
    const listUsersResult = await getAuth(app).listUsers(1000);
    listUsersResult.users.forEach((userRecord) => {
      console.log('user', userRecord.uid, userRecord.email);
    });
    process.exit(0);
  } catch (error) {
    console.error("Error:", error);
    process.exit(1);
  }
}

run();
