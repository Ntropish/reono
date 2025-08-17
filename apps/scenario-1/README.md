# Scenario 1: Content Management API with File Uploads

This is a comprehensive integration test scenario for the Reono framework that demonstrates:

## Features Tested

### 🔐 **Authentication & Authorization**

- JWT/API key authentication with Guard component
- Role-based access control (admin vs user)
- User tier permissions (free vs premium)
- Access control for content ownership

### 📝 **Content Management**

- CRUD operations for articles/content
- Author attribution and ownership
- Publishing status (draft vs published)
- Tagging system

### 📁 **File Upload System**

- Multipart form data handling
- File type validation (images only)
- File size limits (5MB max)
- Upload rate limiting
- File ownership tracking

### 🛡️ **Rate Limiting**

- Global rate limits (100 requests per 15 minutes)
- User-based rate limits (60 requests per minute)
- Upload-specific rate limits (10 uploads per 5 minutes)
- Different limits for user tiers

### 🌐 **CORS Support**

- Preflight OPTIONS handling
- CORS headers on all responses
- Support for cross-origin requests

### 🚦 **Middleware Stack**

- Error handling with graceful degradation
- Request/response logging
- Middleware composition and execution order
- State sharing between middleware components

## API Endpoints

### Health & Status

- `GET /api/v1/health` - System health check

### User Management

- `GET /api/v1/users` - List users (filtered by role)
- `GET /api/v1/users/:id` - Get specific user
- `POST /api/v1/users` - Create user (admin only)
- `PUT /api/v1/users/:id` - Update user
- `DELETE /api/v1/users/:id` - Delete user (admin only)

### Content Management

- `GET /api/v1/content/articles` - List articles (with access control)
- `GET /api/v1/content/articles/:id` - Get specific article
- `POST /api/v1/content/articles` - Create article
- `PUT /api/v1/content/articles/:id` - Update article (author or admin)
- `DELETE /api/v1/content/articles/:id` - Delete article (author or admin)

### File Upload

- `POST /api/v1/content/images` - Upload image file
- `GET /api/v1/content/images` - List user's uploads

## Test Coverage

### Integration Tests (`integration.test.tsx`)

- ✅ Full HTTP request lifecycle
- ✅ Authentication flows
- ✅ Rate limiting behavior
- ✅ CORS preflight handling
- ✅ File upload validation
- ✅ Access control enforcement
- ✅ Error handling
- ✅ Component interaction

### Performance Tests (`performance.test.tsx`)

- ✅ Response time benchmarks
- ✅ Concurrent request handling
- ✅ Memory usage monitoring
- ✅ Load testing

## Running the Tests

### Prerequisites

```bash
# Install dependencies
pnpm install
```

### Test Commands

```bash
# Run all tests
pnpm test

# Run only integration tests
pnpm test:integration

# Run tests in watch mode
pnpm test:watch

# Run performance tests
pnpm test src/__tests__/performance.test.tsx
```

### Start the Server

```bash
# Development mode
pnpm dev

# Production mode
pnpm build && pnpm start
```

## Test Data

### API Keys for Testing

- **Admin**: `admin-key-123` (full access)
- **Regular User**: `user-key-456` (limited access)
- **Premium User**: `premium-key-789` (enhanced limits)

### Sample Requests

#### Authentication

```bash
curl -H "Authorization: Bearer admin-key-123" \\
  http://localhost:8080/api/v1/users
```

#### Create Article

```bash
curl -X POST \\
  -H "Authorization: Bearer user-key-456" \\
  -H "Content-Type: application/json" \\
  -d '{"title":"Test Article","content":"Article content","tags":["test"]}' \\
  http://localhost:8080/api/v1/content/articles
```

#### Upload File

```bash
curl -X POST \\
  -H "Authorization: Bearer user-key-456" \\
  -F "file=@image.jpg" \\
  http://localhost:8080/api/v1/content/images
```

## Architecture Highlights

### Component Composition

The scenario demonstrates how Reono components compose naturally:

```tsx
const App = () => (
  <use handler={errorHandler}>
    <use handler={cors}>
      <use handler={logger}>
        <router path="api/v1">
          <UserRouter />
          <ContentRouter />
        </router>
      </use>
    </use>
  </use>
);
```

### Middleware Execution Order

1. **Error Handler** - Catches unhandled errors
2. **CORS** - Handles preflight and adds headers
3. **Logger** - Request/response logging
4. **Auth Guard** - Authentication verification
5. **Rate Limit** - Request throttling
6. **Route Handler** - Business logic

### Real-World Patterns

- **Guard Composition**: Multiple authentication checks
- **Rate Limiting**: Different policies for different endpoints
- **File Processing**: Validation, size limits, type checking
- **Access Control**: Role and ownership-based permissions
- **Error Handling**: Consistent error responses
- **Performance**: Response time and memory monitoring

## Success Criteria

✅ **Component Integration**: All utility components work together seamlessly  
✅ **Type Safety**: Full TypeScript inference throughout the stack  
✅ **Performance**: Sub-200ms response times for authenticated requests  
✅ **Reliability**: Graceful error handling and recovery  
✅ **Security**: Proper authentication, authorization, and file validation  
✅ **Scalability**: Efficient rate limiting and concurrent request handling

This scenario validates that Reono is production-ready for complex, real-world API development.
