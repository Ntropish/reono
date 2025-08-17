# Scenario 2: Multi-Tenant SaaS API Gateway

This is a comprehensive integration test scenario for the Reono framework that demonstrates complex multi-tenant architecture patterns commonly used in SaaS platforms.

## Features Tested

### 🏢 **Multi-Tenant Architecture**

- Tenant isolation through API key resolution
- Subscription tier-based access control (free/premium/enterprise)
- Tenant-specific configuration and settings
- Cross-tenant security validation

### 🔐 **Advanced Authentication & Authorization**

- API key-based tenant resolution
- Multi-level access control (tenant + user + subscription)
- Feature flag validation per tenant
- Hierarchical permission system

### 🚦 **Tiered Rate Limiting**

- Subscription-based rate limiting policies
- Per-tenant and per-user rate limits
- Burst allowances for premium users
- Rate limit pooling for enterprise accounts

### 🔄 **Dynamic Response Transformation**

- Subscription-aware data filtering
- Feature-based response enrichment
- Data masking for free tier users
- API versioning with backward compatibility

### 🌐 **Advanced CORS & Static Serving**

- Tenant-specific CORS policies
- Dynamic origin validation
- Version-specific API documentation
- Secure documentation serving

## Real-World Context

This scenario simulates a **SaaS platform API gateway** that serves multiple tenants with different subscription tiers, similar to platforms like:

- **Stripe API**: Different rate limits and features per plan
- **SendGrid API**: Tenant isolation with tiered access
- **Twilio API**: Usage-based billing and rate limiting
- **Auth0 Management API**: Multi-tenant with feature flags

## API Architecture

### Tenant Resolution Flow

```
1. Extract API key from Authorization header
2. Resolve tenant from API key
3. Validate tenant subscription status
4. Apply tenant-specific middleware stack
5. Route to tenant-namespaced endpoints
```

### Subscription Tiers

| Tier           | Rate Limit      | Features                      | Data Access               |
| -------------- | --------------- | ----------------------------- | ------------------------- |
| **Free**       | 100 req/hour    | Basic API                     | Limited data              |
| **Premium**    | 1,000 req/hour  | Advanced API + Analytics      | Full data                 |
| **Enterprise** | 10,000 req/hour | Custom features + White-label | Full data + Custom fields |

## Features Tested

### 🔐 **Authentication & Authorization**

- JWT/API key authentication with Guard component
- Role-based access control (admin vs user)
- User tier permissions (free vs premium)
- Access control for content ownership

## API Endpoints

### Tenant Management

```http
GET    /api/v1/tenant/:tenantId/info          # Tenant information
PUT    /api/v1/tenant/:tenantId/settings      # Update tenant settings
GET    /api/v1/tenant/:tenantId/usage         # Usage analytics
```

### User Management (Tenant-Scoped)

```http
GET    /api/v1/tenant/:tenantId/users         # List tenant users
POST   /api/v1/tenant/:tenantId/users         # Create user
GET    /api/v1/tenant/:tenantId/users/:userId # Get user details
PUT    /api/v1/tenant/:tenantId/users/:userId # Update user
DELETE /api/v1/tenant/:tenantId/users/:userId # Delete user
```

### Analytics API (Tiered Access)

```http
GET    /api/v1/tenant/:tenantId/analytics           # Basic analytics (Premium+)
GET    /api/v1/tenant/:tenantId/analytics/advanced  # Advanced analytics (Enterprise)
GET    /api/v1/tenant/:tenantId/analytics/export    # Data export (Enterprise)
```

### Billing API

```http
GET    /api/v1/tenant/:tenantId/billing/usage       # Current usage
GET    /api/v1/tenant/:tenantId/billing/invoices    # Invoice history
POST   /api/v1/tenant/:tenantId/billing/upgrade     # Upgrade subscription
```

### API Versioning

```http
GET    /api/v1/tenant/:tenantId/*                   # Current API version
GET    /api/v2/tenant/:tenantId/*                   # Next API version
```

### Public Endpoints

```http
GET    /health                                      # Health check
GET    /docs/*                                      # API documentation
GET    /docs/:version/*                             # Version-specific docs
```

## Component Integration Patterns

### Complex Guard Conditions

```tsx
// Multi-level tenant and subscription validation
<Guard
  condition={async (c) => {
    const tenant = await resolveTenant(c);
    const user = await resolveUser(c);
    return (
      tenant?.isActive &&
      tenant?.subscription !== "suspended" &&
      user?.hasPermission("analytics:read")
    );
  }}
  fallback={(c) => c.json({ error: "Insufficient permissions" }, 403)}
>
  <get path="analytics" handler={getAnalytics} />
</Guard>
```

### Dynamic Rate Limiting

```tsx
// Subscription-based rate limiting
<RateLimit
  requests={(c) => getTenantRateLimit(c)}
  window={60000}
  keyGen={(c) => `${getTenant(c).id}:${getUser(c).id}`}
>
  <router path="api">{/* Tenant API routes */}</router>
</RateLimit>
```

### Response Transformation

```tsx
// Subscription-aware data filtering
<Transform
  transform={async (response, c) => {
    const tenant = getTenant(c);
    if (tenant.subscription === "free") {
      return filterSensitiveData(response);
    }
    return enrichWithPremiumData(response);
  }}
>
  <get path="users" handler={getUsers} />
</Transform>
```

## Technical Challenges

### 1. Tenant Isolation

- **Challenge**: Ensure complete data separation between tenants
- **Solution**: Tenant-aware middleware that validates all data access
- **Testing**: Cross-tenant access attempts should fail securely

### 2. Dynamic Rate Limiting

- **Challenge**: Different rate limits based on subscription and tenant
- **Solution**: Custom rate limit key generation with subscription context
- **Testing**: Verify rate limits respect subscription boundaries

### 3. Complex Authorization

- **Challenge**: Multi-level permissions (tenant + user + subscription + feature)
- **Solution**: Composable Guard conditions with async validation
- **Testing**: Permission matrix validation across all combinations

### 4. API Versioning

- **Challenge**: Support multiple API versions with tenant-specific routing
- **Solution**: Version-aware routing with backward compatibility
- **Testing**: Cross-version compatibility and migration paths

### 5. Performance Under Scale

- **Challenge**: Handle high concurrent load with tenant isolation
- **Solution**: Efficient tenant resolution and caching strategies
- **Testing**: Concurrent requests across multiple tenants

## Success Criteria

### Functional Requirements

- ✅ Complete tenant isolation (no cross-tenant data leaks)
- ✅ Subscription-based feature access control
- ✅ Dynamic rate limiting based on tenant tier
- ✅ Response transformation respects subscription level
- ✅ API versioning works across tenant boundaries

### Security Requirements

- ✅ Cross-tenant access attempts are blocked
- ✅ Invalid API keys are rejected gracefully
- ✅ Subscription downgrades don't leak premium data
- ✅ Rate limiting prevents abuse across tenant boundaries

### Performance Requirements

- ✅ Tenant resolution under 10ms per request
- ✅ Rate limiting scales to 1000+ concurrent tenants
- ✅ Response transformation adds <50ms latency
- ✅ Memory usage scales linearly with active tenants

## Development Phases

### Phase 1: Core Multi-Tenant Infrastructure ⚡ **CURRENT**

- [ ] Update project structure and documentation
- [ ] Implement tenant data models
- [ ] Create tenant-aware authentication
- [ ] Basic tenant isolation testing

### Phase 2: Advanced Access Control

- [ ] Complex Guard conditions
- [ ] Subscription tier validation
- [ ] Feature flag system
- [ ] Permission matrix testing

### Phase 3: Dynamic Policies

- [ ] Tiered rate limiting
- [ ] Subscription-aware transformations
- [ ] API versioning support
- [ ] Cross-version compatibility

### Phase 4: Production Readiness

- [ ] Comprehensive security testing
- [ ] Performance optimization
- [ ] Error handling & monitoring
- [ ] Documentation & examples

---

## Running the Scenario

```bash
# Development with hot reload
pnpm dev

# Run tests
pnpm test

# Run integration tests
pnpm test:integration

# Build for production
pnpm build

# Start production server
pnpm start
```

## Testing Strategy

This scenario includes comprehensive tests for:

- **Tenant Isolation**: Verify no cross-tenant data access
- **Authentication Flow**: API key to tenant resolution
- **Rate Limiting**: Subscription-based limits and enforcement
- **Data Transformation**: Tier-appropriate response filtering
- **Security**: Cross-tenant attack prevention
- **Performance**: Concurrent multi-tenant load testing

The goal is to validate that Reono can handle real-world SaaS platform complexity while maintaining security, performance, and developer experience.

## Sample API Keys for Testing

### Free Tier

- **API Key**: `free_tenant_abc123`
- **Tenant**: AcmeCorp Free
- **Limits**: 100 requests/hour, basic features only

### Premium Tier

- **API Key**: `premium_tenant_def456`
- **Tenant**: TechCorp Premium
- **Limits**: 1,000 requests/hour, advanced analytics

### Enterprise Tier

- **API Key**: `enterprise_tenant_ghi789`
- **Tenant**: BigCorp Enterprise
- **Limits**: 10,000 requests/hour, all features + custom
  curl -X POST \\
  -H "Authorization: Bearer user-key-456" \\
  -H "Content-Type: application/json" \\
  -d '{"title":"Test Article","content":"Article content","tags":["test"]}' \\
  http://localhost:8080/api/v1/content/articles

````

#### Upload File

```bash
curl -X POST \\
  -H "Authorization: Bearer user-key-456" \\
  -F "file=@image.jpg" \\
  http://localhost:8080/api/v1/content/images
````

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
