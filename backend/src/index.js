import "dotenv/config";
import { createApp } from "./app.js";
import { createDatabase } from "./database.js";

const port = Number(process.env.PORT ?? 3001);
const database = createDatabase();
const app = createApp({ database });

app.listen(port, () => {
  console.log(`EduSphere API foundation listening on http://localhost:${port}`);
});
