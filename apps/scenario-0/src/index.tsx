import { createApp } from "@reono/node-server";
import App from "./app.server";

const app = createApp();

app.serve(<App />);

app.listen(3050, () => {
  console.log("Server is running on http://localhost:3050");
});

// export App for testing
export { App };
