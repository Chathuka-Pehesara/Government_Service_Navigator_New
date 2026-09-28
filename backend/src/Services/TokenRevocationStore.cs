using Government_Service_Navigator.Backend.Data.Context;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Caching.Memory;
using StackExchange.Redis;

namespace Government_Service_Navigator.Backend.Services
{
    /// <summary>
    /// The revoked-token check that runs on every authenticated request (ADR-0001), kept off the
    /// database hot path. PostgreSQL (RevokedTokens) stays the durable record; logout writes through.
    /// - With Redis: one key per revoked jti that expires with the token, shared by every API instance.
    /// - Without Redis (single instance): a short in-process cache of "not revoked" answers; a logout
    ///   on this instance takes effect immediately.
    /// If Redis is unreachable the check falls back to the database so a logout always holds.
    /// </summary>
    public class TokenRevocationStore
    {
        private static readonly TimeSpan LocalNotRevokedTtl = TimeSpan.FromSeconds(30);

        private readonly IConnectionMultiplexer? _redis;
        private readonly IMemoryCache _memory;
        private readonly ILogger<TokenRevocationStore> _logger;

        public TokenRevocationStore(IServiceProvider services, IMemoryCache memory, ILogger<TokenRevocationStore> logger)
        {
            _redis = services.GetService<IConnectionMultiplexer>();
            _memory = memory;
            _logger = logger;
        }

        public async Task<bool> IsRevokedAsync(string jti, AppDbContext db)
        {
            if (_redis != null)
            {
                try
                {
                    return await _redis.GetDatabase().KeyExistsAsync(CacheKeys.RevokedToken(jti));
                }
                catch (RedisException ex)
                {
                    _logger.LogWarning(ex, "Redis unavailable for the revocation check; using the database");
                    return await db.RevokedTokens.AnyAsync(t => t.Jti == jti);
                }
            }

            var localKey = CacheKeys.RevokedToken(jti);
            if (_memory.TryGetValue(localKey, out bool revoked)) return revoked;

            revoked = await db.RevokedTokens.AnyAsync(t => t.Jti == jti);
            // Revoked answers never change, so they can live until the process restarts
            _memory.Set(localKey, revoked, revoked ? TimeSpan.FromHours(24) : LocalNotRevokedTtl);
            return revoked;
        }

        // Called after the RevokedTokens row is saved
        public async Task RevokeAsync(string jti, DateTime expiresAt)
        {
            _memory.Set(CacheKeys.RevokedToken(jti), true, TimeSpan.FromHours(24));

            var ttl = expiresAt - DateTime.UtcNow;
            if (_redis == null || ttl <= TimeSpan.Zero) return;
            try
            {
                await _redis.GetDatabase().StringSetAsync(CacheKeys.RevokedToken(jti), "1", ttl);
            }
            catch (RedisException ex)
            {
                // The database row still revokes it; the Redis check falls back to it only when Redis is down
                _logger.LogError(ex, "Could not write revoked token {Jti} to Redis", jti);
            }
        }

        // One-off on startup: tokens revoked before Redis was enabled must stay revoked
        public async Task CopyDatabaseToRedisAsync(AppDbContext db)
        {
            if (_redis == null) return;
            var now = DateTime.UtcNow;
            var active = await db.RevokedTokens.AsNoTracking()
                .Where(t => t.ExpiresAt > now)
                .Select(t => new { t.Jti, t.ExpiresAt })
                .ToListAsync();

            var redisDb = _redis.GetDatabase();
            foreach (var token in active)
            {
                await redisDb.StringSetAsync(CacheKeys.RevokedToken(token.Jti), "1", token.ExpiresAt - now);
            }
            if (active.Count > 0) _logger.LogInformation("Copied {Count} revoked token(s) to Redis", active.Count);
        }
    }
}
