using AgenticAi.Agents.IntakePlanningAgent;
using AgenticAi.Services;
using Backend.Data;
using System.IdentityModel.Tokens.Jwt;
using System.Text;
using DotNetEnv;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.EntityFrameworkCore;
using Microsoft.IdentityModel.Tokens;
using Government_Service_Navigator.Backend.Data;
using Government_Service_Navigator.Backend.Data.Context;
using Government_Service_Navigator.Backend.Services;
using Government_Service_Navigator.Backend.Services.Interfaces;
using Microsoft.OpenApi.Models;
using Npgsql;
using Stripe;
using System.Threading.RateLimiting;
using Government_Service_Navigator.Backend.Data.Interceptors;
using Government_Service_Navigator.Backend.Hubs;
using Microsoft.AspNetCore.ResponseCompression;
using Microsoft.AspNetCore.SignalR;
using Microsoft.Extensions.Caching.Hybrid;
using StackExchange.Redis;
using Government_Service_Navigator.AgenticAi.Tools.CheckDuplicateApplication;
using Government_Service_Navigator.AgenticAi.Agents.ValidationSafety;
using Government_Service_Navigator.AgenticAi.Config;
using Government_Service_Navigator.AgenticAi.Orchestration;
using Government_Service_Navigator.AgenticAi.Tools.CheckDuplicateApplication;
using Government_Service_Navigator.AgenticAi.Tools.ValidateSchema;
using Government_Service_Navigator.AgenticAi.Agents.EligibilityDocumentAgent;
using Government_Service_Navigator.AgenticAi.Agents.EligibilityDocumentAgent.Chunking;
using Government_Service_Navigator.AgenticAi.Agents.EligibilityDocumentAgent.Retrieval;
using Government_Service_Navigator.AgenticAi.Orchestration;
using Government_Service_Navigator.AgenticAi.Tools.CheckEligibilityRules;
using Government_Service_Navigator.AgenticAi.Tools.GetDocumentRequirements;
using Government_Service_Navigator.AgenticAi.Agents.ActionToolAgent;
using Government_Service_Navigator.AgenticAi.Agents.ActionToolAgent.Retrieval;
using Government_Service_Navigator.AgenticAi.Tools.CalculateFee;
using Government_Service_Navigator.AgenticAi.Tools.FindAppointmentSlot;
using Government_Service_Navigator.AgenticAi.Tools.PrefillApplication;




// Load environment variables from .env file
Env.Load();
StripeConfiguration.ApiKey = Environment.GetEnvironmentVariable("STRIPE_SECRET_KEY");

var builder = WebApplication.CreateBuilder(args);

// Add services to the container.

// 1. Setup PostgreSQL
// If DATABASE_URL is set (e.g. a Neon connection string), prefer it and require SSL.
// Otherwise fall back to the local DB_HOST/DB_PORT/DB_NAME/DB_USER/DB_PASSWORD settings.
var databaseUrl = Environment.GetEnvironmentVariable("DATABASE_URL");
string connectionString;

if (!string.IsNullOrEmpty(databaseUrl))
{
    var uri = new Uri(databaseUrl);
    var userInfo = uri.UserInfo.Split(':', 2);

    var npgsqlBuilder = new NpgsqlConnectionStringBuilder
    {
        Host = uri.Host,
        Port = uri.Port > 0 ? uri.Port : 5432,
        Database = uri.AbsolutePath.TrimStart('/'),
        Username = Uri.UnescapeDataString(userInfo[0]),
        Password = userInfo.Length > 1 ? Uri.UnescapeDataString(userInfo[1]) : string.Empty,
        SslMode = SslMode.Require,
        // Use Neon's pooled connection string (host contains "-pooler"). Its PgBouncer runs in
        // transaction mode, so keep Npgsql multiplexing off and cap the local pool.
        MaxPoolSize = int.TryParse(Environment.GetEnvironmentVariable("DB_MAX_POOL_SIZE"), out var maxPool) ? maxPool : 50,
        Multiplexing = false,
        // Keeps idle pooled connections alive through NAT/load balancers between requests
        KeepAlive = 30
    };

    connectionString = npgsqlBuilder.ConnectionString;
}
else
{
        var dbHost = Environment.GetEnvironmentVariable("DB_HOST");
    var dbPort = Environment.GetEnvironmentVariable("DB_PORT");
    var dbName = Environment.GetEnvironmentVariable("DB_NAME");
    var dbUser = Environment.GetEnvironmentVariable("DB_USER");
    var dbPassword = Environment.GetEnvironmentVariable("DB_PASSWORD");

    if (string.IsNullOrEmpty(dbHost) || string.IsNullOrEmpty(dbPort) || string.IsNullOrEmpty(dbName) || string.IsNullOrEmpty(dbUser) || string.IsNullOrEmpty(dbPassword))
    {
        throw new InvalidOperationException("One or more required database environment variables are missing.");
    }

    connectionString = $"Host={dbHost};Port={dbPort};Database={dbName};Username={dbUser};Password={dbPassword}";
}

// 1.5 Register the Vector Database for the RAG Agent
var vectorConnectionString = builder.Configuration.GetConnectionString("VectorDb");
builder.Services.AddDbContext<VectorDbContext>(options =>
    options.UseNpgsql(vectorConnectionString, o => o.UseVector()));

// Register the Main Application Database. The interceptors refresh caches and push realtime
// updates after any commit that changes what citizens or officers see (Data/Interceptors).
builder.Services.AddSingleton<CitizenChangeDispatcher>();
builder.Services.AddSingleton<CitizenChangeInterceptor>();
builder.Services.AddSingleton<CitizenChangeTransactionInterceptor>();
builder.Services.AddDbContext<AppDbContext>((sp, options) => options
    .UseNpgsql(connectionString)
    .AddInterceptors(
        sp.GetRequiredService<CitizenChangeInterceptor>(),
        sp.GetRequiredService<CitizenChangeTransactionInterceptor>()));

// 1.6 Caching and realtime (docs/performance-and-redis.md, phases 3-4).
// REDIS_URL is optional: without it the cache is in-process only and SignalR runs on this instance.
var redisUrl = Environment.GetEnvironmentVariable("REDIS_URL");
var signalR = builder.Services.AddSignalR();
if (!string.IsNullOrEmpty(redisUrl))
{
    var redisOptions = ConfigurationOptions.Parse(redisUrl);
    redisOptions.AbortOnConnectFail = false; // start even if Redis is down, reconnect in the background
    var redis = ConnectionMultiplexer.Connect(redisOptions);
    builder.Services.AddSingleton<IConnectionMultiplexer>(redis);

    // Shared (L2) cache behind HybridCache
    builder.Services.AddStackExchangeRedisCache(o =>
    {
        o.ConnectionMultiplexerFactory = () => Task.FromResult<IConnectionMultiplexer>(redis);
        o.InstanceName = "gsn:";
    });

    // Lets Clients.User(...) reach connections on any API instance
    signalR.AddStackExchangeRedis(o =>
    {
        o.ConnectionFactory = _ => Task.FromResult<IConnectionMultiplexer>(redis);
        o.Configuration.ChannelPrefix = RedisChannel.Literal("gsn-signalr");
    });
    Console.WriteLine("Redis configured for cache, token revocation and the SignalR backplane.");
}
builder.Services.AddSingleton<IUserIdProvider, NicUserIdProvider>();
builder.Services.AddMemoryCache();
builder.Services.AddHybridCache(o =>
{
    o.DefaultEntryOptions = new HybridCacheEntryOptions
    {
        Expiration = TimeSpan.FromMinutes(10),          // Redis
        LocalCacheExpiration = TimeSpan.FromSeconds(30) // in-process memory
    };
});
builder.Services.AddSingleton<TokenRevocationStore>();
builder.Services.AddSingleton<ICitizenChangeNotifier, CitizenChangeNotifier>();

// 1.7 Compress JSON responses (lists shrink 70-90%, which matters most on mobile data)
builder.Services.AddResponseCompression(o =>
{
    o.EnableForHttps = true;
    o.Providers.Add<BrotliCompressionProvider>();
    o.Providers.Add<GzipCompressionProvider>();
});
builder.Services.Configure<BrotliCompressionProviderOptions>(o => o.Level = System.IO.Compression.CompressionLevel.Fastest);
builder.Services.Configure<GzipCompressionProviderOptions>(o => o.Level = System.IO.Compression.CompressionLevel.Fastest);

// 2. Setup Dependency Injection


builder.Services.AddScoped<IAuthService, AuthService>();
builder.Services.AddControllers().AddJsonOptions(options =>
{
    options.JsonSerializerOptions.ReferenceHandler = System.Text.Json.Serialization.ReferenceHandler.IgnoreCycles;
})
.ConfigureApiBehaviorOptions(options =>
{
    // One shape for every validation failure, which the mobile and web clients both read:
    // { message: "all errors in one line", errors: ["..."], fields: { "email": "..." } }
    options.InvalidModelStateResponseFactory = context =>
    {
        var fields = new Dictionary<string, string>();
        var errors = new List<string>();
        foreach (var (key, entry) in context.ModelState)
        {
            // "$.amount" means the JSON value for amount couldn't be read; "$" or "" is the whole body
            var isJsonError = key.StartsWith('$');
            var field = key.TrimStart('$', '.');
            foreach (var error in entry.Errors)
            {
                var message = isJsonError || error.Exception != null
                    ? (field.Length == 0 ? "The request body is missing or is not valid JSON." : $"{field} has an invalid value.")
                    : error.ErrorMessage;
                if (!errors.Contains(message)) errors.Add(message);
                if (field.Length > 0) fields.TryAdd(char.ToLowerInvariant(field[0]) + field[1..], message);
            }
        }
        return new Microsoft.AspNetCore.Mvc.BadRequestObjectResult(new
        {
            message = string.Join(" ", errors),
            errors,
            fields
        });
    };
});
builder.Services.AddScoped<IAdminService, AdminService>();
builder.Services.AddScoped<IVerificationService, VerificationService>();
builder.Services.AddScoped<ICitizenApplicationsService, CitizenApplicationsService>();
builder.Services.AddScoped<ITemplateService, TemplateService>();
builder.Services.AddScoped<IServiceCatalogService, ServiceCatalogService>();
builder.Services.AddScoped<IDuplicateApplicationRepository, DuplicateApplicationRepository>();
builder.Services.AddScoped<IVerificationTaskEnqueuer, VerificationTaskEnqueuerService>();

builder.Services.AddScoped<IRefundService, Government_Service_Navigator.Backend.Services.RefundService>();
builder.Services.AddScoped<IPaymentService, PaymentService>();
builder.Services.AddScoped<IInstallmentPlanService, InstallmentPlanService>();
builder.Services.AddScoped<IAnalyticsService, AnalyticsService>();
builder.Services.AddScoped<IAnomalyDetectionService, AnomalyDetectionService>();
builder.Services.AddScoped<INotificationService, NotificationService>();
builder.Services.AddScoped<IVectorRetriever, VectorRetrieverService>();
builder.Services.AddScoped<IEligibilityVectorRetriever, EligibilityVectorRetrieverService>();
builder.Services.AddScoped<IDocumentChunker, DocumentChunker>();
builder.Services.AddScoped<IEligibilityDocumentAgent, EligibilityDocumentAgent>();
builder.Services.AddScoped<IAgent2WorkflowOrchestrator, Agent2WorkflowOrchestrator>();
builder.Services.AddScoped<ICheckEligibilityRulesTool, CheckEligibilityRulesTool>();
builder.Services.AddScoped<IGetDocumentRequirementsTool, GetDocumentRequirementsTool>();
builder.Services.AddScoped<IDocumentRequirementRepository, DocumentRequirementRepository>();

// Groq AI LLM Service for Autonomous Agents
var groqApiKey = Environment.GetEnvironmentVariable("GROQ_API_KEY") ?? builder.Configuration["Groq:ApiKey"];
var groqModel = Environment.GetEnvironmentVariable("GROQ_MODEL") ?? builder.Configuration["Groq:Model"] ?? "openai/gpt-oss-120b";
builder.Services.AddSingleton<ILlmService>(new GroqLlmService(groqApiKey, groqModel));

// Agent 1: Intake & Planning Tools
builder.Services.AddScoped<Government_Service_Navigator.AgenticAi.Tools.SearchServiceCatalog.ISearchServiceCatalogTool, Government_Service_Navigator.AgenticAi.Tools.SearchServiceCatalog.SearchServiceCatalogTool>();
builder.Services.AddScoped<Government_Service_Navigator.AgenticAi.Tools.RecommendServices.IRecommendServicesTool, Government_Service_Navigator.AgenticAi.Tools.RecommendServices.RecommendServicesTool>();
builder.Services.AddScoped<IIntakePlanningAgent, IntakePlanningAgent>();
builder.Services.AddScoped<IFeeScheduleRepository, FeeScheduleRepository>();
builder.Services.AddScoped<IApplicationTemplateRepository, ApplicationTemplateRepository>();
builder.Services.AddScoped<ICalculateFeeTool, CalculateFeeTool>();
builder.Services.AddScoped<IFindAppointmentSlotTool, FindAppointmentSlotTool>();
builder.Services.AddScoped<IPrefillApplicationTool, PrefillApplicationTool>();
builder.Services.AddScoped<IActionVectorRetriever, ActionVectorRetrieverService>();
builder.Services.AddScoped<IActionToolAgent, ActionToolAgent>();
builder.Services.AddScoped<IAgent3WorkflowOrchestrator, Agent3WorkflowOrchestrator>();
// Agent 4: Validation & Safety Agent and Orchestrator
builder.Services.AddScoped<ISchemaValidatorTool, SchemaValidatorTool>();
builder.Services.AddScoped<IDuplicateCheckTool, DuplicateCheckTool>();
builder.Services.AddScoped<IValidationSafetyAgent, ValidationSafetyAgent>();
builder.Services.AddScoped<IValidationOrchestrator, ValidationOrchestrator>();
builder.Services.AddSingleton(new ValidationSafetyConfig
{
    BlockDuplicateSubmissions = false, // Duplicates are flagged for officers, not hard-blocked
    MinimumLegalAge = 16,
    EnableAdversarialDefense = true
});

// Master Supervisor Delegate Tools (Agent 1, Agent 2, Agent 3, Agent 4)
builder.Services.AddScoped<Government_Service_Navigator.AgenticAi.Orchestration.Supervisor.Tools.IIntakeSupervisorTool, Government_Service_Navigator.AgenticAi.Orchestration.Supervisor.Tools.IntakeSupervisorTool>();
builder.Services.AddScoped<Government_Service_Navigator.AgenticAi.Orchestration.Supervisor.Tools.IEligibilitySupervisorTool, Government_Service_Navigator.AgenticAi.Orchestration.Supervisor.Tools.EligibilitySupervisorTool>();
builder.Services.AddScoped<Government_Service_Navigator.AgenticAi.Orchestration.Supervisor.Tools.IAdministrativeActionTool, Government_Service_Navigator.AgenticAi.Orchestration.Supervisor.Tools.AdministrativeActionTool>();
builder.Services.AddScoped<Government_Service_Navigator.AgenticAi.Orchestration.Supervisor.Tools.ISafetyAuditTool, Government_Service_Navigator.AgenticAi.Orchestration.Supervisor.Tools.SafetyAuditTool>();

builder.Services.AddScoped<IApplicationContextProvider, ApplicationContextProviderService>();
builder.Services.AddScoped<IMasterSupervisorAgent, MasterSupervisorAgent>();
builder.Services.AddScoped<IApplicationDraftingService, ApplicationDraftingService>();
builder.Services.AddSingleton<IEmbeddingService, LocalEmbeddingService>();
builder.Services.AddHostedService<InstallmentMonitorService>();
builder.Services.AddHostedService<DataRepairService>();




// 3. Setup CORS (Crucial for Flutter/Mobile/Web app connectivity)
builder.Services.AddCors(options =>
{
    options.AddPolicy("AllowAllOrigins",
        policy => policy
            .AllowAnyOrigin()
            .AllowAnyHeader()
            .AllowAnyMethod());
});

// 3.5 Rate limiting: one client (an old app build still polling every 2 s, a stuck script) must not
// be able to use the capacity of hundreds of normal users. Keyed by citizen NIC, officer email, or IP.
builder.Services.AddRateLimiter(options =>
{
    options.RejectionStatusCode = StatusCodes.Status429TooManyRequests;
    options.GlobalLimiter = PartitionedRateLimiter.Create<HttpContext, string>(ctx =>
    {
        // Realtime hub connections are long-lived and not counted
        if (ctx.Request.Path.StartsWithSegments("/hubs"))
        {
            return RateLimitPartition.GetNoLimiter("hubs");
        }

        var key = ctx.User.FindFirst("nicNumber")?.Value
                  ?? ctx.User.FindFirst(System.Security.Claims.ClaimTypes.Email)?.Value
                  ?? ctx.Connection.RemoteIpAddress?.ToString()
                  ?? "anonymous";
        return RateLimitPartition.GetFixedWindowLimiter(key, _ => new FixedWindowRateLimiterOptions
        {
            PermitLimit = int.TryParse(Environment.GetEnvironmentVariable("RATE_LIMIT_PER_MINUTE"), out var limit) ? limit : 120,
            Window = TimeSpan.FromMinutes(1),
            QueueLimit = 0
        });
    });
});

// 4. Setup JWT Authentication
var jwtKey = Environment.GetEnvironmentVariable("JWT_KEY");
var jwtIssuer = Environment.GetEnvironmentVariable("JWT_ISSUER");
var jwtAudience = Environment.GetEnvironmentVariable("JWT_AUDIENCE");

if (!string.IsNullOrEmpty(jwtKey))
{
    builder.Services.AddAuthentication(options =>
    {
        options.DefaultAuthenticateScheme = JwtBearerDefaults.AuthenticationScheme;
        options.DefaultChallengeScheme = JwtBearerDefaults.AuthenticationScheme;
    })
    .AddJwtBearer(options =>
    {
        options.TokenValidationParameters = new TokenValidationParameters
        {
            ValidateIssuer = true,
            ValidateAudience = true,
            ValidateLifetime = true,
            ValidateIssuerSigningKey = true,
            ValidIssuer = jwtIssuer,
            ValidAudience = jwtAudience,
            IssuerSigningKey = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(jwtKey))
        };

        options.Events = new JwtBearerEvents
        {
            OnMessageReceived = context =>
            {
                var accessToken = context.Request.Query["token"];
                var path = context.HttpContext.Request.Path;
                if (!string.IsNullOrEmpty(accessToken) && path.StartsWithSegments("/api/verification/documents", StringComparison.OrdinalIgnoreCase))
                {
                    context.Token = accessToken;
                }

                // WebSockets cannot send an Authorization header, so SignalR sends ?access_token=
                var hubToken = context.Request.Query["access_token"];
                if (!string.IsNullOrEmpty(hubToken) && path.StartsWithSegments("/hubs"))
                {
                    context.Token = hubToken;
                }
                return Task.CompletedTask;
            },
            OnTokenValidated = async context =>
            {
                var jti = context.Principal?.FindFirst(JwtRegisteredClaimNames.Jti)?.Value;
                if (string.IsNullOrEmpty(jti))
                {
                    return;
                }

                // Redis (or a short in-process cache) instead of a database round trip on every request
                var revocation = context.HttpContext.RequestServices.GetRequiredService<TokenRevocationStore>();
                var dbContext = context.HttpContext.RequestServices.GetRequiredService<AppDbContext>();
                var isRevoked = await revocation.IsRevokedAsync(jti, dbContext);
                if (isRevoked)
                {
                    context.Fail("Token has been revoked.");
                }
            }
        };
    });
}

// 5. Setup Swagger/OpenAPI
builder.Services.AddEndpointsApiExplorer();
builder.Services.AddSwaggerGen(c =>
{
    c.SwaggerDoc("v1", new OpenApiInfo { Title = "Government Service Navigator API", Version = "v1" });
    c.AddSecurityDefinition("Bearer", new OpenApiSecurityScheme
    {
        Description = "JWT Authorization header using the Bearer scheme. Example: \"Authorization: Bearer {token}\"",
        Name = "Authorization",
        In = ParameterLocation.Header,
        Type = SecuritySchemeType.Http,
        Scheme = "bearer"
    });
    c.AddSecurityRequirement(new OpenApiSecurityRequirement
    {
        {
            new OpenApiSecurityScheme
            {
                Reference = new OpenApiReference
                {
                    Type = ReferenceType.SecurityScheme,
                    Id = "Bearer"
                }
            },
            Array.Empty<string>()
        }
    });
});


var app = builder.Build();

// 6. Automatically Apply Migrations at Startup (Fixes Read/Write errors instantly)
using (var scope = app.Services.CreateScope())
{
    var services = scope.ServiceProvider;
    try
    {
        var context = services.GetRequiredService<AppDbContext>();
        try
        {
            context.Database.Migrate(); 
            Console.WriteLine("Database migrations applied successfully.");
        }
        catch (Exception mEx)
        {
            Console.WriteLine($"Database migration note (proceeding with schema ensure): {mEx.Message}");
        }

        // Indexes for the hot read paths (citizen app, officer queues, payments). Run on their own
        // so a failure in the larger schema block below cannot skip them. Mirrored in AppDbContext.
        try
        {
            context.Database.ExecuteSqlRaw(@"
CREATE INDEX IF NOT EXISTS ""IX_VerificationTasks_CitizenNic_CreatedDate"" ON ""VerificationTasks"" (""CitizenNic"", ""CreatedDate"" DESC);
CREATE INDEX IF NOT EXISTS ""IX_VerificationTasks_ApplicationId"" ON ""VerificationTasks"" (""ApplicationId"");
CREATE INDEX IF NOT EXISTS ""IX_VerificationTasks_Status_CreatedDate"" ON ""VerificationTasks"" (""Status"", ""CreatedDate"" DESC);
CREATE INDEX IF NOT EXISTS ""IX_ApplicationSubmissions_CitizenNic"" ON ""ApplicationSubmissions"" (""CitizenNic"");
CREATE INDEX IF NOT EXISTS ""IX_Payments_ApplicationId"" ON ""Payments"" (""ApplicationId"");
CREATE INDEX IF NOT EXISTS ""IX_AuditLogs_ApplicationId"" ON ""AuditLogs"" (""ApplicationId"");
CREATE INDEX IF NOT EXISTS ""IX_AuditLogs_Timestamp"" ON ""AuditLogs"" (""Timestamp"" DESC);
CREATE INDEX IF NOT EXISTS ""IX_OfficerReviews_TaskId"" ON ""OfficerReviews"" (""TaskId"");
CREATE INDEX IF NOT EXISTS ""IX_Users_NicNumber"" ON ""Users"" (""NicNumber"");
CREATE INDEX IF NOT EXISTS ""IX_Templates_ServiceProcedureId"" ON ""Templates"" (""ServiceProcedureId"");
CREATE INDEX IF NOT EXISTS ""IX_RevokedTokens_ExpiresAt"" ON ""RevokedTokens"" (""ExpiresAt"");
");
        }
        catch (Exception iEx)
        {
            Console.WriteLine($"Index creation note: {iEx.Message}");
        }

        // Refunds carry their department; older rows take it from the payment's application
        try
        {
            context.Database.ExecuteSqlRaw(@"
ALTER TABLE ""RefundRequests"" ADD COLUMN IF NOT EXISTS ""DepartmentName"" text NULL;
UPDATE ""RefundRequests"" r
SET ""DepartmentName"" = s.""CurrentDepartment""
FROM ""Payments"" p
JOIN ""ApplicationSubmissions"" s ON s.""Id"" = p.""ApplicationId""
WHERE r.""PaymentId"" = p.""Id"" AND r.""DepartmentName"" IS NULL AND s.""CurrentDepartment"" IS NOT NULL;
CREATE INDEX IF NOT EXISTS ""IX_RefundRequests_DepartmentName"" ON ""RefundRequests"" (""DepartmentName"");
");
        }
        catch (Exception rdEx)
        {
            Console.WriteLine($"Refund department column note: {rdEx.Message}");
        }

        // Older bookings were saved with the "CITIZEN" placeholder; take the NIC from their application
        try
        {
            context.Database.ExecuteSqlRaw(@"
UPDATE ""CollectionBookings"" b
SET ""CitizenNic"" = s.""CitizenNic""
FROM ""ApplicationSubmissions"" s
WHERE s.""Id"" = b.""ApplicationId""
  AND (b.""CitizenNic"" IS NULL OR b.""CitizenNic"" = '' OR UPPER(b.""CitizenNic"") = 'CITIZEN')
  AND COALESCE(s.""CitizenNic"", '') <> '';
");
        }
        catch (Exception cbEx)
        {
            // CollectionBookings is created on first use, so it may not exist yet
            Console.WriteLine($"Booking NIC backfill note: {cbEx.Message}");
        }

        // Tokens revoked before Redis was enabled must stay revoked
        try
        {
            services.GetRequiredService<TokenRevocationStore>().CopyDatabaseToRedisAsync(context).GetAwaiter().GetResult();
        }
        catch (Exception rEx)
        {
            Console.WriteLine($"Revoked token copy to Redis failed: {rEx.Message}");
        }

        // Migrations are gitignored, so tables and new columns are ensured with idempotent SQL
        context.Database.ExecuteSqlRaw(@"
CREATE TABLE IF NOT EXISTS ""AgentDrafts"" (
    ""Id"" integer GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
    ""ApplicationId"" integer NOT NULL,
    ""DraftJson"" text NOT NULL,
    ""CreatedAt"" timestamp with time zone NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS ""IX_AgentDrafts_ApplicationId"" ON ""AgentDrafts"" (""ApplicationId"");
CREATE TABLE IF NOT EXISTS ""SubmissionDocuments"" (
    ""Id"" uuid PRIMARY KEY,
    ""ApplicationId"" integer NULL,
    ""FieldLabel"" text NOT NULL,
    ""FileName"" text NOT NULL,
    ""ContentType"" text NOT NULL,
    ""SizeBytes"" bigint NOT NULL,
    ""Content"" bytea NOT NULL,
    ""UploaderNic"" text NOT NULL,
    ""UploadedAt"" timestamp with time zone NOT NULL
);
CREATE INDEX IF NOT EXISTS ""IX_SubmissionDocuments_ApplicationId"" ON ""SubmissionDocuments"" (""ApplicationId"");
CREATE TABLE IF NOT EXISTS ""InstallmentPlans"" (
    ""Id"" integer GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
    ""PaymentId"" integer NOT NULL,
    ""NumberOfInstallments"" integer NOT NULL,
    ""TotalAmount"" numeric NOT NULL,
    ""Status"" text NOT NULL,
    ""CreatedDate"" timestamp with time zone NOT NULL,
    CONSTRAINT ""FK_InstallmentPlans_Payments_PaymentId""
        FOREIGN KEY (""PaymentId"") REFERENCES ""Payments"" (""Id"") ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS ""IX_InstallmentPlans_PaymentId"" ON ""InstallmentPlans"" (""PaymentId"");
CREATE TABLE IF NOT EXISTS ""Installments"" (
    ""Id"" integer GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
    ""InstallmentPlanId"" integer NOT NULL,
    ""InstallmentNumber"" integer NOT NULL,
    ""Amount"" numeric NOT NULL,
    ""DueDate"" timestamp with time zone NOT NULL,
    ""Status"" text NOT NULL,
    ""PaidDate"" timestamp with time zone NULL,
    CONSTRAINT ""FK_Installments_InstallmentPlans_InstallmentPlanId""
        FOREIGN KEY (""InstallmentPlanId"") REFERENCES ""InstallmentPlans"" (""Id"") ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS ""IX_Installments_InstallmentPlanId"" ON ""Installments"" (""InstallmentPlanId"");
ALTER TABLE ""Installments"" ADD COLUMN IF NOT EXISTS ""PaymentMethod"" text NULL;
ALTER TABLE ""Installments"" ADD COLUMN IF NOT EXISTS ""StripeSessionId"" text NULL;
ALTER TABLE ""Installments"" ADD COLUMN IF NOT EXISTS ""ReceiptId"" uuid NULL;
CREATE TABLE IF NOT EXISTS ""PaymentReceipts"" (
    ""Id"" uuid PRIMARY KEY,
    ""InstallmentId"" integer NOT NULL,
    ""FileName"" text NOT NULL,
    ""ContentType"" text NOT NULL,
    ""SizeBytes"" bigint NOT NULL,
    ""Content"" bytea NOT NULL,
    ""UploadedAt"" timestamp with time zone NOT NULL
);
CREATE INDEX IF NOT EXISTS ""IX_PaymentReceipts_InstallmentId"" ON ""PaymentReceipts"" (""InstallmentId"");
ALTER TABLE ""Installments"" ADD COLUMN IF NOT EXISTS ""ReminderSentAt"" timestamp with time zone NULL;
CREATE TABLE IF NOT EXISTS ""CitizenNotifications"" (
    ""Id"" integer GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
    ""CitizenNic"" text NOT NULL,
    ""UserEmail"" text NOT NULL,
    ""Type"" text NOT NULL,
    ""Title"" text NOT NULL,
    ""Message"" text NOT NULL,
    ""ApplicationId"" integer NULL,
    ""InstallmentPlanId"" integer NULL,
    ""CreatedAt"" timestamp with time zone NOT NULL,
    ""ReadAt"" timestamp with time zone NULL
);
CREATE INDEX IF NOT EXISTS ""IX_CitizenNotifications_CitizenNic"" ON ""CitizenNotifications"" (""CitizenNic"");
ALTER TABLE ""ApplicationSubmissions"" ADD COLUMN IF NOT EXISTS ""CurrentStage"" integer NOT NULL DEFAULT 1;
ALTER TABLE ""ApplicationSubmissions"" ADD COLUMN IF NOT EXISTS ""MaxStages"" integer NOT NULL DEFAULT 1;
ALTER TABLE ""ApplicationSubmissions"" ADD COLUMN IF NOT EXISTS ""StageStatus"" text NOT NULL DEFAULT 'PendingReview';
ALTER TABLE ""ApplicationSubmissions"" ADD COLUMN IF NOT EXISTS ""CurrentDepartment"" text NULL;
ALTER TABLE ""ApplicationSubmissions"" ADD COLUMN IF NOT EXISTS ""DepartmentHistoryJson"" text NULL;

ALTER TABLE ""VerificationTasks"" ADD COLUMN IF NOT EXISTS ""CurrentStage"" integer NOT NULL DEFAULT 1;
ALTER TABLE ""VerificationTasks"" ADD COLUMN IF NOT EXISTS ""MaxStages"" integer NOT NULL DEFAULT 1;
ALTER TABLE ""VerificationTasks"" ADD COLUMN IF NOT EXISTS ""CitizenNic"" text NULL;
ALTER TABLE ""VerificationTasks"" ADD COLUMN IF NOT EXISTS ""Department"" text NULL;
ALTER TABLE ""VerificationTasks"" ADD COLUMN IF NOT EXISTS ""StageNumber"" integer NOT NULL DEFAULT 1;

ALTER TABLE ""Templates"" ADD COLUMN IF NOT EXISTS ""Department"" text NULL;
ALTER TABLE ""Templates"" ADD COLUMN IF NOT EXISTS ""StageOrder"" integer NOT NULL DEFAULT 1;
ALTER TABLE ""Templates"" ADD COLUMN IF NOT EXISTS ""StageDescription"" text NULL;

ALTER TABLE ""ServiceProcedures"" ADD COLUMN IF NOT EXISTS ""TotalStages"" integer NOT NULL DEFAULT 1;
ALTER TABLE ""ServiceProcedures"" ADD COLUMN IF NOT EXISTS ""WorkflowDepartments"" text NULL;
-- NEW BOOKING TIME SLOTS TABLE
CREATE TABLE IF NOT EXISTS ""CollectionTimeSlots"" (
    ""Id"" integer GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
    ""DayOfWeek"" integer NOT NULL CHECK (""DayOfWeek"" >= 1 AND ""DayOfWeek"" <= 6), -- 1=Monday to 6=Saturday (Sunday excluded)
    ""StartTime"" time NOT NULL,
    ""EndTime"" time NOT NULL,
    ""MaxCapacity"" integer NOT NULL DEFAULT 5,
    ""IsActive"" boolean NOT NULL DEFAULT TRUE
);
CREATE TABLE IF NOT EXISTS ""CollectionBookings"" (
    ""Id"" integer GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
    ""ApplicationId"" integer NOT NULL,
    ""CitizenNic"" text NOT NULL,
    ""CollectionMethod"" text NOT NULL, -- 'Post' or 'InPerson'
    ""PreferredTimes"" text NULL,
    ""CreatedAt"" timestamp with time zone NOT NULL DEFAULT CURRENT_TIMESTAMP
);


CREATE TABLE IF NOT EXISTS ""Departments"" (
    ""Id"" integer GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
    ""DepartmentCode"" text NOT NULL,
    ""Name"" text NOT NULL,
    ""Category"" text NULL,
    ""LogoUrl"" text NULL,
    ""ContactNumber"" text NULL,
    ""Email"" text NULL,
    ""Website"" text NULL,
    ""Address"" text NULL,
    ""Description"" text NULL,
    ""Status"" text NOT NULL DEFAULT 'Active',
    ""CreatedAt"" timestamp with time zone NOT NULL DEFAULT CURRENT_TIMESTAMP,
    ""UpdatedAt"" timestamp with time zone NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS ""IX_Departments_DepartmentCode"" ON ""Departments"" (""DepartmentCode"");
CREATE UNIQUE INDEX IF NOT EXISTS ""IX_Departments_Name"" ON ""Departments"" (""Name"");
");

        // Seed initial Departments if empty
        if (!context.Departments.Any())
        {
            context.Departments.AddRange(
                new Government_Service_Navigator.Backend.Models.Entities.Department
                {
                    DepartmentCode = "DEP-001",
                    Name = "Department of Immigration & Emigration",
                    Category = "Immigration",
                    ContactNumber = "+94 11 532 9000",
                    Email = "controller@immigration.gov.lk",
                    Website = "https://www.immigration.gov.lk",
                    Address = "Suhurupaya, Subhuthipura Road, Battaramulla",
                    Description = "Responsible for issuing Sri Lankan passports, visas, citizenship, and border control.",
                    Status = "Active",
                    LogoUrl = "https://images.unsplash.com/photo-1541872703-74c5e44368f9?w=128&q=80",
                    CreatedAt = DateTime.UtcNow
                },
                new Government_Service_Navigator.Backend.Models.Entities.Department
                {
                    DepartmentCode = "DEP-002",
                    Name = "Department of Motor Traffic",
                    Category = "Transport",
                    ContactNumber = "+94 11 269 4331",
                    Email = "info@motortraffic.gov.lk",
                    Website = "https://dmt.gov.lk",
                    Address = "PO Box 533, Elvitigala Mawatha, Colombo 05",
                    Description = "Manages vehicle registrations, driving license issuance, and roadworthiness certifications.",
                    Status = "Active",
                    LogoUrl = "https://images.unsplash.com/photo-1549317661-bd32c8ce0db2?w=128&q=80",
                    CreatedAt = DateTime.UtcNow
                },
                new Government_Service_Navigator.Backend.Models.Entities.Department
                {
                    DepartmentCode = "DEP-003",
                    Name = "Police Department",
                    Category = "Police",
                    ContactNumber = "+94 11 242 1111",
                    Email = "hq@police.lk",
                    Website = "https://www.police.lk",
                    Address = "Police Headquarters, Colombo 01",
                    Description = "Enforces law, maintains public order, and issues national police clearance certificates.",
                    Status = "Active",
                    LogoUrl = "https://images.unsplash.com/photo-1589829545856-d10d557cf95f?w=128&q=80",
                    CreatedAt = DateTime.UtcNow
                },
                new Government_Service_Navigator.Backend.Models.Entities.Department
                {
                    DepartmentCode = "DEP-004",
                    Name = "Department of Registration of Persons",
                    Category = "Civil",
                    ContactNumber = "+94 11 522 6100",
                    Email = "drp@drp.gov.lk",
                    Website = "https://drp.gov.lk",
                    Address = "Suhurupaya, Subhuthipura Road, Battaramulla",
                    Description = "Administers National Identity Cards (NIC), smart IDs, and civil citizen registries.",
                    Status = "Active",
                    LogoUrl = "https://images.unsplash.com/photo-1450133064473-71024230f91b?w=128&q=80",
                    CreatedAt = DateTime.UtcNow
                },
                new Government_Service_Navigator.Backend.Models.Entities.Department
                {
                    DepartmentCode = "DEP-005",
                    Name = "Divisional Secretariat",
                    Category = "Public Administration",
                    ContactNumber = "+94 11 269 6211",
                    Email = "contact@pubad.gov.lk",
                    Website = "https://pubad.gov.lk",
                    Address = "Ministry of Public Administration, Independence Square, Colombo 07",
                    Description = "Facilitates regional government administration, grama niladhari services, and local permits.",
                    Status = "Active",
                    LogoUrl = "https://images.unsplash.com/photo-1486406146926-c627a92ad1ab?w=128&q=80",
                    CreatedAt = DateTime.UtcNow
                }
            );
            context.SaveChanges();
            Console.WriteLine("Seeded initial Departments into the database.");
        }

        // Migrate legacy service categories to modern common thematic categories
        var legacyServices = context.ServiceProcedures.ToList();
        bool anyMigrated = false;
        foreach (var srv in legacyServices)
        {
            var oldCat = (srv.Category ?? "").Trim();
            string newCat = oldCat switch
            {
                "Identity" => "Transport & Travel", // GSN-IMM-001 is Passport Application & Renewal
                "Transport" => "Transport & Travel",
                "Police" => "Legal & Security",
                "Commerce" => "Business & Trade",
                "Civil" => "Personal & Family",
                _ => string.Empty
            };
            if (!string.IsNullOrEmpty(newCat) && oldCat != newCat)
            {
                srv.Category = newCat;
                anyMigrated = true;
            }
        }
        if (anyMigrated)
        {
            context.SaveChanges();
            Console.WriteLine("Migrated legacy service categories to common thematic categories.");
        }

        // Remove any orphan tasks with ApplicationId == 0 that may have been created by previous test runs
        var zeroTasks = context.VerificationTasks.Where(t => t.ApplicationId == 0).ToList();
        if (zeroTasks.Any())
        {
            context.VerificationTasks.RemoveRange(zeroTasks);
            context.SaveChanges();
            Console.WriteLine($"Cleaned up {zeroTasks.Count} invalid verification task(s) with ApplicationId 0.");
        }

        // Seed mock VerificationTasks if empty so the UI has something to show!
        if (!context.VerificationTasks.Any())
        {
            context.VerificationTasks.AddRange(
                new Government_Service_Navigator.Backend.Models.Entities.VerificationTask { ApplicationId = 9088, Status = "Pending", CreatedDate = DateTime.UtcNow.AddHours(-1) },
                new Government_Service_Navigator.Backend.Models.Entities.VerificationTask { ApplicationId = 9102, Status = "Pending", CreatedDate = DateTime.UtcNow.AddDays(-3) },
                new Government_Service_Navigator.Backend.Models.Entities.VerificationTask { ApplicationId = 8895, Status = "Approved", CreatedDate = DateTime.UtcNow.AddDays(-5) },
                new Government_Service_Navigator.Backend.Models.Entities.VerificationTask { ApplicationId = 8850, Status = "Rejected", CreatedDate = DateTime.UtcNow.AddDays(-6) }
            );
            context.SaveChanges();
            Console.WriteLine("Seeded mock VerificationTasks into the database.");
        }
    }
    catch (Exception ex)
    {
        Console.WriteLine($"An error occurred while migrating the database: {ex.Message}");
    }
}

// Configure the HTTP request pipeline.
if (app.Environment.IsDevelopment())
{
    app.UseSwagger();
    app.UseSwaggerUI();
}

// app.UseHttpsRedirection();

app.UseResponseCompression();

// 7. Enable CORS globally
app.UseCors("AllowAllOrigins");

app.UseAuthentication();
app.UseRateLimiter(); // after authentication so the limit is per user, not per shared IP
app.UseAuthorization();

app.MapControllers();
app.MapHub<ApplicationHub>(ApplicationHub.Path);

// Docker/Azure set ASPNETCORE_HTTP_PORTS (8080); local runs keep the usual port 5119
var portConfigured = !string.IsNullOrEmpty(Environment.GetEnvironmentVariable("ASPNETCORE_HTTP_PORTS"))
    || !string.IsNullOrEmpty(Environment.GetEnvironmentVariable("ASPNETCORE_URLS"));
if (portConfigured)
    app.Run();
else
    app.Run("http://0.0.0.0:5119");
