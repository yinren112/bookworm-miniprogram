# Bookworm Backend

A robust backend API server for the Bookworm campus textbook marketplace, built with Fastify, TypeScript, and PostgreSQL.

## Quick Start

### Prerequisites
- Node.js 18+
- Docker & Docker Compose
- Git

### Local Development Setup

1. **Clone and Install Dependencies**
   ```bash
   cd bookworm-backend
   npm install
   ```

2. **Environment Configuration**
   ```bash
   # Copy example environment file
   cp .env.example .env

   # Edit .env with your specific configuration
   # The defaults work for local development with Docker
   ```

3. **Start Database Services**
   ```bash
   # Start PostgreSQL database for development
   docker-compose up -d postgres

   # For testing (starts both dev and test databases)
   docker-compose --profile test up -d

   # Wait for database to be ready (check health)
   docker-compose ps
   ```

4. **Database Setup**
   ```bash
   # Generate Prisma client
   npx prisma generate

   # Run database migrations
   npx prisma db push

   # Optional: Seed with sample data
   npm run seed
   ```

5. **Start Development Server**
   ```bash
   npm run dev
   ```

The API server will be available at `http://localhost:8080`

## Database Management

### Development Database
```bash
# Start development database
docker-compose up -d postgres

# Apply schema changes
npx prisma db push

# View data in Prisma Studio
npx prisma studio
```

### Test Database
```bash
# Start test database (separate from development)
docker-compose --profile test up -d postgres_test

# Run tests with test database
npm test
npm run test:integration
```

### Production Database
```bash
# Run migrations (instead of db push)
npx prisma migrate deploy
```

## Available Scripts

### Development
```bash
npm run dev          # Start development server with hot reload
npm run build        # Build TypeScript to JavaScript
npm run start        # Start production server
```

### Database
```bash
npm run migrate:dev  # Create and apply new migration
npm run seed         # Seed database with sample data
npx prisma studio    # Open Prisma Studio (database GUI)
npx prisma generate  # Regenerate Prisma client after schema changes
```

### Testing
```bash
npm test                    # Run unit tests
docker-compose --profile test up -d postgres_test  # Ensure test DB is running
npm run test:integration    # Run integration tests with real database
# Windows: use ./run-integration-tests.ps1 to automate the above steps
npm run test:all           # Run all tests with coverage
```

### Background Jobs
```bash
npm run job:cancel-orders  # Manually run order expiration cleanup
```

## Project Structure

```
bookworm-backend/
├── src/
│   ├── config.ts              # Environment configuration
│   ├── index.ts              # Main application server
│   ├── db.ts                 # Prisma database client
│   ├── plugins/              # Fastify plugins
│   │   ├── auth.ts          # JWT authentication
│   │   └── metrics.ts       # Prometheus metrics
│   ├── services/             # Business logic
│   │   ├── orderService.ts  # Order management
│   │   └── inventoryService.ts  # Inventory management
│   ├── jobs/                 # Background jobs
│   └── tests/               # Test files
├── prisma/
│   ├── schema.prisma        # Database schema
│   ├── migrations/          # Database migrations
│   └── seed.ts             # Database seeding
├── docker-compose.yml       # Local development infrastructure
├── .env.example            # Environment variables template
└── README.md              # This file
```

## API Documentation

### Health Check
- `GET /api/health` - System health status

### Authentication
- `POST /api/auth/login` - WeChat Mini Program login

### Inventory
- `GET /api/inventory/available` - List available books (with search & pagination)
- `GET /api/inventory/item/:id` - Get book details
- `POST /api/inventory/add` - Add book to inventory (STAFF only)

### Orders
- `POST /api/orders/create` - Create new order
- `GET /api/orders/:id` - Get order details
- `GET /api/orders/user/:userId` - User order history
- `PATCH /api/orders/:id/status` - Update order status (STAFF only)
- `POST /api/orders/fulfill` - Fulfill order with pickup code (STAFF only)
- `GET /api/orders/pending-pickup` - List pending pickup orders (STAFF only)

### System
- `GET /metrics` - Prometheus metrics (for monitoring)

## Error Handling

The API uses a layered error handling system that returns consistent error responses:

```json
{
  "code": "ERROR_CODE",
  "message": "Human readable error message"
}
```

Common error codes:
- `UNAUTHORIZED` (401) - Authentication required
- `FORBIDDEN` (403) - Insufficient permissions
- `VALIDATION_ERROR` (400) - Invalid request data
- `RATE_LIMIT_EXCEEDED` (429) - Too many requests
- `ORDER_NOT_FOUND` (404) - Order does not exist
- `INVALID_STATUS_TRANSITION` (400) - Invalid order status change
- `INTERNAL_ERROR` (500) - Server error

## Environment Variables

Key environment variables (see `.env.example` for complete list):

```bash
# Database
DATABASE_URL="postgresql://postgres:password@localhost:5432/bookworm"

# Authentication
JWT_SECRET="your-secret-key-here"

# WeChat Integration
WX_APP_ID="your-wechat-app-id"
WX_APP_SECRET="your-wechat-app-secret"

# Business Rules
ORDER_PAYMENT_TTL_MINUTES=15
MAX_ITEMS_PER_ORDER=10
API_RATE_LIMIT_MAX=5
```

## Monitoring & Observability

### Metrics
Prometheus metrics available at `/metrics`:
- Request/response metrics
- Order lifecycle counters
- Inventory status gauges
- Database retry counters

### Logging
Structured JSON logging via Fastify with:
- Request/response logging
- Error tracking with stack traces
- Authentication events

### Health Checks
- `GET /api/health` includes database connectivity check
- Docker health checks for database containers

## Production Deployment

### Docker
```bash
# Build production image
docker build -t bookworm-backend .

# Run with environment file
docker run -p 8080:8080 --env-file .env bookworm-backend
```

### Configuration Validation
The application validates critical configuration in production:
- JWT_SECRET must not be default value
- WeChat credentials must be configured
- Database connection must be available

## Troubleshooting

### Database Connection Issues
```bash
# Check database container status
docker-compose ps

# View database logs
docker-compose logs postgres

# Reset database (destroys data!)
docker-compose down -v
docker-compose up -d postgres
```

### Permission Errors
```bash
# Reset Docker volumes if needed (destroys data!)
docker-compose down -v
docker volume prune
```

### Port Conflicts
The setup uses these ports:
- `8080` - API server
- `5432` - PostgreSQL (development)
- `5433` - PostgreSQL (test)

Change ports in `docker-compose.yml` if needed.

## Contributing

1. Create a feature branch
2. Make changes with tests
3. Run full test suite: `npm run test:all`
4. Ensure TypeScript compiles: `npm run build`
5. Create pull request

### Code Standards
- TypeScript strict mode enabled
- ESLint + Prettier formatting
- 100% test coverage for business logic
- Integration tests for API endpoints
- Prisma for database operations only

## License

Private project - All rights reserved.
