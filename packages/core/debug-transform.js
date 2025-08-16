import { createElement } from "./dist/index.js";
import { Transform } from "./dist/index.js";
import { render } from "./dist/index.js";

console.log("Debug Transform middleware...");

const app = createElement(
  "router",
  {},
  Transform({
    transform: (response, ctx) => {
      console.log("Transform called with:", response);
      if (
        response &&
        typeof response === "object" &&
        !(response instanceof Response)
      ) {
        const transformed = { ...response, transformed: true };
        console.log("Transforming to:", transformed);
        return transformed;
      }
      return response;
    },
    children: createElement("get", {
      path: "test",
      handler: (ctx) => {
        const result = { original: "data" };
        console.log("Handler returning:", result);
        return result;
      },
    }),
  })
);

const handle = render(app);

const req = new Request("http://localhost/test", { method: "GET" });
handle(req).then(async (res) => {
  console.log("Response status:", res.status);
  const data = await res.json();
  console.log("Response data:", data);
});
