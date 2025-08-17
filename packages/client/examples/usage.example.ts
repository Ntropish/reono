// Example of how developers would use the generated client
import { api, createApi } from './generated/api';

// ✅ COMPILE-TIME TYPE SAFETY EXAMPLES

async function demonstrateTypeSafety() {
  // ✅ Simple GET request - no params needed
  const health = await api.get('/api/v1/health');
  console.log(health.status); // TypeScript knows this exists
  
  // ✅ GET with parameters - TypeScript enforces params
  const user = await api.get('/api/v1/users/:id', {
    params: { id: '123' } // ✅ Required and typed
  });
  
  // ❌ This would be a COMPILE ERROR - missing required params
  // const user = await api.get('/api/v1/users/:id', {});
  
  // ❌ This would be a COMPILE ERROR - wrong param name
  // const user = await api.get('/api/v1/users/:id', {
  //   params: { userId: '123' } // Wrong! Should be 'id'
  // });
  
  // ✅ POST with body
  const newUser = await api.post('/api/v1/users', {
    body: {
      name: 'John Doe',
      email: 'john@example.com',
      role: 'user'
    }
  });
  
  // ✅ Multiple parameters - all required
  const orgUser = await api.get('/api/v1/organizations/:orgId/users/:userId', {
    params: {
      orgId: 'org123',
      userId: 'user456'
    }
  });
  
  // ✅ Custom headers and options
  const userWithAuth = await api.get('/api/v1/users/:id', {
    params: { id: '123' },
    headers: {
      'Authorization': 'Bearer token123',
      'Content-Type': 'application/json'
    }
  });
  
  // ✅ Different response parsing
  const rawResponse = await api.get('/api/v1/health', {
    parseAs: 'response' // Get raw Response object
  });
  
  // ✅ Custom base URL
  const customApi = createApi({
    baseUrl: 'https://api.myapp.com',
    defaultHeaders: {
      'Authorization': 'Bearer global-token'
    }
  });
  
  await customApi.get('/api/v1/health');
}

// ❌ THESE WOULD ALL BE COMPILE ERRORS:

async function demonstrateCompileErrors() {
  // ❌ Invalid path
  // await api.get('/nonexistent/path');
  
  // ❌ Wrong HTTP method for path
  // await api.post('/api/v1/health'); // health only supports GET
  
  // ❌ Missing required params
  // await api.get('/api/v1/users/:id');
  
  // ❌ Wrong param types
  // await api.get('/api/v1/users/:id', {
  //   params: { id: 123 } // Should be string
  // });
}

// ✅ RUNTIME FEATURES

async function demonstrateRuntimeFeatures() {
  try {
    // The client handles all the HTTP details
    const user = await api.get('/api/v1/users/:id', {
      params: { id: '123' },
      query: { 
        include: 'profile',
        format: 'detailed'
      }
    });
    
    console.log('User:', user);
    
  } catch (error: any) {
    // Structured error handling
    console.error('Request failed:', {
      status: error.status,
      message: error.message,
      data: error.data
    });
  }
}

export { demonstrateTypeSafety, demonstrateRuntimeFeatures };
