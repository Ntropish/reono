import { createElement, render } from "./dist/index.js";
import { CORS } from "./dist/index.js";

// Test CORS with corrected syntax and explicit OPTIONS support
const tree = createElement(
  "router",
  { path: "" },
  CORS({
    origins: ["https://example.com"],
    methods: ["GET", "POST", "PUT"],
    children: createElement(
      "router",
      { path: "api" },
      createElement("get", {
        path: "data",
        handler: (c) => c.json({ data: "secured" }),
      }),
      createElement("post", {
        path: "data",
        handler: (c) => c.json({ created: true }),
      })
    ),
  })
);

console.log("CORS tree structure:", JSON.stringify(tree, null, 2));

const handle = render(tree);

// Test preflight OPTIONS request
const preflightReq = new Request("http://localhost/api/data", {
  method: "OPTIONS",
  headers: {
    origin: "https://example.com",
    "access-control-request-method": "POST",
    "access-control-request-headers": "Content-Type,Authorization",
  },
});

console.log("Testing preflight OPTIONS request...");
handle(preflightReq).then((res) => {
  console.log("Preflight response status:", res.status);
  console.log("Preflight headers:", [...res.headers.entries()]);
});

// Test regular GET request
const getReq = new Request("http://localhost/api/data", {
  headers: { origin: "https://example.com" },
});

console.log("Testing GET request with CORS...");
handle(getReq)
  .then((res) => {
    console.log("GET response status:", res.status);
    console.log(
      "GET CORS headers:",
      res.headers.get("Access-Control-Allow-Origin")
    );
    return res.json();
  })
  .then((data) => {
    console.log("GET response data:", data);
  });
