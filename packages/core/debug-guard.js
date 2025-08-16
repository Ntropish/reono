import { createElement } from "./dist/index.js";
import { Guard } from "./dist/index.js";
import { render } from "./dist/index.js";

console.log("Debug Guard state-based test...");

// Test with positional children (like the working middleware test)
const positionalTree = createElement(
  "router",
  { path: "" },
  
  createElement("use", {
    handler: async (c, next) => {
      console.log("Positional middleware called");
      return next();
    }
  },
  createElement("get", {
    path: "test-positional",
    handler: (c) => {
      console.log("Positional handler called");
      return c.json({ positional: true });
    },
  }))
);

console.log("Testing positional children...");
const positionalHandle = render(positionalTree);
const positionalReq = new Request("http://localhost/test-positional", { method: "GET" });
positionalHandle(positionalReq).then(async (res) => {
  console.log("Positional response status:", res.status);
  if (res.status === 200) {
    const data = await res.json();
    console.log("Positional response data:", data);
  } else {
    const text = await res.text();
    console.log("Positional response text:", text);
  }
  
  // Now test with children prop
  console.log("\nTesting children prop...");
  
  const propTree = createElement(
    "router",
    { path: "" },
    
    createElement("use", {
      handler: async (c, next) => {
        console.log("Prop middleware called");
        return next();
      },
      children: createElement("get", {
        path: "test-prop",
        handler: (c) => {
          console.log("Prop handler called");
          return c.json({ prop: true });
        },
      }),
    })
  );

  const propHandle = render(propTree);
  const propReq = new Request("http://localhost/test-prop", { method: "GET" });
  const propResult = await propHandle(propReq);
  console.log("Prop response status:", propResult.status);
  if (propResult.status === 200) {
    const data = await propResult.json();
    console.log("Prop response data:", data);
  } else {
    const text = await propResult.text();
    console.log("Prop response text:", text);
  }
});
