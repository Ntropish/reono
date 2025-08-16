import { createElement, render } from "./dist/index.js";
import { CORS } from "./dist/index.js";
import { traverse } from "./dist/src/runtime/traverse.js";
import { buildTrie, matchTrie } from "./dist/src/runtime/trie.js";

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

// Inspect the actual routes that get built
const flat = traverse(tree);
console.log("\nFlattened routes:");
console.log(flat.routes.map((r) => ({ method: r.method, path: r.path })));

const trie = buildTrie(flat.routes);
console.log("\nTesting route matching:");

// Test what gets matched for the OPTIONS request
const optionsMatch = matchTrie(trie, "OPTIONS", "/api/data");
console.log("OPTIONS match for /api/data:", optionsMatch);

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
