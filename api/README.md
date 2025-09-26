# Media Pipeline API

A Node.js + TypeScript + Express API backend for controlling and monitoring a Dockerized media pipeline. This API provides endpoints for pipeline control, real-time status monitoring, log streaming, and MEGA.nz link management.

## Features

- **Pipeline Control**: Start/stop media pipeline containers via Docker API
- **Real-time Status**: SSE streams for live container status updates
- **Log Streaming**: Real-time container logs via Server-Sent Events
- **Link Management**: CRUD operations for MEGA.nz links with atomic file operations
- **Security**: Optional Bearer token auth, CORS, rate limiting, helmet
- **Docker Integration**: Uses dockerode for safe container management
- **Atomic File Operations**: Safe concurrent access to links.txt file

## Requirements

- Node.js v20+
- Docker socket access (`/var/run/docker.sock`)
- Access to data directory (`/opt/media-pipeline/data`)

## Installation & Development

```bash
# Clone and install dependencies
npm install

# Copy environment configuration
cp .env.example .env

# Edit configuration as needed
nano .env

# Start development server with hot reload
npm run dev

# Build for production
npm run build

# Start production server
npm start

# Run tests
npm test
```

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `8081` | API server port |
| `API_TOKEN` | _(none)_ | Optional Bearer token for authentication |
| `PIPELINE_CONTAINER` | `media-pipeline` | Main pipeline container name |
| `GLUETUN_CONTAINER` | `gluetun` | VPN container name |
| `TOR_CONTAINER` | `torproxy` | Tor proxy container name |
| `LINKS_FILE` | `/opt/media-pipeline/data/links.txt` | Path to links storage file |
| `APP_VERSION` | `1.0.0` | Application version |

## API Endpoints

### Health Check
```bash
curl http://localhost:8081/healthz
# Response: {"ok": true}
```

### Status Monitoring
```bash
# Get current status
curl http://localhost:8081/api/status

# Stream live status updates (SSE)
curl -N http://localhost:8081/api/status/stream
```

### Pipeline Control
```bash
# Start pipeline
curl -X POST http://localhost:8081/api/pipeline/start

# Stop pipeline
curl -X POST http://localhost:8081/api/pipeline/stop
```

### Log Streaming
```bash
# Stream container logs (SSE)
curl -N http://localhost:8081/api/logs/stream
```

### Link Management
```bash
# Get all links
curl http://localhost:8081/api/links

# Add a single link
curl -H 'Content-Type: application/json' \
     -d '{"url":"https://mega.nz/folder/..."}' \
     http://localhost:8081/api/links

# Add multiple links
curl -H 'Content-Type: application/json' \
     -d '{"urls":["https://mega.nz/folder/1","https://mega.nz/folder/2"]}' \
     http://localhost:8081/api/links/bulk

# Delete a link
curl -X DELETE http://localhost:8081/api/links/<id>
```

### Authentication
When `API_TOKEN` is set, include the Bearer token in requests:

```bash
curl -H 'Authorization: Bearer your-token-here' \
     http://localhost:8081/api/status
```

## Docker Deployment

### Build Image
```bash
docker build -t media-pipeline-api .
```

### Docker Compose Integration

Add this service to your existing `/opt/media-pipeline/docker-compose.yml`:

```yaml
services:
  media-api:
    build: ./api
    container_name: media-api
    network_mode: host                 # Simplest for localhost binding
    environment:
      PORT: 8081
      PIPELINE_CONTAINER: media-pipeline
      GLUETUN_CONTAINER: gluetun
      TOR_CONTAINER: torproxy
      LINKS_FILE: /opt/media-pipeline/data/links.txt
      # API_TOKEN: "set-me"            # Optional
    volumes:
      - /var/run/docker.sock:/var/run/docker.sock
      - /opt/media-pipeline/data:/opt/media-pipeline/data:rw
    restart: unless-stopped
```

## Project Structure

```
api/
├── src/
│   ├── server.ts              # Main Express server
│   ├── routes/
│   │   ├── status.ts          # Status endpoints + SSE
│   │   ├── pipeline.ts        # Container start/stop
│   │   ├── logs.ts            # Log streaming SSE
│   │   └── links.ts           # Link CRUD operations
│   ├── lib/
│   │   ├── docker.ts          # Docker API helpers
│   │   ├── files.ts           # Atomic file operations
│   │   ├── sse.ts             # Server-Sent Events utilities
│   │   ├── auth.ts            # Bearer token middleware
│   │   └── types.ts           # TypeScript types + Zod schemas
│   └── middleware/
│       └── error.ts           # Error handling middleware
├── Dockerfile
├── package.json
├── tsconfig.json
├── .env.example
└── README.md
```

## Security Features

- **Container Allow-listing**: Only specified containers can be controlled
- **Rate Limiting**: 100 requests/5min globally, 30 mutations/min
- **CORS**: Restricted origins (localhost:8080, localhost:3000)
- **Helmet**: Security headers with CSP
- **Optional Authentication**: Bearer token validation
- **Bind to localhost**: Only accepts connections on 127.0.0.1
- **Input Validation**: Zod schemas for all request data

## Error Handling

All errors return consistent JSON format:

```json
{
  "error": {
    "code": "ERROR_CODE",
    "message": "Human readable message",
    "details": {}
  }
}
```

## Development Notes

- SSE connections auto-reconnect with 3-second retry
- File operations are atomic (write to temp file, then rename)
- Docker events trigger real-time status updates
- Log streaming handles container restarts gracefully
- Link IDs are SHA-256 hashes of URLs for consistency

## Testing

```bash
# Run test suite
npm test

# Run tests in watch mode
npm run test:watch
```

## License

This project is part of the media pipeline dashboard system.