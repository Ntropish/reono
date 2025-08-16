// Simple debug script to test CORS OPTIONS behavior
async function testCors() {
  try {
    const response = await fetch("http://localhost:8080/api/v1/health", {
      method: "OPTIONS",
      headers: {
        Origin: "https://example.com",
        "Access-Control-Request-Method": "GET",
        "Access-Control-Request-Headers": "Authorization, Content-Type",
      },
    });

    console.log("Status:", response.status);
    console.log("Headers:");
    for (const [key, value] of response.headers.entries()) {
      console.log(`  ${key}: ${value}`);
    }

    const text = await response.text();
    console.log("Body:", text);
  } catch (error) {
    console.error("Error:", error);
  }
}

testCors();
