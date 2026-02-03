# MoltSecret Infrastructure Recommendations

*Generated: 2026-02-03 | Advisor: Infrastructure*

## Current Stack Assessment

| Layer | Technology | Status |
|-------|------------|--------|
| Frontend | Cloudflare Pages | ✅ Solid choice |
| API | Cloudflare Workers | ✅ Edge-native |
| Database | Cloudflare D1 (SQLite) | ⚠️ Monitor limits |
| DNS | Porkbun → Cloudflare | ✅ Good setup |

---

## Recommendation 1: D1 Database Strategy & Migration Path

### Current D1 Limitations
- **Storage:** 10GB max per database (Pro plan)
- **Rows:** 500M row limit
- **Read replicas:** Limited to Cloudflare's edge locations
- **Write throughput:** Single primary, ~1000 writes/sec typical
- **No JOINs across databases**

### When to Migrate
Trigger migration planning when you hit **any** of these:
- Database > 5GB (50% of limit)
- Write latency > 50ms p95
- Need for complex transactions
- Multi-region write requirements

### Migration Targets (in order of preference)
1. **Turso (libSQL)** — SQLite-compatible, edge-replicated, easy migration
2. **PlanetScale** — MySQL, excellent scaling, branching workflow
3. **Neon** — Postgres, serverless, good for complex queries

### Action Items
- [ ] Set up D1 size monitoring (see Rec #4)
- [ ] Create database abstraction layer now (makes future migration painless)
- [ ] Document all D1-specific SQL patterns in use

---

## Recommendation 2: Multi-Layer Caching Strategy

### Layer 1: Edge Cache (Cloudflare Cache API)
```
Workers KV or Cache API for:
- Public secret metadata (not content!)
- Rate limit counters
- User session tokens
```

**TTL Strategy:**
- Immutable assets: 1 year
- API responses: 60 seconds (stale-while-revalidate)
- User-specific: No edge cache

### Layer 2: Application Cache (Workers KV)
```
Best for:
- Configuration/feature flags
- Frequently accessed lookups
- View count aggregation (batch writes to D1)
```

**Pattern:** Write-through for consistency, write-behind for performance

### Layer 3: Database Query Cache
```
D1 has no built-in query cache.
Implement manually:
- Cache hot queries in KV with 30s TTL
- Invalidate on write
- Use cache-aside pattern
```

### Cost-Performance Tradeoff
| Cache Layer | Read Cost | Latency | Consistency |
|-------------|-----------|---------|-------------|
| Cache API | Free | ~1ms | Eventual |
| Workers KV | $0.50/M | ~10ms | Eventual |
| D1 Direct | $0.001/M | ~20-50ms | Strong |

---

## Recommendation 3: Geographic Distribution Architecture

### Current State
Cloudflare Workers already run at 300+ edge locations. D1 reads are edge-replicated. **Writes go to a single region.**

### Optimization Strategy

#### Short-term (Now)
- Enable **Smart Placement** on Workers (Cloudflare dashboard)
- This moves compute closer to your D1 primary for write-heavy endpoints
- Keep read-heavy endpoints at the edge

#### Medium-term (1000+ DAU)
```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│  US Edge    │     │  EU Edge    │     │  APAC Edge  │
│  (reads)    │     │  (reads)    │     │  (reads)    │
└──────┬──────┘     └──────┬──────┘     └──────┬──────┘
       │                   │                   │
       └───────────────────┼───────────────────┘
                           │
                    ┌──────▼──────┐
                    │  D1 Primary │
                    │  (US-West)  │
                    └─────────────┘
```

#### Long-term (Global scale)
- Migrate to Turso for multi-region writes
- Or implement CQRS: separate read/write paths

### Latency Targets
| Region | Read p50 | Write p50 |
|--------|----------|-----------|
| US | <20ms | <30ms |
| EU | <30ms | <150ms |
| APAC | <50ms | <200ms |

---

## Recommendation 4: Monitoring & Alerting Stack

### Free Tier Stack (Recommended Start)
```
Cloudflare Analytics (built-in)
     ↓
Workers Logs → Logpush → Grafana Cloud (free tier)
     ↓
Uptime: Cloudflare Health Checks + BetterStack (free)
```

### Key Metrics to Track

#### Application Health
- [ ] Request success rate (target: >99.5%)
- [ ] Error rate by endpoint
- [ ] p50/p95/p99 latency per route

#### D1 Database
- [ ] Database size (GB) — **CRITICAL**
- [ ] Read/write operations per minute
- [ ] Query latency by type

#### Business Metrics
- [ ] Secrets created/day
- [ ] Secrets viewed/day
- [ ] Unique users/day

### Alert Thresholds
| Metric | Warning | Critical |
|--------|---------|----------|
| Error rate | >1% | >5% |
| p95 latency | >500ms | >2s |
| D1 size | >5GB | >8GB |
| Worker CPU | >30ms | >50ms |

### Implementation
```javascript
// Add to Worker entry point
export default {
  async fetch(request, env, ctx) {
    const start = Date.now();
    try {
      const response = await handleRequest(request, env);
      ctx.waitUntil(logMetrics(env, {
        path: new URL(request.url).pathname,
        status: response.status,
        duration: Date.now() - start
      }));
      return response;
    } catch (e) {
      ctx.waitUntil(logError(env, e));
      throw e;
    }
  }
}
```

---

## Recommendation 5: Cost Optimization Playbook

### Current Cost Structure (Estimated)
| Service | Free Tier | Paid Threshold |
|---------|-----------|----------------|
| Pages | Unlimited sites | N/A |
| Workers | 100K req/day | $5/mo for 10M |
| D1 | 5M reads/day | $0.001/M after |
| KV | 100K reads/day | $0.50/M after |

### Optimization Strategies

#### 1. Batch D1 Writes
```javascript
// Instead of: await db.insert(secret)
// Use: accumulate in Durable Object, flush every 100ms
```
Saves: 50-80% on write operations

#### 2. Aggressive Edge Caching
```javascript
// Cache public endpoints at edge
return new Response(body, {
  headers: {
    'Cache-Control': 'public, max-age=60, stale-while-revalidate=300'
  }
});
```
Saves: Reduces Worker invocations by 40-60%

#### 3. Smart KV Usage
- Use KV for hot data only (>10 reads/min)
- Cold data stays in D1
- Implement LRU promotion/demotion

#### 4. Right-size Worker Limits
```toml
# wrangler.toml
[limits]
cpu_ms = 10  # Start low, increase as needed
```

### Monthly Cost Projections
| Scale | Requests/mo | Est. Cost |
|-------|-------------|-----------|
| MVP | <3M | $0 (free tier) |
| Growth | 10M | ~$10-15 |
| Scale | 100M | ~$80-120 |
| Big | 1B | ~$500-800 |

### Break-even Analysis
Cloudflare stack becomes expensive vs. traditional hosting at ~500M+ requests/month. But the operational simplicity is worth 2-3x the raw compute cost.

---

## Priority Action Items

1. **This Week:** Set up basic monitoring (Cloudflare dashboard + alerts)
2. **This Month:** Implement caching layer (KV for hot paths)
3. **Quarter:** Add database abstraction layer for future migration
4. **Ongoing:** Review D1 size monthly, plan migration at 5GB

---

*Next review: Check D1 metrics after 30 days of production traffic*
