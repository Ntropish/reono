import { createNodeApp } from "@workspace/node-http";
import App from "./app.server";

const app = createNodeApp();

app.serve(<App />);

app.listen(3000, () => {
  console.log("Server is running on http://localhost:3000");
});
